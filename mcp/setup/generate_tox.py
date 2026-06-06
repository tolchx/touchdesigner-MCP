#!/usr/bin/env python3
"""
TouchDesigner .tox Generator — MCP Server Extension

Generates a ready-to-use .tox file that can be dragged into any
TouchDesigner project. The .tox contains:

  • A Base COMP named "mcp_server" with exposed Port / Debug parameters
  • A WebServer DAT listening on the configured port
  • A Text DAT containing the full TouchDesigner API (as Python extension)
  • An Execute DAT routing HTTP callbacks to the extension

Uso:
    python mcp/setup/generate_tox.py

Esto crea el archivo:
    mcp/setup/TouchDesigner_MCP_Server.tox

Luego arrastra el .tox a cualquier proyecto de TouchDesigner.

────────────────────────────────────────────────────────────────────
Estructura del .tox:

El .tox es un archivo ZIP con extensión .tox que contiene:

  contents.xml  — Definición completa del componente y sus hijos
  toc.xml       — Tabla de contenidos (ayuda a TD a mapear operadores)

La estructura interna del Base COMP "mcp_server" será:

  mcp_server/           (Base COMP)
  ├── webserver1        (WebServer DAT)
  ├── touchdesigner_api (Text DAT, Python extension)
  └── execute1          (Execute DAT)
"""

import os
import sys
import zipfile
import textwrap

# ── Rutas ──────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = SCRIPT_DIR
TOX_NAME = "TouchDesigner_MCP_Server.tox"
TOE_EXTENSION_PATH = os.path.join(SCRIPT_DIR, "toe_extension.py")

VERSION = "3.0.0"
BUILD = 28000  # TD build number compatible con 2022.28000+


def _load_code() -> str:
    """Carga el código de toe_extension.py."""
    if not os.path.exists(TOE_EXTENSION_PATH):
        print(f"⚠️  No se encuentra {TOE_EXTENSION_PATH}")
        print("   Ejecutando create_tox.py para generarlo...")
        sys.path.insert(0, SCRIPT_DIR)
        import create_tox
        create_tox.main()

    with open(TOE_EXTENSION_PATH, "r", encoding="utf-8") as f:
        return f.read()


def _xml_escape(text: str) -> str:
    """Escapa texto para XML de forma segura."""
    text = text.replace("&", "&amp;")
    text = text.replace("<", "&lt;")
    text = text.replace(">", "&gt;")
    text = text.replace('"', "&quot;")
    text = text.replace("'", "&apos;")
    return text


