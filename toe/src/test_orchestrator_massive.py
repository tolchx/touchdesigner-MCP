#!/usr/bin/env python3
"""
TD-MCP Massive Test Orchestrator
=================================
Ejecuta TODOS los tests live de TD con --keep, dejando contenedores
persistentes visibles en TouchDesigner, y documenta cada uno.

Cada test crea un baseCOMP con:
  - Red de operadores específica (POP/TOP/CHOP/SOP/DAT/MAT)
  - Parámetros configurados
  - Conexiones validadas
  - Errores = 0
  - Sin overlays en grilla (RULE 3)

Al final, el orquestador:
  - Corre /document en cada contenedor
  - Genera un reporte consolidado
  - Registra descubrimientos en discovery-log.md
  - Hace commit si todo pasó

Uso:
  python toe/src/test_orchestrator_massive.py
  python toe/src/test_orchestrator_massive.py --skip-unknown
"""

import json
import subprocess
import sys
import time
import os

# === CONFIG ===
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TESTS_DIR = os.path.join(PROJECT_ROOT, "toe", "src")

TESTS = [
    # (nombre, archivo, args adicionales, descripción)
    ("POP Chain Standard", "test_pop_integration.py",
     [], "boxPOP → noisePOP → particlePOP → nullPOP (4 nodes)"),
    ("POP Params Read-Back", "test_live_td_pop_params.py",
     [], "Parameter set/read-back via exec + /parameters (4 nodes, 6 critical params)"),
    ("Auto-Layout POP", "test_live_td_auto_layout.py",
     [], "Scatter + topological auto-layout (4 POP nodes)"),
    ("Sphere+Transform+Trail POP", "test_live_td_sphere_transform_trail.py",
     [], "spherePOP+transformPOP+trailPOP — 3 new families (6 nodes)"),
    ("Batch Endpoint", "test_live_td_batch_simple.py",
     [], "POST /batch with POP create/wire/param (4 nodes, partial error test)"),
    ("Comprehensive 7 Families", "test_live_td_comprehensive.py",
     [], "All 7 families + GLSL TOP + GLSL POP (23 nodes)"),
    ("GLSLcopy+Feedback POP", "test_live_td_pop_glslcopy_feedback.py",
     [], "glslcopyPOP(ptcomputedat), feedbackPOP(inputmul), /diagnose, /auto_layout (7 nodes)"),
    ("Advanced POP 2", "test_live_td_advanced_pop.py",
     [], "glslPOP, glsladvancedPOP, 3 parallel chains, custom attrs (20 nodes)"),
    ("Smart Connect", "test_live_td_smart_connect.py",
     [], "POST /smart_connect — 5 scenarios (auto-detect TOP/POP, explicit type)"),
    ("Document POP Network", "test_live_td_document_pop.py",
     [], "POST /document — 3 POP chains, 12 nodes, validate output structure"),
]

# Tests que requieren endpoints nuevos (pueden fallar si TD no recargó)
SKIP_IF_ENDPOINT_MISSING = {
    "Smart Connect": "/smart_connect",
    "Document POP Network": "/document",
    "GLSLcopy+Feedback POP": "/diagnose",
}


def check_endpoint(endpoint):
    """Quick check if an endpoint exists on the running TD server."""
    import urllib.request as req
    import urllib.error
    import json
    try:
        if endpoint == "/smart_connect":
            r = req.Request(f"http://localhost:44444/smart_connect",
                            data=b'{}', headers={"Content-Type": "application/json"},
                            method="POST")
            resp = req.urlopen(r, timeout=5)
            return True
        elif endpoint == "/diagnose":
            r = req.Request(f"http://localhost:44444/diagnose",
                            data=json.dumps({"path": "/project1"}).encode(),
                            headers={"Content-Type": "application/json"},
                            method="POST")
            resp = req.urlopen(r, timeout=5)
            return True
        else:
            # GET-based
            r = req.Request(f"http://localhost:44444{endpoint}", method="GET")
            resp = req.urlopen(r, timeout=5)
            return True
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return False
        return True  # Other errors might be transient
    except Exception:
        return True  # Assume it works if we can't check


