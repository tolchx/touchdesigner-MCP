#!/usr/bin/env python3
"""
Live TD Test: GLSL POP Operator Snippets
==========================================

Reproduces the official TouchDesigner GLSL POP snippets from
/ui/dialogs/OPSnippetsShell/OPSnippetsOnDemand/POP/glslPOP/

Tests 5 simplified snippet patterns extracted from the TD examples:
  1. glsl1: Simple pass-through (P[id] = TDIn_P())
  2. glsl2: Sin wave displacement (pos.y += sin(uTime))
  3. glsl3: Sin wave + color output (Color[id])
  4. glsl7: Custom attribute output (Ripple[id])
  5. glsl10: Multi-attribute passthrough (Color + custom Thing)

Each snippet is recreated from scratch in an isolated sandbox,
wired to its own spherePOP source, compiled, and verified.

References:
  TD snippets: /ui/dialogs/OPSnippetsShell/OPSnippetsOnDemand/POP/glslPOP/

Exit code 0 = pass, non-zero = fail. Safe to re-run.
"""

from __future__ import annotations

import json
import sys
import time
import urllib.request
import uuid

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 44444
DEFAULT_TIMEOUT = 30

SANDBOX_PARENT = "/project1"
SANDBOX_NAME = f"glsl_snippets_{uuid.uuid4().hex[:8]}"
SANDBOX_PATH = f"{SANDBOX_PARENT}/{SANDBOX_NAME}"

NODE_SPACING_Y = 500

# ─── GLSL Snippet Definitions ────────────────────────────────────────────────
# Extracted from TD built-in snippets at:
# /ui/dialogs/OPSnippetsShell/OPSnippetsOnDemand/POP/glslPOP/example4/

SNIPPETS = [
    {
        "name": "passthrough",
        "desc": "glsl1: Simple pass-through — P[id] = TDIn_P()",
        "source": (
            "void main() {\n"
            "\tconst uint id = TDIndex();\n"
            "\tif(id >= TDNumElements())\n"
            "\t\treturn;\n"
            "\t\t\n"
            "\tP[id] = TDIn_P();\n"
            "}\n"
        ),
        "outputattrs": "P",
    },
    {
        "name": "sin_wave",
        "desc": "glsl2: Sin wave displacement on Y",
        "source": (
            "void main() {\n"
            "    const uint id = TDIndex();\n"
            "    if(id >= TDNumElements())\n"
            "        return;\n"
            "        \n"
            "    vec3 pos = TDIn_P();\n"
            "    pos.y += sin(uTime * 2.0 + pos.x);\n"
            "    P[id] = pos;\n"
            "}"
        ),
        "outputattrs": "P",
    },
    {
        "name": "sin_wave_color",
        "desc": "glsl3: Sin wave + height-based color (Color[id])",
        "source": (
            "void main() {\n"
            "    const uint id = TDIndex();\n"
            "    if(id >= TDNumElements())\n"
            "        return;\n"
            "        \n"
            "    vec3 pos = TDIn_P();\n"
            "    pos.y += sin(uTime * 2.0 + pos.x);\n"
            "    P[id] = pos;\n"
            "    \n"
            "    // Add color based on height\n"
            "    vec4 color = vec4(vec3(0.5) + 0.5 * normalize(pos),1.0);\n"
            "    Color[id] = color;\n"
            "}"
        ),
        "outputattrs": "P Cd",
    },
    {
        "name": "ripple_custom_attr",
        "desc": "glsl7: Ripple intensity as custom attribute",
        "source": (
            "void main() {\n"
            "    const uint id = TDIndex();\n"
            "    if(id >= TDNumElements())\n"
            "        return;\n"
            "        \n"
            "    vec3 originalPos = TDIn_P();\n"
            "    \n"
            "    // Make it pulse in and out\n"
            "    float pulse = 1.0 + 0.3 * sin(uTime);\n"
            "    vec3 pos = originalPos * pulse;\n"
            "    \n"
            "    // Add wave deformation\n"
            "    float wave = 0.2 * sin(uTime * 2.0 + originalPos.x);\n"
            "    pos.y += wave;\n"
            "    P[id] = pos;\n"
            "    \n"
            "    // Calculate ripple intensity (0-1 value based on deformation)\n"
            "    float rippleIntensity = abs(wave) * 5.0;\n"
            "    rippleIntensity = clamp(rippleIntensity, 0.0, 1.0);\n"
            "    Ripple[id] = rippleIntensity;\n"
            "    \n"
            "    // Use original position for stable color pattern\n"
            "    float colorFreq = 5.0 / pulse;\n"
            "    \n"
            "    vec4 color = vec4(\n"
            "        0.5 + 0.5 * sin(originalPos.x * colorFreq + uTime),\n"
            "        rippleIntensity,  // Green channel shows ripple intensity\n"
            "        0.5 + 0.5 * sin(originalPos.z * colorFreq + uTime),\n"
            "        1.0\n"
            "    );\n"
            "    Color[id] = color;\n"
            "}"
        ),
        "outputattrs": "P Cd",
    },
    {
        "name": "multi_attr_passthrough",
        "desc": "glsl10: Pass-through with Color + custom Thing attribute",
        "source": (
            "void main() {\n"
            "\tconst uint id = TDIndex();\n"
            "\tif(id >= TDNumElements())\n"
            "\t\treturn;\n"
            "\tfloat px = TDIn_P().x;\n"
            "\tvec4 c = TDIn_Color();\n"
            "\tColor[id] = c;\n"
            "\tThing[id] = px;\n"
            "\tP[id] = TDIn_P();\n"
            "}\n"
        ),
        "outputattrs": "P Cd",
    },
]


