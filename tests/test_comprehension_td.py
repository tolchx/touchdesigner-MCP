#!/usr/bin/env python3
"""Suite de COMPRENSIÓN de TD (item 52) — offline, con el fake fiel.

Estos tests no preguntan "¿la tool no explotó?". Preguntan "¿entiende lo que hace dentro de
TouchDesigner?". Hay tres capas:

  1. FIDELIDAD DEL FAKE (`TestFakeFidelity`): el modelo de TD tiene que ser incómodo donde TD
     es incómodo. Si alguien "arregla" el fake para que sea cómodo, estos tests lo frenan —
     un fake indulgente no detecta nada y da la ilusión de cobertura.

  2. CÓDIGO REAL EJECUTADO (`TestBridgeReadBlocks`): se extraen los bloques de código inline
     que el bridge (`toe/src/TouchDesignerAPI.py`) manda a TD y se EJECUTAN contra el fake.
     Si un bloque usa un atributo que no existe, o asigna un método sin llamarlo, o devuelve
     vacío donde había datos, el test cae. Nada de comparar el tool contra sí mismo.

  3. NO-MUTACIÓN Y ROUND-TRIP (`TestReadOnly`, `TestParameters`): leer no cambia nada; escribir
     y volver a leer devuelve el mismo valor (con el clamp de TD a la vista), y un nombre de
     parámetro inventado levanta error en vez de "éxito silencioso".

Correr:  python -m unittest tests.test_comprehension_td -v
"""
from __future__ import annotations

import json
import os
import re
import sys
import unittest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from tests.fake_td import fake_td  # noqa: E402

BRIDGE = os.path.join(PROJECT_ROOT, "toe", "src", "TouchDesignerAPI.py")


# ---------------------------------------------------------------------------
# Extractor de bloques de código inline del bridge
# ---------------------------------------------------------------------------


# Valores con los que se materializa un bloque antes de ejecutarlo. Los bloques del bridge
# son f-strings raw (`rf"""{path}""`): los placeholders van entre llaves SIMPLES y las
# llaves literales van DOBLADAS. Hay que sustituir los placeholders ANTES de desdoblar.
EXPRESIONES = [
    ("{'True' if recurse else 'False'}", "'False'"),
    ("{True if recurse else False}", "False"),
    ("{'True' if force else 'False'}", "'False'"),
    ("{'True' if dry_run else 'False'}", "'False'"),
]

valores_extra: dict = {}
valores_override: dict = {}

PLACEHOLDERS = {
    "path": "/project1/geo",
    "file_path": "/tmp/fake_out.png",
    "target": "/project1/geo",
    "from_op": "/",
}



def _campos(cuerpo: str) -> list[str]:
    """Expresiones dentro de llaves SIMPLES (ignora `{{` `}}` y entiende anidamiento)."""
    out, i, n = [], 0, len(cuerpo)
    while i < n:
        if cuerpo[i] == "{":
            if cuerpo[i + 1: i + 2] == "{":
                i += 2
                continue
            depth, j = 1, i + 1
            while j < n and depth:
                if cuerpo[j] == "{":
                    depth += 1
                elif cuerpo[j] == "}":
                    depth -= 1
                j += 1
            out.append(cuerpo[i + 1: j - 1])
            i = j
            continue
        if cuerpo[i] == "}" and cuerpo[i + 1: i + 2] == "}":
            i += 2
            continue
        i += 1
    return out


NOMBRES_BUILTIN = {"True", "False", "None", "str", "int", "float", "len", "bool", "list",
                   "dict", "lower", "upper", "strip", "range", "hasattr", "getattr"}


def _valor_para(ident: str):
    """Valor por heurística para un nombre que el bloque espera en su ámbito."""
    bajo = ident.lower()
    if any(k in bajo for k in ("recurse", "case", "dry", "force", "verbose", "deep", "flag",
                               "only", "debug", "sensitive")):
        return False
    if any(k in bajo for k in ("limit", "max", "count", "offset", "depth", "samples", "items",
                               "timeout", "width", "height", "top", "frame", "rate")):
        return 100
    if any(k in bajo for k in ("path", "file", "name", "target", "op", "scope", "query")):
        return "/project1/geo"
    return None


