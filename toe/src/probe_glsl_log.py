# -*- coding: utf-8 -*-
"""Log del compilador GLSL (infoDAT) — ruta corregida."""
import json
import urllib.request

CODE = r'''
import json
out = []
probe = op("/project1/glsl_attr_probe")
for c in probe.children:
    if c.OPType == "infoDAT":
        out.append({"nombre": c.name, "log": c.text[:1800]})
print(json.dumps(out, ensure_ascii=False))
'''

data = json.dumps({"code": CODE}).encode("utf-8")
req = urllib.request.Request("http://localhost:44444/exec", data=data,
                             headers={"Content-Type": "application/json"})
with urllib.request.urlopen(req, timeout=120) as fh:
    d = json.loads(json.load(fh).get("output", "[]") or "[]")
for item in d:
    print("=" * 72)
    print("###", item["nombre"])
    print(item["log"])