def _build_contents_xml(api_code: str, exec_code: str) -> str:
    """
    Construye el XML del .tox manualmente (sin ElementTree) para
    tener control total sobre cómo se embeden los bloques de código.

    TouchDesigner espera que el contenido de <textContent> NO esté
    XML-escaped — lo lee como raw text. Pero como XML válido requiere
    escapado, ponemos el código dentro de <![CDATA[ ... ]]>.
    """
    api_code_escaped = _xml_escape(api_code)
    exec_code_escaped = _xml_escape(exec_code)

    xml = f'''<?xml version="1.0" encoding="utf-8"?>
<toe version="1.0" build="{BUILD}" app="TouchDesigner" opShortcut="1" autocomplete="0">

  <!-- Páginas de parámetros -->
  <parPage name="Custom" label="Custom"/>

  <!-- Parámetros expuestos -->
  <par name="Port" label="Puerto" style="Int" default="44444" page="Custom" min="1024" max="65535" order="0"/>
  <par name="Debug" label="Debug" style="Toggle" default="0" page="Custom" order="1"/>

  <!-- ══════════════════════════════════════════════════════════════
       Base COMP raíz: mcp_server
       ══════════════════════════════════════════════════════════════ -->
  <op name="mcp_server" type="base" family="COMP" width="300" height="200" x="0" y="0"
      viewer="1" publish="1" allowcooking="1" bypass="0" clone="" cloneimmune="0">

    <parref name="Port" page="Custom"/>
    <parref name="Debug" page="Custom"/>

    <pars>
      <par name="Port" label="Puerto" style="Int" default="44444" page="Custom" min="1024" max="65535" order="0"/>
      <par name="Debug" label="Debug" style="Toggle" default="0" page="Custom" order="1"/>
    </pars>
  </op>

  <!-- ══════════════════════════════════════════════════════════════
       Hijos del Base COMP
       ══════════════════════════════════════════════════════════════ -->
  <childOps>

    <!-- ─── WebServer DAT ────────────────────────────────────── -->
    <op name="webserver1" type="webserver" family="DAT" width="300" height="200" x="100" y="0"
        active="1" port="44444" methods="GET, POST, PUT, DELETE" allowwan="0"
        indexpages="" maxrequestsize="10485760" timeout="30">

      <export parname="Port" sourceop="../mcp_server" sourcepar="Port"/>

      <pars>
        <par name="Active" label="Active" style="Toggle" default="1" page="Server1"/>
        <par name="Port" label="Port" style="Int" default="44444" page="Server1" min="1" max="65535"/>
        <par name="Methods" label="HTTP Methods" style="Str" default="GET, POST, PUT, DELETE" page="Server1"/>
        <par name="Allowwan" label="Allow WAN" style="Toggle" default="0" page="Server1"/>
        <par name="Maxrequestsize" label="Max Request Size" style="Int" default="10485760" page="Server2"/>
        <par name="Timeout" label="Timeout" style="Float" default="30" page="Server2"/>
      </pars>
    </op>

    <!-- ─── Text DAT (extensión Python) ──────────────────────── -->
    <op name="touchdesigner_api" type="text" family="DAT" width="600" height="400" x="-300" y="0"
        extension="1" module="TouchDesignerAPI" class="TouchDesignerAPI"
        enable="1" language="python">

      <textContent><![CDATA[{api_code}]]></textContent>

      <pars>
        <par name="Enable" label="Extension" style="Toggle" default="1" page="Common"/>
        <par name="Module" label="Module" style="Str" default="TouchDesignerAPI" page="Common"/>
        <par name="Classc" label="Class" style="Str" default="TouchDesignerAPI" page="Common"/>
        <par name="Language" label="Language" style="Menu" default="python" page="Common"/>
      </pars>
    </op>

    <!-- ─── Execute DAT ──────────────────────────────────────── -->
    <op name="execute1" type="execute" family="DAT" width="400" height="200" x="100" y="-200"
        httprequest="1">

      <textContent><![CDATA[{exec_code}]]></textContent>

      <pars>
        <par name="Httprequest" label="HTTP Request" style="Toggle" default="1" page="Execute"/>
      </pars>
    </op>

  </childOps>

</toe>'''
    # Apply XML escaping ONLY to the CDATA-embedded code
    # Actually, CDATA means no escaping needed! The raw Python code
    # can contain &, <, >, etc. and it's fine inside CDATA.
    # But we already escaped — let's unescape because CDATA doesn't need it.
    # Wait — if we put escaped content inside CDATA, the user would see
    # &amp;lt; in their code. That's wrong. CDATA means raw text.
    # So we should NOT escape the code when using CDATA.
    pass  # CDATA preserves raw text — no XML escaping needed
    return xml


def _build_toc_xml() -> str:
    """Genera toc.xml con la tabla de contenidos del .tox."""
    return f'''<?xml version="1.0" encoding="utf-8"?>
<toe app="TouchDesigner" version="1.0" build="{BUILD}">
  <ops>
    <op name="mcp_server" family="COMP" type="base" path="/"/>
    <op name="webserver1" family="DAT" type="webserver" path="/mcp_server"/>
    <op name="touchdesigner_api" family="DAT" type="text" path="/mcp_server"/>
    <op name="execute1" family="DAT" type="execute" path="/mcp_server"/>
  </ops>
</toe>'''


# ── GENERADOR PRINCIPAL ────────────────────────────────────────────

