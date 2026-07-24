def onHTTPRequest(webServerDAT, request):
    uri = request.get("uri", "/")
    if uri == "/" or uri == "/index.html":
        path_str = r"C:/Users/Tolch/Documents/AI_Code/Touchdesigner_MCP/Main/web2touch/index.html"
        import pathlib
        f = pathlib.Path(path_str)
        if f.exists():
            return {"statusCode": 200, "data": f.read_text(encoding="utf-8"), "contentType": "text/html"}
    return {"statusCode": 200, "data": "<h1>HOLA</h1>", "contentType": "text/html"}

def onWebSocketOpen(ws, cid, req):
    print("W2T: connected " + str(cid))

def onWebSocketClose(ws, cid):
    print("W2T: disconnected " + str(cid))

def onWebSocketText(ws, cid, data):
    import json
    try:
        msg = json.loads(data)
        t = op("/project1/neon_values")
        found = -1
        for r in range(1, t.numRows):
            if t[r,0].val == str(msg.get("id",cid)): found = r; break
        if found < 0:
            t.appendRow([str(msg.get("id",cid)), str(msg.get("type","")), str(msg.get("value","")), str(msg.get("timestamp",""))])
        else:
            t[found,2] = str(msg.get("value",""))
            t[found,3] = str(msg.get("timestamp",""))
    except Exception as e:
        print("W2T err: " + str(e))

def onWebSocketBinary(ws, cid, data):
    pass
