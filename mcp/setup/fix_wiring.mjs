/**
 * fix_wiring.js — Send the wiring fix script to TD via /exec.
 * This bypasses the textport indentation issue.
 */
import http from "node:http";

const code = `import json
root = op("/")
comps = root.findChildren(depth=1, name="mcp_server")
if not comps:
    print("ERROR: No mcp_server found")
else:
    base = comps[0]
    print("Found: " + base.path)
    ws = None
    exec_dat = None
    td_api = None
    for child in base.children:
        if child.type == "webserverDAT":
            ws = child
            print("  WebServer: " + child.path)
        elif child.type == "executeDAT":
            exec_dat = child
            print("  Execute: " + child.path)
        elif child.type == "textDAT":
            td_api = child
            print("  TextDAT: " + child.path + " (" + str(len(child.text)) + " chars)")
    if td_api:
        try:
            td_api.par.extension = "pythonext"
            print("  Set extension = pythonext")
        except Exception as e:
            print("  ext error: " + str(e))
        try:
            td_api.par.customext = "TouchDesignerAPI"
            print("  Set customext = TouchDesignerAPI")
        except Exception as e:
            print("  customext error: " + str(e))
        try:
            td_api.par.language = "python"
            print("  Set language = python")
        except Exception as e:
            print("  lang error: " + str(e))
    if exec_dat:
        try:
            exec_dat.par.active = True
            print("  Execute active = True")
        except Exception as e:
            print("  exec active error: " + str(e))
        if "onHTTPRequest" in exec_dat.text:
            print("  Execute has onHTTPRequest callback")
        else:
            print("  WARNING: No onHTTPRequest callback!")
            print("  Text: " + exec_dat.text[:200])
    if ws and exec_dat:
        try:
            for conn in ws.outputConnectors[0].connections:
                ws.outputConnectors[0].disconnect(conn)
            ws.outputConnectors[0].connect(exec_dat.inputConnectors[0])
            print("  Wired WebServer -> Execute")
        except Exception as e:
            print("  Wire error: " + str(e))
    print("")
    print("Verification:")
    if ws:
        print("  Port: " + str(ws.par.port.eval()))
    if td_api and hasattr(td_api, "ext") and hasattr(td_api.ext, "TouchDesignerAPI"):
        print("  Extension loaded: YES")
    else:
        print("  Extension loaded: NO")
    print("Done!")
`;

const data = JSON.stringify({ code });
const req = http.request(
  {
    hostname: "localhost",
    port: 44444,
    path: "/exec",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(data),
    },
  },
  (res) => {
    let body = "";
    res.on("data", (c) => (body += c));
    res.on("end", () => {
      try {
        const j = JSON.parse(body);
        if (j.output) console.log(j.output);
        if (j.error) console.error("ERROR:", j.error);
      } catch {
        console.log(body);
      }
    });
  }
);
req.on("error", (e) => console.log("Error:", e.message));
req.write(data);
req.end();