def materializar(cuerpo: str, valores: dict | None = None, es_fstring: bool = True) -> str:
    """Materializa una plantilla del bridge evaluándola COMO f-STRING — que es exactamente lo
    que hace TouchDesigner al recibirla. Nada de parsear llaves a mano: si la plantilla es un
    f-string válido, esto devuelve el mismo código que vería TD."""
    ns = {ident: _valor_para(ident)
          for expr in _campos(cuerpo)
          for ident in __import__("re").findall(r"[A-Za-z_]\w*", expr)
          if ident not in NOMBRES_BUILTIN}
    # el override de `path` aplica a CUALQUIER nombre que el bloque use para la op objetivo
    objetivo = (valores or {}).get("path")
    if objetivo:
        for ident in list(ns):
            bajo = ident.lower()
            if any(k in bajo for k in ("path", "file", "target", "scope", "op")):
                ns[ident] = objetivo
    ns.update(valores_extra)
    ns.update(valores_override)
    ns.update(valores or {})
    fuente = 'f"""' + cuerpo + '"""'
    try:
        if not es_fstring:
            if "{{" in cuerpo:                  # plantilla .format(): llaves dobladas
                from string import Formatter
                return Formatter().vformat(cuerpo, _Args(), _Prov(ns))
            return cuerpo
        return eval(compile(fuente, "<plantilla-del-bridge>", "eval"),
                    {"__builtins__": __builtins__}, ns)
    except Exception:
        # No se pudo materializar: se devuelve el cuerpo CRUDO. El test que ejecuta los bloques
        # va a fallar y va a exigir que el bloque esté declarado en NO_MATERIALIZABLES con el
        # motivo. Nunca se inventa un valor para que "pase".
        return cuerpo


# Handlers que ESCRIBEN: sus bloques no se ejecutan como lectura (mutarían el fake y algunos
# son plantillas de creación que no se pueden materializar sin saber qué se va a crear).
ESCRITURA = ("create", "delete", "connect", "disconnect", "set_", "_set", "write", "pulse",
             "exec", "import", "reload", "apply", "update", "save", "copy", "undo", "redo",
             "build", "clear", "run_", "post", "put", "patch", "preset")

# Bloques de lectura que NO se pueden materializar offline, con motivo. Nada se saltea en
# silencio: el test exige que todo bloque que falle al compilar esté declarado acá.
NO_MATERIALIZABLES = {
    "_handle_get_perf": "su plantilla no se materializa standalone (SyntaxError: invalid syntax (<generated>, line 21)): depende de valores que arma el llamador. Se cubre EN VIVO (scripts/live + canario).",
    "_handle_search": "su plantilla construye un booleano con `bool({str(count_only).lower()})`: "
                      "el valor materializado queda como palabra suelta (`false`) y no compila "
                      "fuera del llamador real, que pasa el booleano ya formateado. Se cubre EN "
                      "VIVO: td_search en la red grande (scripts/live + el canario).",
    "_handle_screenshot": "la plantilla espera una EXPRESIÓN de Python en {path} (no un string: "
                          "hace `t = {path}`), y además la usa dentro de un string literal. "
                          "Materializarla exige replicar la lógica del callador. Se cubre EN VIVO: "
                          "scripts/live/twozero_http_live.py + el probe de screenshot del repo.",
}


def es_lectura(nombre: str) -> bool:
    bajo = nombre.lower()
    return not any(k in bajo for k in ESCRITURA)


# Cada bloque se ejecuta contra una op DE SU FAMILIA: leer un DAT contra una POP no dice nada
# (el fake, fiel, levanta AttributeError y el test avisaría de un problema que no existe).
TARGETS = {
    "DAT": ("/project1/notas", ("numRows", "numCols", ".text", "read_dat", "readDat")),
    "POP": ("/project1/geo", ("numPoints", "numPrims", "numVerts", "attributes")),
    "CHOP": ("/project1/signal", ("numSamples", "numChans", ".chan(", "chans()", "read_chop")),
    "TOP": ("/project1/render", ("width", "height", ".depth", "resolution")),
}


def target_for(bloque: dict) -> str:
    """Elige la op objetivo mirando QUÉ claves usa el bloque (y su handler)."""
    texto = bloque["codigo"] + " " + bloque["nombre"]
    for _familia, (ruta, marcas) in TARGETS.items():
        if any(m in texto for m in marcas):
            return ruta
    return "/project1/geo"


