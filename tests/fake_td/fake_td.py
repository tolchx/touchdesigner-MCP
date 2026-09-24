#!/usr/bin/env python3
"""fake_td.py — fake FIEL de la API de Python de TouchDesigner (item 52).

Por qué existe: verificar un MCP de TD contra el eco de sus propias tools no verifica nada.
La suite tenía 1324 tests verdes y dos rutas de lectura ROTAS desde siempre
(`readChop` llamaba `t.channel()`, que no existe; `popInspect` usaba `numPoints` sin llamarlo
y `json.dumps` moría). Ninguna prueba las veía porque todas comparaban el tool contra sí mismo.

Este fake **ejecuta** el código generado contra un modelo de TD construido a partir de lo
MEDIDO en 2025.32460 (no de lo que uno supondría). Es deliberadamente incómodo: donde TD no
tiene el atributo, el fake tampoco lo tiene.

HECHOS MEDIDOS QUE EL FAKE RESPETA (24/09/26, TD 2025.32460 real)
  CHOP  · existe  `chan(nombre)`, `chans()`, `t[nombre][i]`, `numSamples`, `numChans`
        · NO existe `channel(...)` ni `numChannels`  <-- así se rompía readChop en silencio
  TOP   · `width`/`height`/`depth` son PROPIEDADES (int); `width()` levanta TypeError
  POP   · `numPoints`/`numPrims`/`numVerts` son MÉTODOS; `attribs` NO existe
  DAT   · `.text`, `.numRows`, `.numCols`
  PAR   · `t.par.nombre` -> AttributeError si no existe (nunca un set silencioso)
  app   · build/product/commercial/osName/osVersion (NO app.cooking, NO app.fps)
  root  · allowCooking (bool), time.play (bool)

Además REGISTRA TODA MUTACIÓN (set de parámetro, creación, conexión, borrado) para poder
afirmar que una operación de lectura no tocó nada.

Uso como harness (desde Node o desde los tests Python):
    python tests/fake_td/fake_td.py <archivo_con_codigo.py> [--scene scene.json]
Imprime en stdout el JSON que el código haya impreso (última línea JSON), o
{"error": "..."} si el código no imprimió nada.
"""
from __future__ import annotations

import json
import sys
import types
from pathlib import Path


# ---------------------------------------------------------------------------
# Registro de mutaciones
# ---------------------------------------------------------------------------

class Mutations:
    def __init__(self) -> None:
        self.records: list[dict] = []

    def add(self, kind: str, **data) -> None:
        self.records.append({"kind": kind, **data})

    def clear(self) -> None:
        self.records.clear()

    def __len__(self) -> int:
        return len(self.records)


MUT = Mutations()


# ---------------------------------------------------------------------------
# Parámetros
# ---------------------------------------------------------------------------

class FakePar:
    def __init__(self, owner: "FakeOP", name: str, val, default=None, style: str = "Float",
                 minv=None, maxv=None, label: str | None = None, mode: str = "CONSTANT") -> None:
        object.__setattr__(self, "_owner", owner)
        object.__setattr__(self, "_name", name)
        object.__setattr__(self, "_val", val)
        object.__setattr__(self, "default", default if default is not None else val)
        object.__setattr__(self, "style", style)
        object.__setattr__(self, "_min", minv)
        object.__setattr__(self, "_max", maxv)
        object.__setattr__(self, "label", label or name.capitalize())
        object.__setattr__(self, "mode", mode)
        object.__setattr__(self, "expr", "")

    @property
    def name(self) -> str:
        return object.__getattribute__(self, "_name")

    @property
    def val(self):
        return object.__getattribute__(self, "_val")

    @val.setter
    def val(self, new):
        # TD clampea al rango del parámetro: el fake lo imita (los tests de round-trip
        # dependen de esto: si el valor que vuelve no es el que se pidió, hay que verlo).
        lo = object.__getattribute__(self, "_min")
        hi = object.__getattribute__(self, "_max")
        if isinstance(new, (int, float)) and not isinstance(new, bool):
            if lo is not None and new < lo:
                new = lo
            if hi is not None and new > hi:
                new = hi
        object.__setattr__(self, "_val", new)
        MUT.add("set_par", op=object.__getattribute__(self, "_owner").path,
                par=object.__getattribute__(self, "_name"), value=new)