def run_test(name, script, extra_args, description):
    """Run a single test with --keep and return results."""
    print(f"\n{'='*60}")
    print(f"🧪 TEST: {name}")
    print(f"   {description}")
    print(f"{'='*60}")

    script_path = os.path.join(TESTS_DIR, script)

    if not os.path.exists(script_path):
        return {"name": name, "status": "SKIP", "reason": f"File not found: {script}"}

    # Check if endpoint is available
    if name in SKIP_IF_ENDPOINT_MISSING:
        ep = SKIP_IF_ENDPOINT_MISSING[name]
        if not check_endpoint(ep):
            return {
                "name": name, "status": "SKIP",
                "reason": f"Endpoint {ep} not available (TD needs restart/reload)"
            }

    cmd = [sys.executable, script_path, "--keep"]
    cmd.extend(extra_args)

    try:
        start = time.time()
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=180,
                                cwd=PROJECT_ROOT)
        elapsed = time.time() - start

        # Parse results
        output = result.stdout
        error_output = result.stderr
        exit_code = result.returncode

        # Extract check counts
        passed = 0
        total = 0
        for line in output.split("\n"):
            if "RESULTS:" in line or "RESULT:" in line:
                import re
                m = re.search(r"(\d+)/(\d+)", line)
                if m:
                    passed = int(m.group(1))
                    total = int(m.group(2))

        status = "PASS" if exit_code == 0 else "FAIL"
        container_name = None
        for line in output.split("\n"):
            if "sandbox" in line.lower() and "created" in line.lower() and "/project1/" in line:
                parts = line.split("/project1/")
                if len(parts) > 1:
                    container_name = parts[1].strip().split()[0]
            if "/project1/" in line and ("created" in line.lower() or "sandbox" in line.lower()):
                parts = line.split("/project1/")
                if len(parts) > 1:
                    cn = parts[1].strip().split()[0].rstrip(".'\"")
                    if len(cn) > 3:
                        container_name = cn

        return {
            "name": name,
            "status": status,
            "passed": passed,
            "total": total,
            "exit_code": exit_code,
            "elapsed": round(elapsed, 1),
            "container": container_name,
            "output": output[-300:] if output else "",
            "error": error_output[-200:] if error_output else ""
        }
    except subprocess.TimeoutExpired:
        return {"name": name, "status": "TIMEOUT", "reason": ">180s"}
    except Exception as e:
        return {"name": name, "status": "ERROR", "reason": str(e)}


def document_containers(containers):
    """Call /document on each surviving container and return summaries."""
    import urllib.request as req
    import json

    docs = []
    for c in containers:
        if not c.get("container"):
            continue
        try:
            sandbox_path = f"/project1/{c['container']}"
            body = json.dumps({"path": sandbox_path}).encode()
            r = req.Request("http://localhost:44444/document",
                            data=body, headers={"Content-Type": "application/json"},
                            method="POST")
            resp = req.urlopen(r, timeout=10)
            doc = json.loads(resp.read().decode())
            docs.append({
                "name": c["name"],
                "container": c["container"],
                "summary": doc.get("summary", ""),
                "operators": doc.get("operator_count", 0),
                "connections": doc.get("connection_count", 0),
                "families": doc.get("families", {}),
                "roles": doc.get("roles", {}),
                "errors": doc.get("error_count", 0),
            })
        except Exception as e:
            docs.append({
                "name": c["name"],
                "container": c.get("container", "?"),
                "summary": f"/document unavailable: {e}",
                "operators": 0,
                "connections": 0,
                "families": {},
                "roles": {},
                "errors": -1,
            })
    return docs