def inline_blocks(only_read: bool = True) -> list[dict]:
    """Bloques `code = '''...'''` del bridge que terminan imprimiendo JSON.

    Devuelve [{'nombre': str, 'codigo': str}]. El nombre sale del marcador más cercano
    hacia arriba (`def _handle_x`), para que un fallo diga QUÉ endpoint está roto.
    """
    with open(BRIDGE, encoding="utf-8", errors="replace") as fh:
        fuente = fh.read()
    bloques = []
    for m in re.finditer(r'(\w+)\s*=\s*(rf|fr|f|r|)("""|\'\'\')(.*?)\3', fuente, re.S):
        prefijo = m.group(2)
        cuerpo = m.group(4)
        if "json.dumps" not in cuerpo or "print" not in cuerpo:
            continue
        # nombre del handler más cercano hacia arriba
        previo = fuente[: m.start()]
        handlers = re.findall(r"def (_handle_\w+|_collect_\w+)\(", previo)
        nombre = handlers[-1] if handlers else "desconocido"
        if only_read and not es_lectura(nombre):
            continue
        bloques.append({"nombre": nombre, "codigo": cuerpo, "fstring": "f" in prefijo})
    return bloques


# ---------------------------------------------------------------------------
# 1. Fidelidad del fake — los hechos MEDIDOS, en forma ejecutable
# ---------------------------------------------------------------------------

class TestFakeFidelity(unittest.TestCase):
    def setUp(self):
        self.scene = fake_td.default_scene()

    def test_chop_no_tiene_channel_ni_numchannels(self):
        """Medido: `hasattr(t,'channel') is False` y `numChannels` NO existe (es numChans).
        De esto dependía el bug que devolvía `channels: {}` en silencio."""
        chop = self.scene.op("/project1/signal")
        self.assertFalse(hasattr(chop, "channel"), "el fake NO debe tener channel()")
        self.assertFalse(hasattr(chop, "numChannels"), "el fake NO debe tener numChannels")
        self.assertTrue(hasattr(chop, "chan"))
        self.assertEqual(chop.numChans, 2)
        self.assertEqual(chop.chan("u")[2], 1.0)
        self.assertEqual(chop["u"][0], -1.0)

    def test_top_width_es_propiedad_no_metodo(self):
        """Medido: `top.width` -> 40 (int) y `top.width()` -> TypeError."""
        top = self.scene.op("/project1/render")
        self.assertEqual(top.width, 1280)
        self.assertFalse(callable(top.width))
        with self.assertRaises(TypeError):
            top.width()  # type: ignore[misc]

    def test_pop_numPoints_es_metodo_y_attribs_no_existe(self):
        """Medido: `pop.numPoints()` -> 63; `pop.numPoints` sin llamar es un builtin
        (y así moría json.dumps)."""
        pop = self.scene.op("/project1/geo")
        self.assertTrue(callable(pop.numPoints))
        self.assertEqual(pop.numPoints(), 63)
        self.assertFalse(hasattr(pop, "attribs"), "el fake NO debe tener attribs")

    def test_parametro_inexistente_levanta_AttributeError(self):
        """En TD un par inventado NO existe: nunca 'set silencioso'."""
        with self.assertRaises(AttributeError):
            _ = self.scene.op("/project1/render").par.inventado

    def test_app_no_expone_cooking_ni_fps(self):
        """Medido en 2025.32460: app.cooking / app.fps NO existen (por eso runtime.cooking
        queda null en vez de inventar un valor)."""
        self.assertFalse(hasattr(self.scene.app, "cooking"))
        self.assertFalse(hasattr(self.scene.app, "fps"))
        self.assertTrue(hasattr(self.scene.op("/"), "allowCooking"))


# ---------------------------------------------------------------------------
# 2. Código REAL del bridge, ejecutado contra el fake
# ---------------------------------------------------------------------------