class FakeParCollection:
    def __init__(self, owner: "FakeOP") -> None:
        self._owner = owner
        self._pars: dict[str, FakePar] = {}

    def add(self, name: str, val, **kw) -> FakePar:
        p = FakePar(self._owner, name, val, **kw)
        self._pars[name] = p
        return p

    def __setattr__(self, name: str, value):
        """En TD `t.par.algo = v` ASIGNA el parámetro (pasa por el setter del par, con clamp).
        Sin esto el fake sería cómodo donde TD es estricto y un round-trip mal escrito pasaría."""
        if name.startswith("_"):
            object.__setattr__(self, name, value)
            return
        pars = self.__dict__.get("_pars", {})
        if name in pars:
            pars[name].val = value
            return
        raise AttributeError(f"'{self._owner.OPType}' object has no attribute '{name}'  Context:{self._owner.path}")

    def __getattr__(self, name: str):
        pars = object.__getattribute__(self, "_pars")
        if name in pars:
            return pars[name]
        # En TD esto levanta AttributeError: un nombre inventado NUNCA debe pasar en silencio.
        raise AttributeError(f"'{object.__getattribute__(self, '_owner').OPType}' object has no "
                            f"attribute '{name}'  Context:{object.__getattribute__(self, '_owner').path}")

    def __iter__(self):
        return iter(self._pars.values())


# ---------------------------------------------------------------------------
# Operadores
# ---------------------------------------------------------------------------

class FakeOP:
    family = "COMP"

    def __init__(self, path: str, optype: str, **kw) -> None:
        self.path = path
        self.name = path.rstrip("/").split("/")[-1] or "/"
        self.OPType = optype
        self.par = FakeParCollection(self)
        self.inputConnectors: list = []
        self.children: list[FakeOP] = []
        self.viewer = False
        self.allowCooking = True
        self.errors = ""
        self.warnings = ""
        self.cookTime = 0.0
        self._storage: dict = {}
        for k, v in kw.items():
            setattr(self, k, v)


    # --- API de storage de TD (usado por los bloques de memoria del bridge) ---
    def store(self, key, value=None, **_kw):
        self._storage[key] = value

    def fetch(self, key, default=None, **_kw):
        return self._storage.get(key, default)

    def unstore(self, *keys):
        for k in keys:
            self._storage.pop(k, None)

    def pars(self):
        return list(self.par)

    def errors(self, recurse: bool = False) -> str:
        return self.errors

    def warnings(self, recurse: bool = False) -> str:
        return self.warnings

    def cook(self, force: bool = False) -> None:
        return None


class FakeChannel:
    def __init__(self, name: str, vals: list) -> None:
        self.name = name
        self._vals = list(vals)

    def __getitem__(self, i):
        return self._vals[i]

    def __len__(self):
        return len(self._vals)

    def __iter__(self):
        return iter(self._vals)


class FakeCHOP(FakeOP):
    family = "CHOP"

    def __init__(self, path: str, optype: str = "nullCHOP", channels: dict | None = None,
                 num_samples: int | None = None, **kw) -> None:
        super().__init__(path, optype, **kw)
        chans = channels or {}
        self._channels = {k: FakeChannel(k, v) for k, v in chans.items()}
        self.numSamples = num_samples if num_samples is not None else (
            len(next(iter(chans.values()))) if chans else 0)
        self.numChans = len(chans)          # numChans EXISTE; numChannels NO (medido)
        self.time = types.SimpleNamespace(play=True)

    def chans(self):
        return list(self._channels.values())

    def chan(self, name):
        return self._channels.get(name)

    def __getitem__(self, name):
        if name in self._channels:
            return self._channels[name]
        raise KeyError(name)

    # OJO: `channel()` y `numChannels` NO se definen a propósito (no existen en TD).


