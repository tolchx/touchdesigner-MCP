#!/usr/bin/env python3
"""
TouchDesigner MCP — Auto Setup: Generación automática del .tox vía TD API.

Este script se conecta al TouchDesignerAPI ya corriendo en TD y crea
automáticamente los operadores necesarios, los configura y exporta
el resultado como archivo .tox.

REQUIERE:
  • TouchDesigner abierto con TouchDesignerAPI corriendo (puerto 44444)
  • Python 3.8+ con `requests` instalado

Uso:
    pip install requests
    python mcp/setup/auto_setup.py

Opciones:
    python mcp/setup/auto_setup.py --port 55555    # Puerto personalizado
    python mcp/setup/auto_setup.py --output /ruta/mi_servidor.tox
    python mcp/setup/auto_setup.py --td-port 44444  # Puerto del API de TD
"""

import argparse
import json
import os
import sys
import textwrap
import urllib.request
import urllib.error
import time

# ── Rutas ───────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
TOE_EXTENSION_PATH = os.path.join(SCRIPT_DIR, "toe_extension.py")
OUTPUT_DIR = SCRIPT_DIR
DEFAULT_TOX = os.path.join(OUTPUT_DIR, "TouchDesigner_MCP_Server.tox")
API_PORT = 44444  # Puerto donde corre TouchDesignerAPI


# ── API CLIENT ──────────────────────────────────────────────────────

class TDAPIClient:
    """Cliente HTTP para TouchDesignerAPI."""

    def __init__(self, host: str = "localhost", port: int = API_PORT):
        self.base_url = f"http://{host}:{port}"

    def _request(self, method: str, path: str, body: str = "") -> dict:
        """Ejecuta una petición HTTP al API de TD."""
        url = f"{self.base_url}{path}"
        data = body.encode("utf-8") if body else None

        req = urllib.request.Request(
            url,
            data=data,
            method=method,
            headers={"Content-Type": "application/json"} if data else {},
        )

        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                raw = resp.read().decode("utf-8")
                return {"success": True, "data": json.loads(raw), "raw": raw}
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8", errors="replace")
            try:
                return {"success": False, "data": json.loads(raw), "raw": raw, "code": e.code}
            except json.JSONDecodeError:
                return {"success": False, "data": {"error": raw}, "raw": raw, "code": e.code}
        except urllib.error.URLError as e:
            return {"success": False, "data": {"error": f"Conexión fallida: {e.reason}"}}
        except Exception as e:
            return {"success": False, "data": {"error": str(e)}}

    def health(self) -> dict:
        """Verifica que el API responda."""
        return self._request("GET", "/health")

    def info(self) -> dict:
        """Obtiene información de TouchDesigner."""
        return self._request("GET", "/info")

    def exec_code(self, code: str, from_op: str = "/") -> dict:
        """Ejecuta código Python en TouchDesigner."""
        body = json.dumps({"code": code, "fromOp": from_op})
        return self._request("POST", "/exec", body)


# ── SCRIPTS TD ──────────────────────────────────────────────────────