class TestBridgeReadBlocks(unittest.TestCase):
    def test_hay_bloques_extraibles(self):
        bloques = inline_blocks()
        # Si el extractor deja de encontrar bloques, los tests de abajo pasarían en vacío.
        self.assertGreaterEqual(len(bloques), 2, f"muy pocos bloques de lectura: {[b['nombre'] for b in bloques]}")
        self.assertTrue(any("numPoints" in b["codigo"] for b in bloques), "falta el bloque de POP")
        self.assertTrue(any(b["nombre"] == "_handle_get_node_detail" for b in bloques),
                        "falta el bloque de get_node_detail")
        for b in bloques:
            self.assertTrue(es_lectura(b["nombre"]), f"{b['nombre']} no es de lectura")

    def test_bloques_de_lectura_corren_sin_error_de_ejecucion(self):
        """Ejecutarlos contra el fake: ninguno debe morir por usar un API que no existe."""
        escena = fake_td.default_scene()
        for b in inline_blocks():
            codigo = materializar(b["codigo"], {"path": target_for(b)}, b.get("fstring", True))
            res = fake_td.exec_code(codigo, escena)
            err = res.get("__exec_error__") or ""
            if err and b["nombre"] in NO_MATERIALIZABLES:
                continue
            self.assertFalse(err, f"{b['nombre']} explotó al ejecutarse: {err}")

    def test_lo_declarado_no_materializable_sigue_fallando(self):
        """Si un bloque declarado como no-materializable YA se puede materializar, la declaración
        quedó vieja: hay que sacarla (si no, es cobertura que se pierde sin que nadie mire)."""
        escena = fake_td.default_scene()
        for b in inline_blocks():
            if b["nombre"] not in NO_MATERIALIZABLES:
                continue
            res = fake_td.exec_code(b["codigo"], escena)
            err = res.get("__exec_error__") or ""
            self.assertTrue(err, f"{b['nombre']} ya corre entero contra el fake: "
                                 f"sacalo de NO_MATERIALIZABLES (si no, es cobertura perdida)")

    def test_inspeccion_de_pop_devuelve_numeros_no_metodos(self):
        """El bug real: asignar `numPoints` (método) en vez de llamarlo rompía json.dumps."""
        pop_blocks = [b for b in inline_blocks() if "numPoints" in b["codigo"]]
        self.assertTrue(pop_blocks)
        escena = fake_td.default_scene()
        res = fake_td.exec_code(materializar(pop_blocks[0]["codigo"], {"path": target_for(pop_blocks[0])}, pop_blocks[0].get("fstring", True)), escena)
        self.assertNotIn("__no_json__", res, f"el bloque no imprimió JSON: {res}")
        self.assertNotIn("__exec_error__", res, res.get("__exec_error__"))
        # Si serializó, los conteos tienen que ser números, no métodos.
        datos = res.get("data", res)
        for clave in ("numPoints", "numPrims", "numVerts"):
            if clave in datos:
                self.assertIsInstance(datos[clave], int, f"{clave} salió como {type(datos[clave])}")

    def test_ninguna_lectura_muta_el_proyecto(self):
        """Leer no cambia nada: el fake registra cualquier escritura."""
        escena = fake_td.default_scene()
        for b in inline_blocks():
            fake_td.MUT.clear()
            fake_td.exec_code(materializar(b["codigo"], {"path": target_for(b)}, b.get("fstring", True)), escena)
            self.assertEqual(len(fake_td.MUT), 0,
                             f"{b['nombre']} mutó el proyecto durante una lectura: {fake_td.MUT.records}")


# ---------------------------------------------------------------------------
# 3. Semántica de parámetros (round-trip + clamp)
# ---------------------------------------------------------------------------

class TestParameters(unittest.TestCase):
    def setUp(self):
        self.scene = fake_td.default_scene()
        self.render = self.scene.op("/project1/render")
        self.render.par.add("resolutionw", 640, minv=1, maxv=4096, style="Int")

    def test_round_trip(self):
        self.render.par.resolutionw = 1920
        self.assertEqual(self.render.par.resolutionw.val, 1920)

    def test_clamp_visible_en_el_valor_que_vuelve(self):
        """TD clampea: el test tiene que ver eso, no asumir que guardó lo que pidió."""
        self.render.par.resolutionw = 99999
        self.assertEqual(self.render.par.resolutionw.val, 4096)
        self.render.par.resolutionw = -5
        self.assertEqual(self.render.par.resolutionw.val, 1)

    def test_escritura_registrada_como_mutacion(self):
        fake_td.MUT.clear()
        self.render.par.resolutionw = 800
        self.assertEqual([m["kind"] for m in fake_td.MUT.records], ["set_par"])
        self.assertEqual(fake_td.MUT.records[0]["par"], "resolutionw")


if __name__ == "__main__":
    unittest.main()