def main():
    skip_unknown = "--skip-unknown" in sys.argv

    print("=" * 60)
    print("🚀 TD-MCP MASSIVE TEST ORCHESTRATOR")
    print(f"   {len(TESTS)} tests to execute")
    print("=" * 60)

    # Quick TD connectivity check
    import urllib.request as req
    try:
        r = req.urlopen("http://localhost:44444/info", timeout=5)
        info = json.loads(r.read().decode())
        print(f"\n✅ TD Server: OK (FPS={info.get('projectFPS','?')})")
    except Exception as e:
        print(f"\n❌ TD Server: NOT REACHABLE — {e}")
        print("   TouchDesigner debe estar abierto en puerto 44444.")
        sys.exit(1)

    results = []
    passed_count = 0
    failed_count = 0
    skipped_count = 0

    for name, script, extra_args, description in TESTS:
        result = run_test(name, script, extra_args, description)
        results.append(result)

        if result["status"] == "PASS":
            passed_count += 1
            print(f"  ✅ {name}: {result.get('passed',0)}/{result.get('total',0)} checks")
        elif result["status"] == "SKIP":
            skipped_count += 1
            print(f"  ⏭️  {name}: SKIPPED — {result.get('reason','')}")
        else:
            failed_count += 1
            print(f"  ❌ {name}: {result.get('status','FAIL')}")
            if result.get("error"):
                print(f"     Error: {result['error'][:200]}")

    # Document surviving containers
    print(f"\n{'='*60}")
    print("📋 Documenting surviving containers via /document...")
    docs = document_containers(results)
    print()

    # Summary table
    print(f"\n{'='*60}")
    print("📊 FINAL REPORT")
    print(f"{'='*60}")
    print(f"   Total tests: {len(TESTS)}")
    print(f"   ✅ Passed:   {passed_count}")
    print(f"   ❌ Failed:   {failed_count}")
    print(f"   ⏭️  Skipped:  {skipped_count}")
    print()

    # Container map
    print(f"{'─'*60}")
    print("🗺️  CONTAINER MAP (visible in TD network editor)")
    print(f"{'─'*60}")
    for r in results:
        if r["status"] == "PASS" and r.get("container"):
            print(f"  📦 {r['container']}")
            print(f"     Test: {r['name']}")
            print(f"     Checks: {r.get('passed',0)}/{r.get('total',0)}")
    for r in results:
        if r["status"] != "PASS" and r.get("container"):
            print(f"  ⚠️  {r['container']} (status={r['status']})")
    print()

    # Document table
    if docs:
        print(f"{'─'*60}")
        print("📄 /document SUMMARIES")
        print(f"{'─'*60}")
        for d in docs:
            print(f"  📦 {d['container']}")
            print(f"     {d['summary'][:120]}")
            if d.get("families"):
                fam_str = ", ".join(f"{k}={v}" for k, v in d["families"].items())
                print(f"     Families: {fam_str}")

    # Stats
    total_checks = sum(r.get("passed", 0) for r in results)
    total_nodes = sum(sum(v for v in d.get("families", {}).values()) for d in docs)

    print(f"\n{'─'*60}")
    print(f"📈 STATS")
    print(f"{'─'*60}")
    for r in results:
        if r["status"] == "PASS":
            print(f"  ✅ {r['name']}: {r.get('passed',0)}/{r.get('total',0)} checks ({r.get('elapsed',0)}s)")
    for r in results:
        if r["status"] == "FAIL":
            print(f"  ❌ {r['name']}: {r.get('status','FAIL')} ({r.get('elapsed',0)}s)")
    for r in results:
        if r["status"] == "SKIP":
            print(f"  ⏭️  {r['name']}: {r.get('reason','')}")

    print(f"\n{'='*60}")
    print(f"🏁 FINAL: {passed_count} passed, {failed_count} failed, {skipped_count} skipped")
    print(f"   Total checks: {total_checks}")
    print(f"   Total containers in TD: {sum(1 for r in results if r.get('container'))}")
    print(f"   Estimated node count: {total_nodes}")
    print(f"{'='*60}")

    # Exit code: 0 if all non-skipped passed
    sys.exit(0 if failed_count == 0 else 1)


if __name__ == "__main__":
    main()