def _make_create_scene_code(output_path: str, port: int) -> str:
    """
    Genera el código Python para TouchDesigner que:
    1. Crea el Base COMP raíz
    2. Crea WebServer DAT, Text DAT, Execute DAT
    3. Configura parámetros y conexiones
    4. Exporta como .tox

    El código se envía a TD vía /exec. Usamos str.format() para las
    variables y escapamos las llaves para f-strings de Python en TD.
    """
    code = (
        'import zipfile\n'
        'import os\n'
        'import io\n'
        'import json\n'
        '\n'
        f'output_path = r"{output_path}"\n'
        f'api_port = {port}\n'
        '\n'
        '# -- 1. Crear Base COMP raiz\n'
        'parent = op("/")\n'
        'base = parent.create(baseCOMP)\n'
        'base.name = "mcp_server"\n'
        'base.nodeX = 0\n'
        'base.nodeY = 0\n'
        '\n'
        '# -- 2. Agregar WebServer DAT\n'
        'ws = base.create(webserverDAT)\n'
        'ws.name = "webserver1"\n'
        'ws.par.Active = True\n'
        'ws.par.Port = api_port\n'
        'ws.par.Methods = "GET, POST, PUT, DELETE"\n'
        'ws.par.Allowwan = False\n'
        'ws.nodeX = 100\n'
        'ws.nodeY = 0\n'
        '\n'
        '# -- 3. Agregar Text DAT con el codigo Python\n'
        'td_api = base.create(textDAT)\n'
        'td_api.name = "touchdesigner_api"\n'
        'td_api.nodeX = -200\n'
        'td_api.nodeY = 0\n'
        '\n'
        f'script_path = r"{TOE_EXTENSION_PATH}"\n'
        'if os.path.exists(script_path):\n'
        '    with open(script_path, "r") as f:\n'
        '        code_text = f.read()\n'
        '    td_api.text = code_text\n'
        'else:\n'
        '    td_api.text = "# Error: toe_extension.py no encontrado"\n'
        '\n'
        'td_api.par.Enable = True\n'
        'td_api.par.Module = "TouchDesignerAPI"\n'
        'td_api.par.Class = "TouchDesignerAPI"\n'
        '\n'
        '# -- 4. Agregar Execute DAT con callback\n'
        'exec_dat = base.create(executeDAT)\n'
        'exec_dat.name = "execute1"\n'
        'exec_dat.nodeX = 100\n'
        'exec_dat.nodeY = -150\n'
        'exec_dat.par.Httprequest = True\n'
        '\n'
        'exec_code = """def onHTTPRequest(dat, request):\n'
        '    me = op(\'../touchdesigner_api\')\n'
        '    if me and hasattr(me, \'TouchDesignerAPI\'):\n'
        '        api = me.store(\'api\')\n'
        '        if api is None:\n'
        '            api = me.TouchDesignerAPI()\n'
        '            me.store(\'api\', api)\n'
        '        return api.handle_request(dat, request)\n'
        '    return {\'status\': 500, \'body\': \'API not initialized\'}\n'
        '"""\n'
        'exec_dat.text = exec_code\n'
        '\n'
        '# -- 5. Conectar WebServer DAT -> Execute DAT\n'
        'ws.outputConnectors[0].connect(exec_dat.inputConnectors[0])\n'
        '\n'
        '# -- 6. Exponer parametros en el Base COMP\n'
        'try:\n'
        '    base.par.Port = api_port\n'
        'except:\n'
        '    base.addPar({\n'
        '        "name": "Port", "label": "Puerto", "style": "Int",\n'
        '        "default": api_port, "min": 1024, "max": 65535\n'
        '    })\n'
        '    base.addPar({\n'
        '        "name": "Debug", "label": "Debug", "style": "Toggle",\n'
        '        "default": 0\n'
        '    })\n'
        '\n'
        'try:\n'
        '    ws.par.Port.expr = "parent().par.Port"\n'
        'except:\n'
        '    pass\n'
        '\n'
        '# -- 7. Exportar como .tox\n'
        'success = False\n'
        'try:\n'
        '    base.exporttox(output_path)\n'
        '    print("exporttox succeeded: " + output_path)\n'
        '    success = True\n'
        'except Exception as e:\n'
        '    print("exporttox failed: " + str(e))\n'
        '\n'
        'info = {\n'
        '    "output_path": output_path,\n'
        '    "component_path": base.path,\n'
        '    "port": api_port,\n'
        '    "success": success,\n'
        '}\n'
        'print(json.dumps(info))\n'
    )
    return code


# ── GENERACIÓN DEL .tox vía API ────────────────────────────────────