class FakeTOP(FakeOP):
    family = "TOP"

    def __init__(self, path: str, optype: str = "nullTOP", width: int = 40, height: int = 40,
                 depth: int = 1, **kw) -> None:
        super().__init__(path, optype, **kw)
        # Propiedades, no métodos (medido: top.width() -> TypeError en TD)
        self.width = width
        self.height = height
        self.depth = depth


class FakePOP(FakeOP):
    family = "POP"

    def __init__(self, path: str, optype: str = "nullPOP", points: int = 0, prims: int = 0,
                 verts: int = 0, **kw) -> None:
        super().__init__(path, optype, **kw)
        self._points, self._prims, self._verts = points, prims, verts
        # Métodos, no propiedades (medido: numPoints() -> 63, numPoints sin llamar -> builtin)
        # `attribs` NO se define a propósito.

    def numPoints(self):
        return self._points

    def numPrims(self):
        return self._prims

    def numVerts(self):
        return self._verts


class FakeDAT(FakeOP):
    family = "DAT"

    def __init__(self, path: str, optype: str = "textDAT", text: str = "", **kw) -> None:
        super().__init__(path, optype, **kw)
        self.text = text

    @property
    def numRows(self) -> int:
        return len(self.text.split("\n")) if self.text else 0

    def __getitem__(self, key):
        """En TD un DAT se indexa como tabla: `t[fila, columna]` devuelve una celda con `.val`."""
        if isinstance(key, tuple):
            fila, col = key
            filas = [l.split("\t") for l in self.text.split("\n")] if self.text else []
            if 0 <= fila < len(filas) and 0 <= col < len(filas[fila]):
                return types.SimpleNamespace(val=filas[fila][col])
            return None
        raise KeyError(key)

    @property
    def numCols(self) -> int:
        first = (self.text.split("\n")[0] if self.text else "")
        return len(first.split("\t")) if first else 0


class FakeSOP(FakeOP):
    family = "SOP"


# ---------------------------------------------------------------------------
# Escena
# ---------------------------------------------------------------------------

FAMILIAS = {"CHOP": FakeCHOP, "TOP": FakeTOP, "POP": FakePOP, "DAT": FakeDAT, "SOP": FakeSOP,
            "MAT": FakeOP, "COMP": FakeOP}


class Scene:
    def __init__(self, ops: dict | None = None, app_kw: dict | None = None,
                 project_kw: dict | None = None) -> None:
        self.ops: dict[str, FakeOP] = {}
        self.app = types.SimpleNamespace(**{
            "build": "2025.32460", "product": "TouchDesigner", "commercial": True,
            "osName": "Windows", "osVersion": "10.0.26100", "releaseType": "official",
            **(app_kw or {}),
        })
        self.project = types.SimpleNamespace(**{
            "folder": "C:/fake/project", "name": "fake.toe", "cookRate": 60.0,
            **(project_kw or {}),
        })
        self.me = types.SimpleNamespace(time=types.SimpleNamespace(rate=60.0, play=True))
        self.ui = types.SimpleNamespace(performMode=False)
        for path, spec in (ops or {}).items():
            self.add(path, spec)
        self.root = self.add("/", {"family": "COMP", "optype": "baseCOMP"})

    def add(self, path: str, spec: dict) -> FakeOP:
        familia = spec.get("family", "COMP")
        cls = FAMILIAS.get(familia, FakeOP)
        kw = {k: v for k, v in spec.items()
              if k not in ("family", "optype", "pars", "channels", "text", "num_samples")}
        if familia == "CHOP":
            op = cls(path, spec.get("optype", "nullCHOP"), channels=spec.get("channels"),
                     num_samples=spec.get("num_samples"), **kw)
        elif familia == "DAT":
            op = cls(path, spec.get("optype", "textDAT"), text=spec.get("text", ""), **kw)
        else:
            op = cls(path, spec.get("optype", f"null{familia}"), **kw)
        for nombre, valspec in (spec.get("pars") or {}).items():
            if isinstance(valspec, dict):
                op.par.add(nombre, valspec.get("val"), **{k: v for k, v in valspec.items() if k != "val"})
            else:
                op.par.add(nombre, valspec)
        # parentesco
        parent_path = path.rsplit("/", 1)[0] or "/"
        parent = self.ops.get(parent_path)
        if parent is not None and op is not parent:
            parent.children.append(op)
        self.ops[path] = op
        return op

    def op(self, path: str):
        if path in self.ops:
            return self.ops[path]
        return self.ops.get(path.rstrip("/") or "/")

    def globals(self) -> dict:
        tdu = types.SimpleNamespace(gpuMemoryUsed=1024 * 1024, Build=f"{self.app.build}",
                                    version="099")
        return {"op": self.op, "app": self.app, "project": self.project, "me": self.me,
                "ui": self.ui, "tdu": tdu, "parent": lambda: self.root, "root": self.root,
                "__builtins__": __builtins__}