# ─── HTTP client ──────────────────────────────────────────────────────────────


class TDClient:
    def __init__(self, host: str, port: int, timeout: int = DEFAULT_TIMEOUT):
        self.base = f"http://{host}:{port}"
        self.timeout = timeout

    def exec(self, code: str) -> str:
        payload = json.dumps({"code": code}).encode("utf-8")
        req = urllib.request.Request(
            f"{self.base}/exec",
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        if "error" in data and data["error"]:
            raise RuntimeError(f"TD exec error: {data['error']}")
        return data.get("output", "")

    def get_json(self, path: str) -> dict:
        url = f"{self.base}{path}"
        with urllib.request.urlopen(url, timeout=self.timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def ping(self) -> bool:
        try:
            self.get_json("/info")
            return True
        except Exception:
            return False


# ─── Test result collector ────────────────────────────────────────────────────


class TestResult:
    def __init__(self):
        self.steps: list[dict] = []
        self.failures: list[str] = []

    def step(self, name: str, ok: bool, detail: str = "") -> None:
        self.steps.append({"name": name, "ok": ok, "detail": detail})
        status = "[PASS]" if ok else "[FAIL]"
        msg = f"  {status} {name}"
        if detail:
            msg += f" — {detail}"
        print(msg)
        if not ok:
            self.failures.append(f"{name}: {detail}")

    @property
    def passed(self) -> bool:
        return not self.failures

    @property
    def total(self) -> int:
        return len(self.steps)

    @property
    def pass_count(self) -> int:
        return sum(1 for s in self.steps if s["ok"])


# ─── Build phase ──────────────────────────────────────────────────────────────


def build_network(td: TDClient, res: TestResult) -> bool:
    """Build sandbox + one chain per snippet: spherePOP → glslPOP → nullPOP."""

    # Phase 1: Create sandbox
    try:
        td.exec("op(%r).create(baseCOMP, %r)" % (SANDBOX_PARENT, SANDBOX_NAME))
        td.exec("op(%r).nodeX = 0; op(%r).nodeY = 0" % (SANDBOX_PATH, SANDBOX_PATH))
        res.step("sandbox_create", True, SANDBOX_PATH)
    except Exception as e:
        res.step("sandbox_create", False, str(e))
        return False

    created = {}

    for i, snippet in enumerate(SNIPPETS):
        name = snippet["name"]
        src_name = f"src_{name}"
        dat_name = f"code_{name}"
        glsl_name = f"glsl_{name}"
        out_name = f"out_{name}"
        y = i * NODE_SPACING_Y

        # 2a: spherePOP source
        try:
            td.exec("op(%r).create(spherePOP, %r)" % (SANDBOX_PATH, src_name))
            td.exec("op(%r).par.radx = 2.0; op(%r).par.rady = 2.0; op(%r).par.rows = 20; op(%r).par.cols = 20" % (
                f"{SANDBOX_PATH}/{src_name}", f"{SANDBOX_PATH}/{src_name}",
                f"{SANDBOX_PATH}/{src_name}", f"{SANDBOX_PATH}/{src_name}"))
            td.exec("op(%r).nodeX = -300; op(%r).nodeY = %d" % (
                f"{SANDBOX_PATH}/{src_name}", f"{SANDBOX_PATH}/{src_name}", y))
            created[src_name] = f"{SANDBOX_PATH}/{src_name}"
            res.step(f"{name}_src", True, "spherePOP")
        except Exception as e:
            res.step(f"{name}_src", False, str(e))
            continue

        # 2b: textDAT with GLSL code
        try:
            td.exec("op(%r).create(textDAT, %r)" % (SANDBOX_PATH, dat_name))
            td.exec("op(%r).text = %r" % (
                f"{SANDBOX_PATH}/{dat_name}", snippet["source"]))
            td.exec("op(%r).nodeX = 0; op(%r).nodeY = %d" % (
                f"{SANDBOX_PATH}/{dat_name}", f"{SANDBOX_PATH}/{dat_name}", y + 100))
            created[dat_name] = f"{SANDBOX_PATH}/{dat_name}"
            res.step(f"{name}_dat", True, "textDAT")
        except Exception as e:
            res.step(f"{name}_dat", False, str(e))
            continue

        # 2c: glslPOP + IMMEDIATELY set computedat
        try:
            td.exec("op(%r).create(glslPOP, %r)" % (SANDBOX_PATH, glsl_name))
            td.exec("op(%r).par.computedat = %r" % (
                f"{SANDBOX_PATH}/{glsl_name}", dat_name))
            td.exec("op(%r).par.outputattrs = %r" % (
                f"{SANDBOX_PATH}/{glsl_name}", snippet["outputattrs"]))
            td.exec("op(%r).par.numelems = 400" % (f"{SANDBOX_PATH}/{glsl_name}"))
            td.exec("op(%r).nodeX = 300; op(%r).nodeY = %d" % (
                f"{SANDBOX_PATH}/{glsl_name}", f"{SANDBOX_PATH}/{glsl_name}", y))
            created[glsl_name] = f"{SANDBOX_PATH}/{glsl_name}"
            res.step(f"{name}_glsl", True, "glslPOP")
        except Exception as e:
            res.step(f"{name}_glsl", False, str(e))
            continue

        # 2d: nullPOP output
        try:
            td.exec("op(%r).create(nullPOP, %r)" % (SANDBOX_PATH, out_name))
            td.exec("op(%r).nodeX = 600; op(%r).nodeY = %d" % (
                f"{SANDBOX_PATH}/{out_name}", f"{SANDBOX_PATH}/{out_name}", y))
            created[out_name] = f"{SANDBOX_PATH}/{out_name}"
            res.step(f"{name}_out", True, "nullPOP")
        except Exception as e:
            res.step(f"{name}_out", False, str(e))
            continue

    total_nodes = len(SNIPPETS) * 4
    res.step("nodes_created", len(created) == total_nodes,
             f"{len(created)}/{total_nodes}")
    if len(created) < total_nodes:
        print("  [WARN] partial network")

    # Phase 3: Wire connections
    wired = 0
    wire_expected = 0
    for snippet in SNIPPETS:
        name = snippet["name"]
        wire_expected += 2
        sk = f"src_{name}"
        gk = f"glsl_{name}"
        ok_ = f"out_{name}"
        if sk not in created or gk not in created or ok_ not in created:
            continue
        try:
            td.exec("op(%r).outputConnectors[0].connect(op(%r))" % (created[sk], created[gk]))
            td.exec("op(%r).outputConnectors[0].connect(op(%r))" % (created[gk], created[ok_]))
            wired += 2
        except Exception as e:
            res.step(f"wire_{name}", False, str(e))

    res.step("wires", wired == wire_expected, f"{wired}/{wire_expected}")
    return True


# ─── Verify phase ─────────────────────────────────────────────────────────────


def verify_network(td: TDClient, res: TestResult) -> None:
    """Verify all snippet chains compiled and are wired correctly."""
    time.sleep(1.5)

    # Inspect all children
    inspect_code = (
        "import json\n"
        "c = op(%r)\n"
        "out = {'nodes': []}\n"
        "if c is not None:\n"
        "    for n in c.findChildren():\n"
        "        info = {'name': n.name,\n"
        "                'opType': getattr(n, 'OPType', '?'),\n"
        "                'errors': list(n.errors()) if n.errors() else [],\n"
        "                'inputs': []}\n"
        "        try:\n"
        "            for ic in n.inputConnectors:\n"
        "                info['inputs'].append([conn.owner.path for conn in ic.connections])\n"
        "        except Exception:\n"
        "            pass\n"
        "        out['nodes'].append(info)\n"
        "print(json.dumps(out))\n"
    ) % SANDBOX_PATH

    try:
        raw = td.exec(inspect_code)
        data = json.loads(raw.strip().splitlines()[-1]) if raw.strip() else {"nodes": []}
        nodes = data.get("nodes", [])
        res.step("inspect", True, f"inspected {len(nodes)} operators")
    except Exception as e:
        res.step("inspect", False, str(e))
        return

    by_name = {n["name"]: n for n in nodes}

    # ── Check all expected operators ──
    expected_ops = {}
    for s in SNIPPETS:
        name = s["name"]
        expected_ops[f"src_{name}"] = "spherePOP"
        expected_ops[f"code_{name}"] = "textDAT"
        expected_ops[f"glsl_{name}"] = "glslPOP"
        expected_ops[f"out_{name}"] = "nullPOP"

    present = 0
    for op_name, expected_type in expected_ops.items():
        n = by_name.get(op_name)
        if n is None:
            res.step(f"exists_{op_name}", False, "not found")
        else:
            ok = n["opType"] == expected_type
            if ok:
                present += 1
            res.step(f"exists_{op_name}", ok,
                     f"{n['opType']}" + ("" if ok else f" (expected {expected_type})"))
    res.step("all_ops_exist", present == len(expected_ops),
             f"{present}/{len(expected_ops)}")

    # ── Check zero errors ──
    any_errors = False
    for n in nodes:
        if n["errors"]:
            any_errors = True
            res.step(f"err_{n['name']}", False, f"{' | '.join(n['errors'][:3])}")
    if not any_errors:
        res.step("zero_errors", True, "all clean")

    # ── Check outputattrs + computedat per snippet ──
    for snippet in SNIPPETS:
        name = snippet["name"]
        gk = f"glsl_{name}"
        gn = by_name.get(gk)
        if gn is None:
            continue

        check_code = (
            "import json\n"
            "o = op('%s/%s')\n"
            "oa = str(o.par.outputattrs.eval()) if hasattr(o.par, 'outputattrs') else 'N/A'\n"
            "ct = str(o.par.computedat.eval()) if hasattr(o.par, 'computedat') else 'N/A'\n"
            "print(json.dumps({'outputattrs': oa, 'computedat': ct}))\n"
        ) % (SANDBOX_PATH, gk)
        try:
            raw = td.exec(check_code)
            params = json.loads(raw.strip().splitlines()[-1]) if raw.strip() else {}
            oa = params.get("outputattrs", "")
            ct = params.get("computedat", "")
            # Check computedat points to our DAT
            ct_ok = f"code_{name}" in ct
            res.step(f"ct_{name}", ct_ok,
                     f"computedat={ct}" + ("" if ct_ok else f" (expected code_{name})"))
        except Exception as e:
            res.step(f"params_{name}", False, str(e))

    # ── Check src → glsl wiring ──
    for snippet in SNIPPETS:
        name = snippet["name"]
        gk = f"glsl_{name}"
        sk = f"src_{name}"
        gn = by_name.get(gk)
        if gn is None:
            continue
        src_path = f"{SANDBOX_PATH}/{sk}"
        flat = [owner for inp in gn.get("inputs", []) for owner in inp]
        ok = any(src_path in f for f in flat)
        res.step(f"wire_{name}", ok,
                 "src→glsl wired" if ok else f"inputs={flat}")

    # ── /verify endpoint ──
    try:
        v = td.get_json(f"/verify?path={SANDBOX_PATH}")
        healthy = bool(v.get("healthy", False))
        err_cnt = int(v.get("error_count", -1))
        op_cnt = int(v.get("operator_count", 0))
        res.step("verify_endpoint", healthy and err_cnt == 0,
                 f"healthy={healthy} errors={err_cnt} ops={op_cnt}")
    except Exception as e:
        res.step("verify_endpoint", False, str(e))

    # ── RULE 2: async GLSL re-check ──
    print("\n--- RULE 2: Async GLSL re-check ---")
    try:
        td.exec("c = op(%r); c.cook(force=True)" % SANDBOX_PATH)
        time.sleep(2.0)
        recheck = (
            "import json\n"
            "c = op(%r)\n"
            "errs = []\n"
            "for n in c.findChildren():\n"
            "    e = list(n.errors()) if n.errors() else []\n"
            "    if e:\n"
            "        errs.append({'name': n.name, 'errors': [str(x) for x in e]})\n"
            "print(json.dumps(errs))\n"
        ) % SANDBOX_PATH
        raw = td.exec(recheck)
        post_errors = json.loads(raw.strip().splitlines()[-1]) if raw.strip() else []
        res.step("async_clean", len(post_errors) == 0,
                 "all async-clean" if not post_errors else f"{len(post_errors)} error(s)")
        for pe in post_errors:
            res.step(f"async_{pe.get('name', '?')}", False, str(pe.get("errors", [])))
    except Exception as e:
        res.step("async_recheck", False, str(e))


def cleanup(td: TDClient, res: TestResult) -> None:
    try:
        td.exec("c = op(%r); c.destroy() if c is not None else None" % SANDBOX_PATH)
        gone = td.exec("print('GONE' if op(%r) is None else 'STILL')" % SANDBOX_PATH).strip()
        res.step("cleanup", gone == "GONE", "destroyed" if gone == "GONE" else "still present")
    except Exception as e:
        res.step("cleanup", False, str(e))


# ─── Main ─────────────────────────────────────────────────────────────────────


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    td = TDClient(DEFAULT_HOST, DEFAULT_PORT)
    res = TestResult()

    print("=" * 60)
    print("  GLSL POP Operator Snippets — Live TouchDesigner")
    print(f"  Target: http://{DEFAULT_HOST}:{DEFAULT_PORT}")
    print(f"  Sandbox: {SANDBOX_PATH}")
    print(f"  Snippets: {len(SNIPPETS)}")
    print("=" * 60)
    print()

    if not td.ping():
        print("ERROR: Cannot reach TouchDesigner HTTP API.")
        return 2

    info = td.get_json("/info")
    print(f"Connected: {info.get('version', '?')} @ {info.get('projectFPS', '?')} FPS\n")

    print("--- Build phase ---")
    if not build_network(td, res):
        print("\nBuild failed.")
        return 1

    print("\n--- Verify phase ---")
    verify_network(td, res)

    print("\n--- Cleanup ---")
    cleanup(td, res)

    print(f"\n{'=' * 60}")
    print(f"  Results: {res.pass_count}/{res.total} passed, {len(res.failures)} failed")
    print(f"{'=' * 60}")

    if not res.passed:
        print("\nFailed checks:")
        for f in res.failures:
            print(f"  - {f}")

    return 1 if res.failures else 0


if __name__ == "__main__":
    sys.exit(main())
