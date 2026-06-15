/**
 * Knowledge Brain — FTS5 SQLite Search Engine for TD Operator Docs
 *
 * Implements the Knowledge Brain system from the original TDPilot project,
 * ported to TypeScript with ESM support.  Features:
 *
 *   • FTS5 full-text search with BM25-style relevance scoring
 *   • Family-scoped search (TOP, CHOP, SOP, DAT, POP)
 *   • Trust-tier ranking: official (3) > bundled (2) > community (1)
 *   • Auto-builds the FTS5 database on first use if it doesn't exist
 *   • In-memory cache with configurable TTL
 *   • Ingests operator JSON from data/ops/operators/ and data/pops/operators/
 *
 * DEPENDENCIES
 *   npm install better-sqlite3          ← CJS native module
 *   npm install --save-dev @types/better-sqlite3
 *
 *   better-sqlite3 is loaded via createRequire because it is a CJS native
 *   addon and this project uses ESM ("type": "module").
 */

import { createRequire } from "node:module";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

// ─── CJS interop for better-sqlite3 ─────────────────────────────────────────

const require = createRequire(import.meta.url ?? "file://" + process.cwd() + "/");

// lazy-loaded so knowledgeBrain.ts can be imported even without the optional dep
let Database: any;
function getBetterSqlite3() {
  if (!Database) {
    try {
      Database = require("better-sqlite3");
    } catch {
      throw new Error(
        "better-sqlite3 is required for knowledgeBrain. Install it:\n" +
          "  npm install better-sqlite3\n" +
          "  npm install --save-dev @types/better-sqlite3"
      );
    }
  }
  return Database;
}

// ─── Path resolution ────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function resolveDataDir(): string {
  const candidates = [
    resolve(__dirname, "../data"),
    resolve(__dirname, "../../data"),
    resolve(__dirname, "../../../data"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return resolve(__dirname, "../data");
}

const DATA_DIR = resolveDataDir();
const DB_PATH = resolve(DATA_DIR, "knowledge_brain.db");

// ─── Types ──────────────────────────────────────────────────────────────────

export type TdFamily = "TOP" | "CHOP" | "SOP" | "DAT" | "COMP" | "POP" | "unknown";
export type TrustTier = "official" | "bundled" | "community";
export type SourceType = "ops" | "pops";

export interface KnowledgeBrainEntry {
  /** Unique row id in the documents table */
  rowid: number;
  /** Canonical operator type name (e.g. "noiseTOP", "noisePOP") */
  name: string;
  /** Operator family */
  family: TdFamily;
  /** Human-readable page title */
  pageTitle: string;
  /** URL slug */
  pageSlug: string;
  /** Derivative docs URL */
  url: string;
  /** Short description / summary */
  summary: string;
  /** Trust tier for ranking boost */
  trustTier: TrustTier;
  /** Source: ops (standard operators) or pops (experimental POPs) */
  sourceType: SourceType;
}

export interface SearchResult {
  entry: KnowledgeBrainEntry;
  /** BM25-style relevance score (higher = better) */
  score: number;
  /** FTS5 snippet with <b>...</b> highlighting */
  snippet: string;
}

export interface SearchOptions {
  query: string;
  limit?: number;
  /** Only operators from this family */
  family?: TdFamily;
  /** Minimum trust tier filter (inclusive) */
  minTrust?: TrustTier;
  /** Source filter */
  sourceType?: SourceType;
}

// ─── Trust-tier weights (for BM25 scoring boost) ────────────────────────────

const TRUST_WEIGHT: Record<TrustTier, number> = {
  official: 3.0,
  bundled: 2.0,
  community: 1.0,
};

const TRUST_ORDER: TrustTier[] = ["community", "bundled", "official"];

/** Return the minimum trust tier that meets `min` (inclusive). */
function trustTiersAtOrAbove(min: TrustTier): TrustTier[] {
  const idx = TRUST_ORDER.indexOf(min);
  return TRUST_ORDER.slice(idx);
}

// ─── In-memory cache ────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  ts: number;
}

const DEFAULT_CACHE_TTL_MS = 60_000; // 1 minute

const resultCache = new Map<
  string,
  CacheEntry<{ results: SearchResult[]; total: number }>
>();