def generate_tox(output_path: str = None) -> str:
    """
    Genera un archivo .tox completamente funcional.

    Args:
        output_path: Ruta de salida para el .tox (default: setup/TouchDesigner_MCP_Server.tox)

    Returns:
        Ruta absoluta del archivo .tox generado.
    """
    if output_path is None:
        output_path = os.path.join(OUTPUT_DIR, TOX_NAME)
    output_path = os.path.abspath(output_path)

    # Cargar código
    print("📖 Cargando toe_extension.py...")
    api_code = _load_code()

    # Código del Execute DAT
    exec_code = textwrap.dedent(r'''
    def onHTTPRequest(dat, request):
        """Callback del WebServer DAT — enruta peticiones a la extensión."""
        me = op('../touchdesigner_api')
        if me and hasattr(me, 'TouchDesignerAPI'):
            api = me.store('api')
            if api is None:
                api = me.TouchDesignerAPI()
                me.store('api', api)
            return api.handle_request(dat, request)
        return {'status': 500, 'body': 'API not initialized'}
    ''').strip()

    # Generar XML
    print("🏗️  Generando contents.xml...")
    contents_xml = _build_contents_xml(api_code, exec_code)

    print("🏗️  Generando toc.xml...")
    toc_xml = _build_toc_xml()

    # Crear .tox (ZIP)
    print(f"📦 Creando {output_path}...")
    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("contents.xml", contents_xml.encode("utf-8"))
        zf.writestr("toc.xml", toc_xml.encode("utf-8"))

    file_size = os.path.getsize(output_path)
    print(f"✅ .tox generado: {output_path}")
    print(f"   Tamaño: {file_size:,} bytes")
    print()
    print("📋 Para usar:")
    print("   1. Abre TouchDesigner")
    print("   2. Arrastra el archivo .tox al network editor")
    print("   3. El componente 'mcp_server' se creará automáticamente")
    print("   4. Abre http://localhost:44444/info en tu navegador")
    print()
    print("⚙️  Parámetros expuestos:")
    print("   • Port  (int)    — Puerto HTTP (default: 44444)")
    print("   • Debug (toggle) — Activar logs de depuración")
    print()
    print("💡 Si el .tox no carga correctamente, usa auto_setup.py:")
    print("   python mcp/setup/auto_setup.py")
    print("   (requiere TouchDesigner corriendo con la API activa)")

    return output_path


# ── VERIFICACIÓN ───────────────────────────────────────────────────

def verify_tox(tox_path: str) -> bool:
    """
    Verifica que el .tox generado sea estructuralmente válido
    (contiene los archivos necesarios, el XML es parseable, etc.)
    """
    print(f"🔍 Verificando {tox_path}...")
    errors = []

    try:
        with zipfile.ZipFile(tox_path, "r") as zf:
            # Verificar archivos requeridos
            required = ["contents.xml", "toc.xml"]
            for f in required:
                if f not in zf.namelist():
                    errors.append(f"Falta archivo requerido: {f}")

            # Verificar que contents.xml es XML válido
            if "contents.xml" in zf.namelist():
                import xml.etree.ElementTree as ET
                try:
                    root = ET.fromstring(zf.read("contents.xml"))
                    if root.tag != "toe":
                        errors.append("contents.xml: root element no es <toe>")

                    # Verificar que exista el Base COMP
                    ops = root.findall(".//op[@name='mcp_server']")
                    if not ops:
                        errors.append("contents.xml: no se encontró <op name='mcp_server'>")
                    else:
                        print(f"   ✅ Found: {len(ops)} mcp_server op(s)")

                    # Verificar childOps
                    child_ops = root.findall(".//childOps/op")
                    op_names = [o.get("name") for o in child_ops]
                    print(f"   ✅ Child ops found: {', '.join(op_names)}")

                    # Verificar CDATA blocks
                    xml_text = zf.read("contents.xml").decode("utf-8")
                    if "<![CDATA[" in xml_text:
                        cdata_count = xml_text.count("<![CDATA[")
                        print(f"   ✅ CDATA blocks: {cdata_count}")
                    else:
                        errors.append("contents.xml: no CDATA blocks found")

                except ET.ParseError as e:
                    errors.append(f"contents.xml: XML parse error: {e}")

            # Verificar toc.xml
            if "toc.xml" in zf.namelist():
                import xml.etree.ElementTree as ET
                try:
                    ET.fromstring(zf.read("toc.xml"))
                    print("   ✅ toc.xml: XML válido")
                except ET.ParseError as e:
                    errors.append(f"toc.xml: XML parse error: {e}")

    except zipfile.BadZipFile:
        errors.append("No es un archivo ZIP válido")

    if errors:
        print("❌ Errores encontrados:")
        for e in errors:
            print(f"   - {e}")
        return False

    print("✅ .tox verificado correctamente")
    return True


# ── PUNTO DE ENTRADA ────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  TouchDesigner MCP — Generador de .tox")
    print("=" * 60)
    print()

    output = generate_tox()
    print()

    # Verificar
    verify_tox(output)
    print()
    print("✅ ¡Listo!")


if __name__ == "__main__":
    main()
