import sys, os, pathlib
w2t_path = r"C:\Users\Tolch\Documents\AI_Code\Touchdesigner_MCP\Main\w2t_server.py"
port = 18090
__file__ = w2t_path
source = open(w2t_path, "r", encoding="utf-8").read().replace(
    "PORT = 8090", f"PORT = 18090"
)
exec(compile(source, w2t_path, "exec"))