function cacheKey(opts: SearchOptions): string {
  return JSON.stringify({
    q: opts.query,
    l: opts.limit ?? 20,
    f: opts.family ?? "*",
    t: opts.minTrust ?? "community",
    s: opts.sourceType ?? "*",
  });
}

function cacheGet(
  key: string,
  ttlMs: number = DEFAULT_CACHE_TTL_MS
): { results: SearchResult[]; total: number } | null {
  const hit = resultCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > ttlMs) {
    resultCache.delete(key);
    return null;
  }
  return hit.data;
}

function cacheSet(
  key: string,
  value: { results: SearchResult[]; total: number }
): void {
  resultCache.set(key, { data: value, ts: Date.now() });
}

/** Public API: invalidate the entire cache. */
export function invalidateCache(): void {
  resultCache.clear();
}

// ─── Database singleton ─────────────────────────────────────────────────────

let _db: any = null;
let _dbReady = false;
let _dbError: Error | null = null;

/**
 * Return the open SQLite database handle.  Creates / migrates the DB on
 * first call if it doesn't exist or was opened before schema init.
 */
function getDb(): any {
  if (_db && _dbReady) return _db;

  const SQLite = getBetterSqlite3();

  try {
    const needsBuild = !existsSync(DB_PATH);

    _db = new SQLite(DB_PATH);

    // pragmas
    _db.pragma("journal_mode = WAL");
    _db.pragma("synchronous = NORMAL");
    _db.pragma("cache_size = -64000"); // 64 MB
    _db.pragma("foreign_keys = ON");

    // Create FTS5 table if it doesn't exist
    _db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS docs USING fts5(
        name,
        family,
        pageTitle,
        pageSlug,
        url,
        summary,
        trustTier,
        sourceType,
        body,
        tokenize='porter unicode61',
        prefix='2 3 4'
      );
    `);

    _dbReady = true;
    _dbError = null;

    // Auto-build on first use
    if (needsBuild) {
      buildBrain();
    }

    return _db;
  } catch (e: any) {
    _dbError = e;
    throw e;
  }
}

/** Check whether the search engine is ready. */
export function isBrainReady(): boolean {
  return _dbReady && !_dbError;
}

/** Get the last init error, if any. */
export function getBrainError(): Error | null {
  return _dbError;
}

// ─── Ingest helpers ─────────────────────────────────────────────────────────

interface IngestCandidate {
  name: string;
  family: TdFamily;
  pageTitle: string;
  pageSlug: string;
  url: string;
  summary: string;
  trustTier: TrustTier;
  sourceType: SourceType;
  body: string;
}

/**
 * Construct the full-text body from all searchable fields of a JSON operator
 * document.  We flatten parameters, inputs, useCases, examples, commonCombinations,
 * troubleshooting, and localNotes into a single plain-text string for FTS5.
 */
function buildBody(doc: any): string {
  const parts: string[] = [];

  if (doc.pageTitle) parts.push(doc.pageTitle);
  if (doc.pageSlug) parts.push(doc.pageSlug);
  if (doc.summary) parts.push(stripWikiMarkup(doc.summary));
  if (doc.description) parts.push(stripWikiMarkup(doc.description));
  if (doc.tdOpTypeGuess) parts.push(doc.tdOpTypeGuess);

  // Parameters
  if (Array.isArray(doc.parameters)) {
    for (const p of doc.parameters) {
      parts.push(p.label ?? "", p.name ?? "", p.description ?? "");
    }
  }

  // Inputs
  if (Array.isArray(doc.inputs)) {
    for (const inp of doc.inputs) {
      parts.push(inp.description ?? "");
    }
  }

  // Use cases
  if (Array.isArray(doc.useCases)) {
    for (const uc of doc.useCases) {
      parts.push(typeof uc === "string" ? uc : uc.description ?? "");
    }
  }

  // Examples
  if (Array.isArray(doc.examples)) {
    for (const ex of doc.examples) {
      if (typeof ex === "string") {
        parts.push(ex);
      } else {
        parts.push(ex.title ?? "", ex.description ?? "", ...(ex.steps ?? []));
      }
    }
  }

  // Common combinations
  if (Array.isArray(doc.commonCombinations)) {
    for (const cc of doc.commonCombinations) {
      parts.push(
        ...(Array.isArray(cc.with) ? cc.with : typeof cc.operators === "object" && Array.isArray(cc.operators) ? cc.operators.map(String) : []),
        cc.why ?? cc.description ?? ""
      );
    }
  }

  // Troubleshooting
  if (Array.isArray(doc.troubleshooting)) {
    for (const t of doc.troubleshooting) {
      parts.push(t.problem ?? "", t.cause ?? "", t.fix ?? "");
    }
  }

  // Local notes / expert analysis
  if (Array.isArray(doc.localNotes)) {
    for (const note of doc.localNotes) {
      parts.push(note.excerpt ?? "", note.source ?? "");
    }
  }

  // Attributes
  if (Array.isArray(doc.attributes)) {
    for (const a of doc.attributes) {
      parts.push(a.name ?? "", a.type ?? "", a.description ?? "");
    }
  }

  return parts
    .filter((s) => s && s.trim().length > 0)
    .join("\n")
    .replace(/\0/g, " "); // NUL bytes crash SQLite
}

/** Strip common MediaWiki markup to plain text. */
function stripWikiMarkup(text: string): string {
  return text
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/'''|''/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\[edit\]/gi, "")
    .replace(/⊞/g, "")
    .replace(/\{\{[^}]+\}\}/g, "")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Determine trust tier from operator metadata. */
function inferTrustTier(doc: any, sourceType: SourceType): TrustTier {
  // POP operators are all experimental/community for now
  if (sourceType === "pops") return "community";

  // Check explicit flags
  if (doc.experimental) return "community";

  // Official Derivative docs operators → "official"
  // The ops data comes from scraping official Derivative docs
  if (sourceType === "ops") return "official";

  return "bundled";
}

/** Determine family from doc data. */
function inferFamily(doc: any, filePath: string): TdFamily {
  // Explicit family field
  if (doc.family) return doc.family;

  // Infer from path: data/ops/operators/TOP/Noise_TOP.json → "TOP"
  const parts = filePath.replace(/\\/g, "/").split("/");
  const idx = parts.indexOf("operators");
  if (idx >= 0 && idx + 1 < parts.length) {
    const famDir = parts[idx + 1].toUpperCase();
    if (["TOP", "CHOP", "SOP", "DAT", "COMP", "POP"].includes(famDir)) {
      return famDir as TdFamily;
    }
  }

  // POP source type
  const sourceIdx = parts.indexOf("pops");
  if (sourceIdx >= 0) return "POP";

  // Infer from name suffix
  const name = doc.tdOpTypeGuess ?? doc.pageSlug ?? doc.pageTitle ?? "";
  if (/TOP$/i.test(name)) return "TOP";
  if (/CHOP$/i.test(name)) return "CHOP";
  if (/SOP$/i.test(name)) return "SOP";
  if (/DAT$/i.test(name)) return "DAT";
  if (/COMP$/i.test(name)) return "COMP";
  if (/POP$/i.test(name)) return "POP";

  return "unknown";
}

/** Walk operator files, parse JSON, yield Candidate objects. */
function* ingestOperators(
  rootDir: string,
  sourceType: SourceType
): Generator<IngestCandidate, void, unknown> {
  // data/ops/operators/TOP/, CHOP/, SOP/, DAT/
  // data/pops/operators/ (flat)
  const baseDir =
    sourceType === "ops"
      ? resolve(rootDir, "ops", "operators")
      : resolve(rootDir, "pops", "operators");

  if (!existsSync(baseDir)) return;

  function walk(dir: string): string[] {
    const files: string[] = [];
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...walk(full));
      } else if (
        entry.isFile() &&
        entry.name.endsWith(".json") &&
        !entry.name.startsWith(".") &&
        entry.name !== "index.json"
      ) {
        files.push(full);
      }
    }
    return files;
  }

  const jsonFiles = walk(baseDir);

  for (const filePath of jsonFiles) {
    try {
      const raw = readFileSync(filePath, "utf-8");
      const doc = JSON.parse(raw);
      if (!doc.pageTitle && !doc.pageSlug && !doc.tdOpTypeGuess) continue;

      const family = inferFamily(doc, filePath);
      const name =
        doc.tdOpTypeGuess ??
        doc.pageSlug ??
        doc.pageTitle ??
        basename(filePath, ".json");
      const pageTitle = doc.pageTitle ?? name;
      const pageSlug = doc.pageSlug ?? name;
      const url = doc.url ?? "";
      const summary =
        typeof doc.summary === "string"
          ? stripWikiMarkup(doc.summary)
          : doc.description
            ? stripWikiMarkup(doc.description).substring(0, 500)
            : "";
      const trustTier = inferTrustTier(doc, sourceType);
      const body = buildBody(doc);

      yield {
        name,
        family,
        pageTitle,
        pageSlug,
        url,
        summary,
        trustTier,
        sourceType,
        body,
      };
    } catch {
      // Silently skip files that fail to parse
    }
  }
}

// ─── Build / rebuild ────────────────────────────────────────────────────────

/**
 * (Re)build the FTS5 search index from raw operator JSON files on disk.
 *
 * Deletes all existing rows before ingest so this is idempotent.
 * Called automatically on first use when the DB does not exist.
 * Can be called manually to refresh the index after data changes.
 */
export function buildBrain(): { ingested: number; errors: number } {
  const db = getDb();
  let ingested = 0;
  let errors = 0;

  // Clear existing data
  db.exec("DELETE FROM docs");

  const insert = db.prepare(`
    INSERT INTO docs (name, family, pageTitle, pageSlug, url, summary, trustTier, sourceType, body)
    VALUES (@name, @family, @pageTitle, @pageSlug, @url, @summary, @trustTier, @sourceType, @body)
  `);

  const insertMany = db.transaction((candidates: IngestCandidate[]) => {
    for (const c of candidates) {
      try {
        insert.run({
          name: c.name,
          family: c.family,
          pageTitle: c.pageTitle,
          pageSlug: c.pageSlug,
          url: c.url,
          summary: c.summary,
          trustTier: c.trustTier,
          sourceType: c.sourceType,
          body: c.body,
        });
        ingested++;
      } catch {
        errors++;
      }
    }
  });

  // Ingest ops
  const opsCandidates = Array.from(ingestOperators(DATA_DIR, "ops"));
  if (opsCandidates.length > 0) insertMany(opsCandidates);

  // Ingest pops
  const popsCandidates = Array.from(ingestOperators(DATA_DIR, "pops"));
  if (popsCandidates.length > 0) insertMany(popsCandidates);

  // Invalidate cache after rebuild
  invalidateCache();

  console.log(
    `[knowledgeBrain] Built FTS5 index: ${ingested} operators ingested, ${errors} errors`
  );

  return { ingested, errors };
}

/**
 * Force a full rebuild of the brain (teardown + create + ingest).
 */
export function rebuildBrain(): { ingested: number; errors: number } {
  const db = getDb();
  db.exec("DELETE FROM docs");
  return buildBrain();
}

// ─── BM25 scoring ───────────────────────────────────────────────────────────

/**
 * Compute a BM25-inspired relevance score from an FTS5 `bm25()` result and
 * additional metadata boosts.
 *
 * `bm25(docs)` returns a float in FTS5; we multiply by trust weight and
 * apply a name-match bonus.
 */
function computeScore(
  bm25: number,
  trustTier: TrustTier,
  query: string,
  name: string,
  pageTitle: string
): number {
  const trustMultiplier = TRUST_WEIGHT[trustTier] ?? 1.0;

  let score = bm25 * trustMultiplier;

  // Exact name match boost
  const qLower = query.toLowerCase().trim();
  if (qLower === name.toLowerCase()) score *= 2.5;
  else if (name.toLowerCase().includes(qLower)) score *= 1.8;
  else if (pageTitle.toLowerCase().includes(qLower)) score *= 1.3;

  return score;
}

// ─── Search ─────────────────────────────────────────────────────────────────

/**
 * Search the knowledge brain with FTS5 + BM25 scoring.
 *
 * @param query  - Free-text search query (FTS5 syntax supported).
 * @param limit  - Max results to return (default 10, max 50).
 * @returns Ranked search results with scores and HTML snippets.
 */
export function searchKnowledge(
  query: string,
  limit: number = 10
): { results: SearchResult[]; total: number } {
  return searchKnowledgeAdvanced({ query, limit });
}

/**
 * Search with family filter — only operators matching the given family.
 */
export function searchByFamily(
  query: string,
  family: TdFamily,
  limit: number = 10
): { results: SearchResult[]; total: number } {
  return searchKnowledgeAdvanced({ query, family, limit });
}

/**
 * Full-featured search with all options.
 *
 * Results are cached for 60 seconds by default; clearing happens on rebuild.
 */
export function searchKnowledgeAdvanced(
  options: SearchOptions
): { results: SearchResult[]; total: number } {
  const limit = Math.max(1, Math.min(50, options.limit ?? 10));
  const key = cacheKey(options);

  // Check cache
  const cached = cacheGet(key);
  if (cached) return { results: cached.results.slice(0, limit), total: cached.total };

  const db = getDb();

  const q = options.query.trim();
  if (!q) {
    // No query → return recent / all entries, sorted by trust then name
    let sql = `SELECT rowid, name, family, pageTitle, pageSlug, url, summary, trustTier, sourceType FROM docs`;
    const where: string[] = [];
    const params: any = {};

    if (options.family) {
      where.push("family = @family");
      params.family = options.family;
    }
    if (options.minTrust && options.minTrust !== "community") {
      const tiers = trustTiersAtOrAbove(options.minTrust);
      where.push(`trustTier IN (${tiers.map((t) => "'" + t + "'").join(",")})`);
    }
    if (options.sourceType) {
      where.push("sourceType = @sourceType");
      params.sourceType = options.sourceType;
    }

    if (where.length > 0) sql += " WHERE " + where.join(" AND ");
    sql += " ORDER BY trustTier DESC, name ASC LIMIT @limit";
    params.limit = limit;

    const rows = db.prepare(sql).all(params) as KnowledgeBrainEntry[];
    const results: SearchResult[] = rows.map((r) => ({
      entry: r,
      score: TRUST_WEIGHT[r.trustTier] ?? 1.0,
      snippet: r.summary ?? "",
    }));

    cacheSet(key, { results, total: results.length });
    return { results, total: results.length };
  }

  // FTS5 query with BM25 scoring
  // Escape special FTS5 characters but allow AND/OR/NOT/* operators
  const ftsQuery = sanitizeFts5Query(q);

  // Build WHERE clauses
  const where: string[] = [];
  const params: any = {};

  if (options.family) {
    where.push("family = @family");
    params.family = options.family;
  }
  if (options.minTrust && options.minTrust !== "community") {
    const tiers = trustTiersAtOrAbove(options.minTrust);
    where.push(`trustTier IN (${tiers.map((t) => "'" + t + "'").join(",")})`);
  }
  if (options.sourceType) {
    where.push("sourceType = @sourceType");
    params.sourceType = options.sourceType;
  }

  const whereClause = where.length > 0 ? "AND " + where.join(" AND ") : "";

  // Run FTS5 search
  // Use bm25(docs) for BM25 scoring
  const sql = `
    SELECT
      rowid,
      name,
      family,
      pageTitle,
      pageSlug,
      url,
      summary,
      trustTier,
      sourceType,
      bm25(docs) AS bm25_score,
      snippet(docs, 1, '<b>', '</b>', '…', 40) AS snippet
    FROM docs
    WHERE docs MATCH @query
    ${whereClause}
    ORDER BY rank
    LIMIT @limit
  `;

  params.query = ftsQuery;
  params.limit = Math.min(limit * 2, 100); // fetch more for re-ranking

  let rows: any[];
  try {
    rows = db.prepare(sql).all(params);
  } catch {
    // FTS5 syntax error → fall back to LIKE search
    return fallbackLikeSearch(q, options);
  }

  // Re-rank with trust-weight + name-match boost
  const scored: SearchResult[] = rows.map((r: any) => ({
    entry: {
      rowid: r.rowid,
      name: r.name,
      family: r.family,
      pageTitle: r.pageTitle,
      pageSlug: r.pageSlug,
      url: r.url,
      summary: r.summary,
      trustTier: r.trustTier as TrustTier,
      sourceType: r.sourceType as SourceType,
    },
    score: computeScore(
      r.bm25_score,
      r.trustTier as TrustTier,
      q,
      r.name,
      r.pageTitle
    ),
    snippet: r.snippet ?? r.summary ?? "",
  }));

  scored.sort((a, b) => b.score - a.score);

  const final = scored.slice(0, limit);
  cacheSet(key, { results: final, total: scored.length });
  return { results: final, total: scored.length };
}

/**
 * Fallback LIKE-based search when FTS5 query syntax is invalid.
 */
function fallbackLikeSearch(
  q: string,
  options: SearchOptions
): { results: SearchResult[]; total: number } {
  const db = getDb();
  const limit = Math.max(1, Math.min(50, options.limit ?? 10));

  const where: string[] = [
    "(name LIKE @q OR pageTitle LIKE @q OR summary LIKE @q OR body LIKE @q)",
  ];
  const params: any = { q: `%${q.replace(/%/g, "\\%")}%` };

  if (options.family) {
    where.push("family = @family");
    params.family = options.family;
  }
  if (options.minTrust && options.minTrust !== "community") {
    const tiers = trustTiersAtOrAbove(options.minTrust);
    where.push(`trustTier IN (${tiers.map((t) => "'" + t + "'").join(",")})`);
  }
  if (options.sourceType) {
    where.push("sourceType = @sourceType");
    params.sourceType = options.sourceType;
  }

  const sql = `
    SELECT rowid, name, family, pageTitle, pageSlug, url, summary, trustTier, sourceType
    FROM docs
    WHERE ${where.join(" AND ")}
    ORDER BY
      CASE trustTier
        WHEN 'official' THEN 3
        WHEN 'bundled' THEN 2
        WHEN 'community' THEN 1
        ELSE 0
      END DESC,
      name ASC
    LIMIT @limit
  `;
  params.limit = limit;

  const rows = db.prepare(sql).all(params) as KnowledgeBrainEntry[];

  const results: SearchResult[] = rows.map((r) => {
    const idx = (r.summary ?? "").toLowerCase().indexOf(q.toLowerCase());
    const snippet =
      idx >= 0
        ? "…" +
          (r.summary ?? "").substring(
            Math.max(0, idx - 20),
            Math.min((r.summary ?? "").length, idx + q.length + 80)
          ) +
          "…"
        : r.summary ?? r.pageTitle;
    return {
      entry: r,
      score: (TRUST_WEIGHT[r.trustTier] ?? 1.0) * 0.5, // lower base via LIKE
      snippet,
    };
  });

  results.sort((a, b) => b.score - a.score);
  return { results, total: results.length };
}

/** Sanitize a user query for FTS5, preserving boolean operators. */
function sanitizeFts5Query(query: string): string {
  const raw = query
    .replace(/[\0"'()]/g, " ") // remove nulls, quotes, parens
    .trim();

  // If the query uses FTS5 operators explicitly, pass through mostly as-is
  if (/\b(AND|OR|NOT|NEAR)\b/i.test(raw)) {
    return raw;
  }

  // For simple multi-word queries, add implicit AND
  const words = raw.split(/\s+/).filter((w) => w.length > 0);
  if (words.length <= 1) {
    // Single term: add prefix matching with *
    return words.length === 1 ? words[0] + "*" : raw;
  }

  // Multi-word: join with implicit AND
  return words.map((w) => `"${w}"`).join(" AND ");
}

// ─── Stats ──────────────────────────────────────────────────────────────────

/** Get total document count across trust tiers. */
export function brainStats(): {
  total: number;
  byFamily: Record<string, number>;
  byTrust: Record<string, number>;
  bySource: Record<string, number>;
} {
  const db = getDb();

  const total =
    (db.prepare("SELECT COUNT(*) AS c FROM docs").get() as any)?.c ?? 0;

  const byFamily = rowsToMap(
    db.prepare("SELECT family, COUNT(*) AS c FROM docs GROUP BY family").all()
  );
  const byTrust = rowsToMap(
    db
      .prepare("SELECT trustTier, COUNT(*) AS c FROM docs GROUP BY trustTier")
      .all()
  );
  const bySource = rowsToMap(
    db
      .prepare("SELECT sourceType, COUNT(*) AS c FROM docs GROUP BY sourceType")
      .all()
  );

  return { total, byFamily, byTrust, bySource };
}

function rowsToMap(rows: any[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const r of rows) map[r.family ?? r.trustTier ?? r.sourceType] = r.c;
  return map;
}

// ─── Auto-initialization on import ──────────────────────────────────────────

// Attempt to open & build on first import so consumers (MCP tools) don't
// pay the latency of building on the first query.
let _initAttempted = false;

function autoInit(): void {
  if (_initAttempted) return;
  _initAttempted = true;
  try {
    getDb(); // triggers buildBrain() if DB doesn't exist
  } catch {
    // Swallow — will retry on first explicit call
  }
}

autoInit();

// ─── End of knowledgeBrain.ts ───────────────────────────────────────────────
