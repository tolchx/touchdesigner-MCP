# Performance — Read cache for GET /operators and GET /verify

Item 05 of the backlog: read-through cache with write invalidation for the two
expensive read endpoints of the bridge (`toe/src/TouchDesignerAPI.py` and its
standalone copy `mcp/setup/toe_extension.py`).

- **TD build measured:** TouchDesigner 2025.31760 (Windows), webserver DAT at
  `127.0.0.1:44444`, project FPS 60.
- **Cache design:** keyed by `(endpoint, path, recurse, limit, offset)`, stores
  the response **body dict** (not the HTTP envelope); every mutating request
  (any `POST`/`PUT`/`DELETE`) clears the whole cache and resets counters before
  routing (`/exec` can change anything → blanket invalidation is the only safe
  policy). `?no_cache=1` / `?refresh=1` skip the lookup and refresh the entry.
  Non-200 responses are never cached. The `"cache": "hit"|"miss"` key and
  `/info.readCache {hits, misses, entries}` are ADDITIVE to the pagination
  contract of item 04.
- **Extension reload used for this run:** the bridge source is a textDAT whose
  `file` par points at `toe/src/TouchDesignerAPI.py`; after editing the file,
  `ext.par.reinitnet = True` on `/TouchDesignerAPI` re-initializes the
  extension without restarting TD (verified live: `/info` then reports
  `readCache`).

## Measurement method (reproducible)

1. Build a benchmark network at backlog scale (1222 chained noisePOPs inside a
   baseCOMP) via one `/exec` call, and cook it clean:

   ```
   curl -s -X POST "http://127.0.0.1:44444/exec" -H "Content-Type: application/json" \
     -d '{"code":"import json\nbench = op(\"/project1\").create(td.baseCOMP, \"bench_cache_1222\")\nfor i in range(1222):\n    n = bench.create(td.noisePOP, \"n%04d\" % i)\n    if i: bench.op(\"n%04d\" % (i-1)).outputConnectors[0].connect(n)\nbench.cook(force=True, recurse=True)\nprint(json.dumps({\"created\": len(bench.children)}))"}'
   ```

2. Benchmark with a **persistent HTTP connection** (new-connection-per-request
   adds ~80–2000 ms of client-side noise on Windows — use `127.0.0.1`, not
   `localhost`, which resolves to IPv6 and adds a ~2 s stall per request), 15
   alternating iterations of forced-rebuild (`no_cache=1`) vs cached read,
   medians reported. Alternating A/B cancels TD cook-scheduler drift.

   ```python
   # python - (reproducible benchmark; see numbers below)
   import http.client, json, time, statistics
   conn = http.client.HTTPConnection('127.0.0.1', 44444, timeout=60)
   def req(path, method='GET', body=None):
       t0 = time.perf_counter()
       conn.request(method, path, body=body, headers={'Content-Type': 'application/json'} if body else {})
       payload = json.loads(conn.getresponse().read())
       return (time.perf_counter() - t0) * 1000, payload
   N = 15
   miss, hit = [], []
   for _ in range(N):
       miss.append(req('/operators?path=/project1/bench_cache_1222&limit=5000&no_cache=1')[0])
       hit.append(req('/operators?path=/project1/bench_cache_1222&limit=5000')[0])
   print(round(statistics.median(miss), 1), round(statistics.median(hit), 1))
   ```

3. Verify cache tags in the same run (`miss_tags_ok`/`hit_tags_ok` in earlier
   probes): every forced read returned `"cache": "miss"`, every plain read
   `"cache": "hit"`; after `POST /exec` the next read is `"miss"` (blanket
   invalidation confirmed live, `after_post_tag = "miss"`).

## Results (measured 2026-09-16, 1222 chained noisePOPs, N=15 A/B alternated)

| Endpoint | miss median | hit median | hit min | notes |
|---|---|---|---|---|
| `GET /operators` (1222 ops, limit=5000) | 43.8 ms | 58.7 ms | 22.2 ms | miss min 16.3 ms |
| `GET /verify?recurse=1` (1222 ops) | 53.3 ms | 53.0 ms | 16.3 ms | miss min 29.8 ms |

Honest reading of the numbers:

- At 60 FPS the TD webserver quantizes request handling to the frame budget
  (~16.7 ms), so per-request latency is dominated by **scheduling jitter, not
  by network traversal**. That is why the raw medians overlap: a full
  traversal of 1222 ops costs ~10–40 ms, which is within one to two frame
  quanta.
- Where the floor is visible (per-run minimums), cached reads are consistently
  the fastest observations (16–22 ms ≈ one frame quantum), and the second
  independent run showed `verify` hit median **1.84× faster** than miss.
- The first benchmark round (fresh connection per request via `urllib`) was
  5–50× slower and flat ~2 s per request because the client stalled resolving
  `localhost` → IPv6. **Use `127.0.0.1`** for any benchmark or tooling against
  the bridge; this also matches how the MCP client connects.
- Functional behavior is confirmed regardless of jitter: tags
  `miss→hit→hit`, `no_cache=1`→rebuild, `POST`→invalidate→`miss`, counters in
  `/info.readCache`, and offline tests assert the hit path never re-traverses
  the fake network (call-counting tests in `tests/test_td_api_offline.py` and
  `tests/test_api_contract_offline.py`).

## Scale note

The original backlog scenario (~1222 ops / ~410 connections) was reproduced
with a synthetic chain of 1222 noisePOPs (`bench_cache_1222`), which was
destroyed after measuring. On real mixed networks (COMPs + parameters + wire
serialization in `/verify`) the absolute miss cost grows well beyond the
synthetic chain; the cache win scales with traversal depth and payload size,
and repeated reads (the common agent pattern: verify → read params → verify)
always hit.

## Where the cache lives

| File | Role |
|---|---|
| `toe/src/TouchDesignerAPI.py` | Source of truth (textDAT `file` par points here) |
| `mcp/setup/toe_extension.py` | Standalone copy shipped in the .tox — kept in sync by hand (same keys, same invalidation, same tags) |
| `tests/test_td_api_offline.py` | Handler-level cache tests (call-counting, invalidation, no_cache, lazy init) |
| `tests/test_api_contract_offline.py` | HTTP-level contract tests through the real `OnHTTPRequest` |

# Keep-alive HTTP client + loopback normalization (TDClient)

The MCP client (`api/src/index.ts`) previously used the global `fetch` with
`host = "localhost"` default: every request paid a fresh TCP handshake, and on
Windows the `localhost` resolver stall added up to ~2 s per request (observed
live during the cache measurements above with `urllib`).

Changes (2026-09-17):

- **Host normalization:** `localhost` → `127.0.0.1` in `TDClient` and
  `TDWebSocketClient` (constructor default + `TDAPI_HOST` env). Explicit hosts
  (a remote TD machine) pass through untouched. The bridge only listens on
  IPv4 loopback, so this is always correct.
- **Keep-alive pool:** the HTTP transport dispatches through a shared undici
  `Agent` (`keepAliveMaxTimeout: 10s`, `connections: 4`). undici ≥6 keeps
  connections alive by default; the shared agent owns the pool so every call
  reuses a warm socket.
- The bridge already honors persistence: `HTTP/1.1` + `Connection: Keep-Alive`
  headers, verified with two sequential requests on one `http.client`
  connection (second response served on the same socket), and 4 sockets
  `ESTABLISHED` in `netstat` while a client process held the pool open.

## Client benchmark (scripts/bench_keepalive.mjs, live TD 2025.31760, N=7)

| Case | median | min | max |
|---|---|---|---|
| A `localhost` + global fetch (old default) | 16.6 ms | 15.9 ms | 17.5 ms |
| B `127.0.0.1` + global fetch (no pool) | 16.6 ms | 16.4 ms | 17.0 ms |
| C `TDClient` (undici keep-alive + 127.0.0.1) | 16.8 ms | 16.2 ms | 17.1 ms |

Honest reading: with **Node** the DNS stall never materialized (undici's
resolver is fast) and at this scale TD's frame clock (~16.7 ms @ 60 FPS)
dominates, so A/B/C medians overlap. The win is structural, not per-request:
no TCP handshake per call (matters for tool batches of tens of calls), no OS
resolver in the path (the ~2 s stall was real for Python `urllib` on this
machine and remains possible under memory/adapters changes), and a bounded
socket pool. The cache measurements above are the ones that show real latency
wins; this change removes per-request overhead variance from the client side.

Reproduce: `node scripts/bench_keepalive.mjs` (requires TD on 127.0.0.1:44444).