def default_scene() -> Scene:
    """Escena de referencia: una op de cada familia con datos reconocibles."""
    return Scene({
        "/project1": {"family": "COMP", "optype": "baseCOMP"},
        "/project1/audio": {"family": "CHOP", "optype": "audiodeviceinCHOP",
                            "channels": {"chan1": [0.0, 0.5, 0.75, 1.0]}},
        "/project1/signal": {"family": "CHOP", "optype": "mathCHOP",
                             "channels": {"u": [-1.0, 0.0, 1.0], "v": [0.25, 0.25, 0.25]}},
        "/project1/vacio": {"family": "CHOP", "optype": "nullCHOP", "channels": {},
                            "num_samples": 0},
        "/project1/render": {"family": "TOP", "optype": "rampTOP", "width": 1280, "height": 720},
        "/project1/geo": {"family": "POP", "optype": "linePOP", "points": 63, "prims": 3,
                          "verts": 66},
        "/project1/notas": {"family": "DAT", "optype": "textDAT", "text": "a\tb\nc\td\ne\tf"},
        "/project1/geo2": {"family": "SOP", "optype": "poptoSOP"},
    })


# ---------------------------------------------------------------------------
# Harness
# ---------------------------------------------------------------------------

def exec_code(code: str, scene: Scene | None = None) -> dict:
    """Ejecuta `code` con los globales del fake y devuelve el JSON que imprimió."""
    scene = scene or default_scene()
    salida: list[str] = []
    globs = scene.globals()
    globs["print"] = lambda *a, **k: salida.append(" ".join(str(x) for x in a))
    MUT.clear()
    try:
        exec(compile(code, "<generated>", "exec"), globs)  # noqa: S102 - es un harness de test
    except BaseException as e:  # noqa: BLE001
        return {"__exec_error__": f"{type(e).__name__}: {e}", "__stdout__": salida}
    for linea in reversed(salida):
        linea = linea.strip()
        if linea.startswith("{"):
            try:
                return json.loads(linea)
            except json.JSONDecodeError:
                continue
    return {"__no_json__": True, "__stdout__": salida}


def scene_from_file(path: str) -> Scene:
    spec = json.loads(Path(path).read_text(encoding="utf-8"))
    return Scene(spec.get("ops"), spec.get("app"), spec.get("project"))


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    codigo = Path(sys.argv[1]).read_text(encoding="utf-8")
    scene = None
    if "--scene" in sys.argv:
        scene = scene_from_file(sys.argv[sys.argv.index("--scene") + 1])
    resultado = exec_code(codigo, scene)
    resultado["__mutations__"] = MUT.records
    print(json.dumps(resultado, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
