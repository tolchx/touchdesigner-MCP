# TD-MCP API Reference

## Server
- **URL**: `http://localhost:44444`
- **Protocol**: HTTP JSON
- **Content-Type**: `application/json`

## Core Endpoints

### GET /info
Returns TouchDesigner build info.
```json
{"build": "2025.32280", "version": "...", "projectFPS": 60.0}
```

### GET /operators?path=/
List operators at a path.
```json
{
  "path": "/",
  "operators": [
    {"name": "project1", "type": "container", "opType": "containerCOMP"}
  ]
}
```

### GET /connections?path=/&recurse=false
Get the connection graph (wires) for operators.
```json
{
  "path": "/",
  "operators": [
    {"name": "noise1", "inputs": [], "outputs": ["/project1/blur1"]}
  ]
}
```

### GET /parameters?path=/project1/noise1&names=amp,freq
Get parameter values for an operator.

### POST /parameters/set
Set parameters transactionally. Body:
```json
{"path": "/project1/noise1", "params": {"amp": 0.5, "freq": 10}}
```

### POST /exec
Execute Python code in TouchDesigner context. Body:
```json
{"code": "print(op('/project1/noise1').par.amp.eval())"}
```

### GET /editor/selection
Get currently selected operators.

### POST /create
Create a new operator. Body:
```json
{"type": "noiseTOP", "path": "/project1", "name": "noise1"}
```

### POST /connect
Wire two operators. Body:
```json
{"src": "/project1/noise1", "dst": "/project1/blur1", "input": 0}
```

### POST /disconnect
Remove a wire. Body:
```json
{"path": "/project1/blur1", "input": 0}
```

## Verification Pattern
After creating/wiring operators, ALWAYS run:
```
GET /connections?path=/project1&recurse=false
```
to verify the network structure is correct.

Then run:
```
POST /exec {"code": "print([n.error for n in op('/project1').findChildren(tds.TDERROR)])"}
```
to check for errors.