def build_via_td_api(td_host: str = "localhost", td_port: int = API_PORT,
                     output_path: str = None, server_port: int = 44444) -> str:
    """
    Construye el .tox conectándose al TouchDesigner que ya está
    corriendo con la API activa.

    Flujo:
      1. Verifica conexión con TD (health check)
      2. Genera el código Python para crear los operadores
      3. Envía el código a TD vía /exec
      4. TD crea los operadores, configura parámetros y exporta .tox
      5. Devuelve la ruta del .tox generado

    Returns:
        Ruta del .tox generado.
    """
    if output_path is None:
        output_path = DEFAULT_TOX

    output_path = os.path.abspath(output_path)
    api = TDAPIClient(td_host, td_port)

    print(f"🔌 Conectando a TouchDesigner en {td_host}:{td_port}...")

    # 1. Health check
    health = api.health()
    if not health["success"]:
        print(f"❌ No se puede conectar a TouchDesigner: {health['data'].get('error')}")
        print()
        print("   Asegúrate de que:")
        print("   1. TouchDesigner esté abierto")
        print(f"   2. El TouchDesignerAPI esté corriendo en puerto {td_port}")
        print("   3. No haya firewall bloqueando la conexión")
        print()
        print("   Si TD no está corriendo, usa generate_tox.py:")
        print("   python mcp/setup/generate_tox.py")
        return None

    # 2. Obtener información de TD
    td_info = api.info()
    if td_info["success"]:
        info = td_info["data"]
        print(f"✅ Conectado — TD Build: {info.get('touchdesigner', {}).get('build', 'desconocido')}")
    else:
        print("⚠️  Conectado, pero no se pudo obtener info de TD")

    # 3. Verificar que toe_extension.py exista
    if not os.path.exists(TOE_EXTENSION_PATH):
        print(f"⚠️  No se encuentra {TOE_EXTENSION_PATH}")
        print("   Ejecutando create_tox.py para generarlo...")
        sys.path.insert(0, SCRIPT_DIR)
        import create_tox
        create_tox.main()

    # 4. Generar y enviar el script de creación
    print("🏗️  Enviando script de creación a TouchDesigner...")
    code = _make_create_scene_code(output_path, server_port)
    code = code.replace("{{", "{").replace("}}", "}")

    result = api.exec_code(code)
    if not result["success"]:
        print(f"❌ Error ejecutando script en TD:")
        print(f"   {result['data'].get('error', 'Error desconocido')}")
        return None

    # 5. Parsear resultado
    output = result["data"].get("output", "")
    error = result["data"].get("error", "")

    if output:
        print(f"📤 Salida de TD:")
        for line in output.strip().split("\n"):
            print(f"   > {line}")

    if error:
        print(f"⚠️  Errores de TD:")
        for line in error.strip().split("\n"):
            print(f"   ⚠️  {line}")

    # Buscar JSON de resultado en output
    result_json = None
    for line in output.strip().split("\n"):
        try:
            line = line.strip()
            if line.startswith("{"):
                result_json = json.loads(line)
                break
        except json.JSONDecodeError:
            continue

    if result_json:
        print(f"\n✅ .tox generado: {result_json.get('output_path', output_path)}")
    elif os.path.exists(output_path):
        print(f"\n✅ .tox generado: {output_path}")
    else:
        # El script no devolvió confirmación — verificar si el archivo existe
        if os.path.exists(output_path):
            print(f"\n✅ .tox generado: {output_path}")
        else:
            print(f"\n⚠️  No se pudo confirmar la creación del .tox en {output_path}")
            print("   Posibles causas:")
            print("   1. TD no pudo exportar el .tox (versión incompatible)")
            print("   2. La carpeta de salida no tiene permisos de escritura")
            print("   3. TouchDesignerAPI versión antigua")
            print()
            print("   Alternativa: usa generate_tox.py")
            print("   python mcp/setup/generate_tox.py")

    if os.path.exists(output_path):
        print(f"\n📦 Tamaño: {os.path.getsize(output_path):,} bytes")

    return output_path if os.path.exists(output_path) else None


# ── VERIFICACIÓN ───────────────────────────────────────────────────

def verify_api_running(host: str = "localhost", port: int = API_PORT) -> bool:
    """Verifica si TouchDesignerAPI está corriendo."""
    api = TDAPIClient(host, port)
    health = api.health()
    return health["success"]


# ── PUNTO DE ENTRADA ────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="TouchDesigner MCP — Auto Setup de .tox vía API",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""\
            Ejemplos:
              python auto_setup.py
              python auto_setup.py --td-port 44444
              python auto_setup.py --port 55555 --output ./mi_servidor.tox
        """),
    )
    parser.add_argument(
        "--td-host", default="localhost",
        help="Host/IP de TouchDesigner (default: localhost)"
    )
    parser.add_argument(
        "--td-port", type=int, default=44444,
        help="Puerto del TouchDesignerAPI (default: 44444)"
    )
    parser.add_argument(
        "--port", type=int, default=44444,
        help="Puerto que usará el WebServer DAT (default: 44444)"
    )
    parser.add_argument(
        "--output", default=None,
        help=f"Ruta del .tox de salida (default: {DEFAULT_TOX})"
    )

    args = parser.parse_args()
    output = args.output or DEFAULT_TOX

    print("=" * 60)
    print("  TouchDesigner MCP — Auto Setup (.tox vía API)")
    print("=" * 60)
    print()

    # Verificar conexión primero
    if not verify_api_running(args.td_host, args.td_port):
        print("⚠️  TouchDesigner no está corriendo con la API activa.")
        print()
        print("📋 Opciones:")
        print(f"   A) Abre TD, carga el .toe y ejecuta:")
        print(f"      python auto_setup.py --td-host localhost --td-port {args.td_port}")
        print()
        print(f"   B) Usa el generador offline:")
        print(f"      python mcp/setup/generate_tox.py")
        print()
        print(f"   C) Sigue la guía manual:")
        print(f"      cat mcp/setup/tox_instructions.md")
        return

    print(f"🎯 Puerto del WebServer: {args.port}")
    print(f"📁 Salida: {output}")
    print()

    build_via_td_api(
        td_host=args.td_host,
        td_port=args.td_port,
        output_path=output,
        server_port=args.port,
    )


if __name__ == "__main__":
    main()
