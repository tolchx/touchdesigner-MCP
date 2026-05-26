import concurrent.futures
import glob
import json
import os
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple


@dataclass(frozen=True)
class NodeInfo:
    name: str
    family: str
    op_type: str
    rel_path: str
    params: Dict[str, str]
    inputs: List[Tuple[int, str]]


@dataclass(frozen=True)
class ProjectData:
    project_name: str
    project_root: str
    toe_dir: str
    nodes: List[NodeInfo]
    scripts: List[Dict[str, str]]
    dependencies: List[str]
    operator_counts: Dict[str, int]
    families_counts: Dict[str, int]

class TDAnalyzer:
    def __init__(self, base_dir):
        self.base_dir = Path(base_dir)
        self.out_dir = self.base_dir / "Analisis_Maestro"
        self.repo_root = Path(__file__).resolve().parent
        self.docs_root = self.repo_root / "Docs"
        self.pops_db_dir = self.repo_root / "touchdesigner" / "mcp" / "data" / "pops"
        self.pops_ops_dir = self.pops_db_dir / "operators"
        self.pops_db = self._load_pops_db()
        self.docs_corpus = self._load_docs_corpus()

    def _load_pops_db(self) -> Dict[str, dict]:
        db: Dict[str, dict] = {}
        if not self.pops_ops_dir.exists():
            return db
        for p in sorted(self.pops_ops_dir.glob("*.json")):
            try:
                with open(p, "r", encoding="utf-8", errors="ignore") as f:
                    data = json.load(f)
                slug = data.get("pageSlug") or p.stem
                db[slug] = data
            except Exception:
                continue
        return db

    def _load_docs_corpus(self) -> Dict[str, str]:
        corpus: Dict[str, str] = {}
        if not self.docs_root.exists():
            return corpus
        for p in sorted(self.docs_root.glob("*")):
            if p.suffix.lower() not in {".md", ".txt", ".markdown"}:
                continue
            try:
                with open(p, "r", encoding="utf-8", errors="ignore") as f:
                    corpus[p.name] = f.read()
            except Exception:
                continue
        return corpus
    def analyze_project_folder(self, project_folder: Path) -> Optional[ProjectData]:
        project_name = project_folder.name
        toe_dirs = list(project_folder.glob("*.toe.dir"))
        if not toe_dirs:
            return None
        toe_dir = toe_dirs[0]

        nodes: List[NodeInfo] = []
        scripts: List[Dict[str, str]] = []
        dependencies: List[str] = []

        for root, _, files in os.walk(toe_dir):
            for file in files:
                filepath = Path(root) / file
                if file.endswith(".n"):
                    node_info = self._parse_n_file(filepath, toe_dir)
                    if node_info:
                        nodes.append(node_info)
                elif file.endswith((".py", ".glsl", ".frag", ".vert")):
                    try:
                        with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                            scripts.append(
                                {
                                    "name": file,
                                    "path": str(filepath.relative_to(toe_dir)),
                                    "content": f.read(),
                                }
                            )
                    except Exception:
                        continue
                elif file.lower().endswith((".mov", ".mp4", ".png", ".jpg", ".jpeg", ".exr", ".wav", ".mp3")):
                    dependencies.append(str(filepath.relative_to(toe_dir)))

        operator_counts = Counter(f"{n.family}:{n.op_type}" for n in nodes)
        families_counts = Counter(n.family for n in nodes)

        return ProjectData(
            project_name=project_name,
            project_root=str(project_folder),
            toe_dir=str(toe_dir),
            nodes=nodes,
            scripts=scripts,
            dependencies=sorted(set(dependencies)),
            operator_counts=dict(operator_counts),
            families_counts=dict(families_counts),
        )

    def _parse_n_file(self, filepath: Path, toe_dir: Path) -> Optional[NodeInfo]:
        try:
            with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                lines = f.readlines()
            if not lines:
                return None

            header = lines[0].strip()
            match = re.match(r"([A-Z]+):([a-zA-Z0-9_]+)", header)
            family = "Unknown"
            op_type = header
            if match:
                family = match.group(1)
                op_type = match.group(2)

            name = filepath.stem
            rel_path = str(filepath.relative_to(toe_dir))

            params: Dict[str, str] = {}
            parm_file = filepath.with_suffix(".parm")
            if parm_file.exists():
                with open(parm_file, "r", encoding="utf-8", errors="ignore") as pf:
                    for p_line in pf:
                        p_line = p_line.strip()
                        if not p_line or p_line == "?":
                            continue
                        parts = p_line.split()
                        if len(parts) >= 3:
                            params[parts[0]] = " ".join(parts[2:])
                        elif len(parts) == 2:
                            params[parts[0]] = parts[1]

            inputs: List[Tuple[int, str]] = []
            in_block = False
            for line in lines[1:]:
                s = line.strip()
                if s == "inputs":
                    in_block = True
                    continue
                if in_block and s == "{":
                    continue
                if in_block and s == "}":
                    in_block = False
                    continue
                if in_block:
                    m = re.match(r"^(\d+)\s+([^\s]+)$", s)
                    if m:
                        inputs.append((int(m.group(1)), m.group(2)))

            return NodeInfo(
                name=name,
                family=family,
                op_type=op_type,
                rel_path=rel_path,
                params=params,
                inputs=sorted(inputs, key=lambda x: x[0]),
            )
        except Exception:
            return None
    def _slug_from_node(self, node: NodeInfo) -> Optional[str]:
        if node.family != "POP":
            return None
        candidates = [
            f"{node.op_type[0].upper()}{node.op_type[1:]}_POP",
            f"{node.op_type.upper()}_POP",
        ]
        for c in candidates:
            if c in self.pops_db:
                return c
        for slug, data in self.pops_db.items():
            if data.get("tdOpTypeGuess") == f"{node.op_type}POP":
                return slug
        return None

    def _doc_snippets(self, keywords: List[str], max_hits: int = 3, context: int = 2) -> List[Tuple[str, str]]:
        hits: List[Tuple[str, str]] = []
        if not keywords:
            return hits
        pat = re.compile("|".join(re.escape(k) for k in keywords if k), re.IGNORECASE)
        for fname, content in self.docs_corpus.items():
            lines = content.splitlines()
            for i, line in enumerate(lines):
                if not pat.search(line):
                    continue
                start = max(0, i - context)
                end = min(len(lines), i + context + 1)
                snippet = "\n".join(l.strip() for l in lines[start:end] if l.strip())
                if snippet:
                    hits.append((fname, snippet))
                if len(hits) >= max_hits:
                    return hits
        return hits

    def generate_project_docs(self, project: ProjectData, global_operator_counts: Counter) -> None:
        project_root = Path(project.project_root)
        out_dir = project_root / "documentacion"
        out_dir.mkdir(parents=True, exist_ok=True)

        f0 = out_dir / "00_Overview.md"
        f1 = out_dir / "01_Network_Map.md"
        f2 = out_dir / "02_Operator_Reference.md"
        f3 = out_dir / "03_Templates_y_Reutilizacion.md"

        rel_links = {
            "overview": "00_Overview.md",
            "map": "01_Network_Map.md",
            "ops": "02_Operator_Reference.md",
            "tpl": "03_Templates_y_Reutilizacion.md",
        }

        nodes_by_family: Dict[str, List[NodeInfo]] = defaultdict(list)
        for n in project.nodes:
            nodes_by_family[n.family].append(n)

        per_component: Dict[str, List[NodeInfo]] = defaultdict(list)
        for n in project.nodes:
            parts = Path(n.rel_path).parts
            comp = "root"
            if "project1" in parts:
                idx = parts.index("project1")
                if idx + 1 < len(parts):
                    comp = parts[idx + 1]
            per_component[comp].append(n)

        local_counts = Counter(project.operator_counts)
        top_local = local_counts.most_common(10)
        top_global = global_operator_counts.most_common(10)

        has_particles = any(n.family == "POP" and n.op_type in {"particle", "particle_end"} for n in project.nodes)
        has_fields = any(n.family == "POP" and n.op_type == "field" for n in project.nodes)
        has_copy = any(n.family == "POP" and n.op_type == "copy" for n in project.nodes)
        has_topto = any(n.family == "POP" and n.op_type == "topto" for n in project.nodes)

        theory_keywords = []
        if has_particles:
            theory_keywords += ["Particle POP", "feedback", "Target Feedback Loop POP", "particlesupdatepop"]
        if has_fields:
            theory_keywords += ["Field POP", "Weight", "falloff"]
        if has_copy:
            theory_keywords += ["Copy POP", "template"]
        if has_topto:
            theory_keywords += ["TOP to POP", "VRAM"]
        snippets = self._doc_snippets(theory_keywords, max_hits=5)

        with open(f0, "w", encoding="utf-8") as f:
            f.write(f"# {project.project_name} — Overview\n\n")
            f.write(f"- Proyecto: `{project.project_name}`\n")
            f.write(f"- Fuente expandida: `{project.toe_dir}`\n")
            f.write(f"- Navegación: [{rel_links['map']}]({rel_links['map']}) | [{rel_links['ops']}]({rel_links['ops']}) | [{rel_links['tpl']}]({rel_links['tpl']})\n\n")

            f.write("## Propósito y Lógica General\n")
            f.write("Este documento describe qué hace el proyecto, cómo fluye la información entre operadores y por qué se tomaron ciertas decisiones arquitectónicas.\n\n")

            f.write("## Técnicas Detectadas\n")
            flags = []
            if has_particles:
                flags.append("Simulación de partículas con feedback loop (Particle POP)")
            if has_fields:
                flags.append("Campos volumétricos y pesos (Field POP / Weight)")
            if has_copy:
                flags.append("Instanciación en GPU (Copy POP)")
            if has_topto:
                flags.append("Interoperabilidad TOP→POP (TOP to POP)")
            if not flags:
                flags.append("Operadores generales y estructura de red (sin heurísticas POP destacadas)")
            for it in flags:
                f.write(f"- {it}\n")
            f.write("\n")

            f.write("## Composición (Componentes Principales)\n")
            for comp_name, comp_nodes in sorted(per_component.items(), key=lambda x: x[0]):
                f.write(f"- `{comp_name}`: {len(comp_nodes)} nodos\n")
            f.write("\n")

            f.write("## Análisis Comparativo\n")
            f.write("### Top 10 Operadores (Proyecto)\n")
            for op, count in top_local:
                f.write(f"- `{op}`: {count}\n")
            f.write("\n### Top 10 Operadores (Global en Toe_Expand)\n")
            for op, count in top_global:
                f.write(f"- `{op}`: {count}\n")
            f.write("\n")

            f.write("## Correlación Teoría ↔ Implementación\n")
            if snippets:
                for fname, snippet in snippets:
                    f.write(f"### Extracto relevante ({fname})\n")
                    f.write("```text\n")
                    f.write(snippet.strip() + "\n")
                    f.write("```\n\n")
            else:
                f.write("- No se encontraron extractos directos en `Docs/` para las palabras clave inferidas; la referencia principal se toma desde la base `touchdesigner/mcp/data/pops/operators/*.json`.\n\n")

            f.write("## Fuentes\n")
            f.write(f"- Base POPs: `{self.pops_ops_dir}`\n")
            f.write(f"- Documentación local: `{self.docs_root}`\n")

        with open(f1, "w", encoding="utf-8") as f:
            f.write(f"# {project.project_name} — Network Map\n\n")
            f.write(f"- Navegación: [{rel_links['overview']}]({rel_links['overview']}) | [{rel_links['ops']}]({rel_links['ops']}) | [{rel_links['tpl']}]({rel_links['tpl']})\n\n")

            f.write("## Mapa Global (Mermaid)\n")
            f.write("```mermaid\ngraph TD;\n")
            for n in project.nodes:
                node_id = re.sub(r"[^a-zA-Z0-9_]", "_", n.rel_path)
                label = f"{n.name} ({n.family}:{n.op_type})"
                f.write(f'    {node_id}["{label}"];\n')
            name_to_safe = {n.rel_path: re.sub(r"[^a-zA-Z0-9_]", "_", n.rel_path) for n in project.nodes}
            for n in project.nodes:
                dst = name_to_safe.get(n.rel_path)
                for _, src_name in n.inputs:
                    src_node = next((x for x in project.nodes if x.name == src_name), None)
                    if not src_node:
                        continue
                    src = name_to_safe.get(src_node.rel_path)
                    if src and dst:
                        f.write(f"    {src} --> {dst};\n")
            f.write("```\n\n")

            f.write("## Inventario por Familia\n")
            for fam, fam_nodes in sorted(nodes_by_family.items(), key=lambda x: x[0]):
                f.write(f"### {fam}\n")
                for n in sorted(fam_nodes, key=lambda x: x.name):
                    f.write(f"- `{n.name}` — `{n.op_type}` — `{n.rel_path}`\n")
                f.write("\n")

        with open(f2, "w", encoding="utf-8") as f:
            f.write(f"# {project.project_name} — Operator Reference\n\n")
            f.write(f"- Navegación: [{rel_links['overview']}]({rel_links['overview']}) | [{rel_links['map']}]({rel_links['map']}) | [{rel_links['tpl']}]({rel_links['tpl']})\n\n")
            f.write("## Operadores POP (con documentación oficial local)\n")

            pop_nodes = [n for n in project.nodes if n.family == "POP"]
            pop_by_type: Dict[str, List[NodeInfo]] = defaultdict(list)
            for n in pop_nodes:
                pop_by_type[n.op_type].append(n)

            if not pop_nodes:
                f.write("- No se detectaron nodos POP en este proyecto.\n\n")
            else:
                for op_type, nodes_list in sorted(pop_by_type.items(), key=lambda x: x[0]):
                    f.write(f"### POP:{op_type}\n")
                    slug = None
                    for n in nodes_list:
                        slug = self._slug_from_node(n)
                        if slug:
                            break
                    if slug and slug in self.pops_db:
                        data = self.pops_db[slug]
                        f.write(f"- Fuente: `{slug}.json`\n")
                        if data.get("summary"):
                            f.write(f"- Resumen: {data['summary']}\n")
                        if data.get("useCases"):
                            f.write("- Casos de uso:\n")
                            for u in data["useCases"][:5]:
                                f.write(f"  - {u}\n")
                        f.write("\n")

                        param_desc = {p.get("name"): p.get("description") for p in data.get("parameters", []) if p.get("name")}
                        aliases = {
                            "particlesupdatepop": "targetpop",
                            "particlesupdate": "targetpop",
                        }
                        f.write("#### Parámetros observados en el proyecto\n")
                        merged_params: Counter = Counter()
                        samples: Dict[str, str] = {}
                        for n in nodes_list:
                            for k, v in n.params.items():
                                merged_params[k] += 1
                                samples.setdefault(k, v)
                        for k, _ in merged_params.most_common():
                            lookup = aliases.get(k, k)
                            desc = param_desc.get(lookup) or param_desc.get(k) or ""
                            sample = samples.get(k, "")
                            f.write(f"- `{k}` = `{sample}`")
                            if desc:
                                f.write(f" — {desc}")
                            f.write("\n")
                        f.write("\n")

                        if data.get("troubleshooting"):
                            f.write("#### Troubleshooting (según docs)\n")
                            for t in data["troubleshooting"][:3]:
                                prob = t.get("problem")
                                fix = t.get("fix")
                                if prob and fix:
                                    f.write(f"- {prob} → {fix}\n")
                            f.write("\n")
                    else:
                        f.write("- Fuente: no encontrada en la base local `touchdesigner/mcp/data/pops/operators/`.\n")
                        f.write("- Nota: se documentan solo los parámetros observados en `.parm`.\n\n")
                        merged_params = Counter()
                        samples = {}
                        for n in nodes_list:
                            for k, v in n.params.items():
                                merged_params[k] += 1
                                samples.setdefault(k, v)
                        if merged_params:
                            for k, _ in merged_params.most_common():
                                f.write(f"- `{k}` = `{samples.get(k, '')}`\n")
                            f.write("\n")

            f.write("## Otros Operadores (familias no POP)\n")
            for fam, fam_nodes in sorted(nodes_by_family.items(), key=lambda x: x[0]):
                if fam == "POP":
                    continue
                f.write(f"### {fam}\n")
                types = Counter(n.op_type for n in fam_nodes).most_common(20)
                for t, c in types:
                    f.write(f"- `{fam}:{t}`: {c}\n")
                f.write("\n")

            f.write("## Referencias Cruzadas\n")
            f.write(f"- Base POPs: `{self.pops_ops_dir}`\n")
            f.write(f"- Docs locales: `{self.docs_root}`\n")

        with open(f3, "w", encoding="utf-8") as f:
            f.write(f"# {project.project_name} — Templates y Reutilización\n\n")
            f.write(f"- Navegación: [{rel_links['overview']}]({rel_links['overview']}) | [{rel_links['map']}]({rel_links['map']}) | [{rel_links['ops']}]({rel_links['ops']})\n\n")

            f.write("## Patrones Detectados\n")
            patterns: List[str] = []
            if has_particles:
                patterns.append("Solver de partículas con cierre de feedback loop (Particle → fuerzas → Null → Target Feedback Loop)")
            if has_fields:
                patterns.append("Modulación por campo usando `Weight` para activar/desactivar ruido, color o escala")
            if has_copy:
                patterns.append("Instanciación GPU con template (Copy POP) y atributos de orientación/escala")
            if not patterns:
                patterns.append("Estructura modular por componentes y cadenas de operadores por familia")
            for p in patterns:
                f.write(f"- {p}\n")
            f.write("\n")

            f.write("## Scripts Extraídos (si existen)\n")
            if not project.scripts:
                f.write("- No se detectaron scripts `.py`/`.glsl` dentro de la expansión.\n\n")
            else:
                for s in project.scripts:
                    f.write(f"- `{s['path']}`\n")
                f.write("\n")

            f.write("## Templates Propuestos (Skeletons)\n")
            if has_particles:
                f.write("### Particle POP — cadena mínima\n")
                f.write("```text\nFuente (sprinkle/pointgen) -> particle -> (forces/noise/limit) -> null_end\nparticle.target_feedback_loop_pop = null_end\n```\n\n")
            if has_fields:
                f.write("### Field POP — modulación por Weight\n")
                f.write("```text\npuntos -> field -> (noise/attribute/math) * Weight -> salida\n```\n\n")
            if has_copy:
                f.write("### Copy POP — instanciación por template\n")
                f.write("```text\ngeo_base -> copy (input0)\npoints_template (con Rot/Scale/Color) -> copy (input1)\n```\n\n")

            f.write("## Justificación de Decisiones (Guía)\n")
            f.write("- Mantener operaciones en GPU evita cuellos de botella CPU↔GPU.\n")
            f.write("- Un feedback loop explícito permite integración temporal estable y reproducible.\n")
            f.write("- Separar por componentes facilita reutilización y testing.\n")
    def run(self):
        """Ejecuta el escaneo en paralelo sobre todos los proyectos"""
        project_folders = [p for p in self.base_dir.iterdir() if p.is_dir() and p.name != "Analisis_Maestro"]
        project_folders = sorted(project_folders, key=lambda p: p.name.lower())
        if not project_folders:
            print(f"No se encontraron carpetas de proyectos en {self.base_dir}")
            return

        print(f"Iniciando análisis paralelo de {len(project_folders)} carpetas de proyectos...")

        projects: List[ProjectData] = []
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future_to_dir = {executor.submit(self.analyze_project_folder, p): p for p in project_folders}
            for future in concurrent.futures.as_completed(future_to_dir):
                proj = future.result()
                if proj:
                    projects.append(proj)

        if not projects:
            print("No se encontraron carpetas con expansión *.toe.dir dentro de Toe_Expand.")
            return

        global_counts = Counter()
        for p in projects:
            global_counts.update(p.operator_counts)

        with concurrent.futures.ThreadPoolExecutor() as executor:
            list(executor.map(lambda pr: self.generate_project_docs(pr, global_counts), projects))

        print(f"\n✅ Documentación generada: 4 archivos por proyecto en cada carpeta `<proyecto>/documentacion/`.")
if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        target = sys.argv[1]
    else:
        target = r"c:\Users\Tolch\Documents\AI_Code\Touchdesigner_MCP\claude-touchdesigner\Toe_Expand"
        
    analyzer = TDAnalyzer(target)
    analyzer.run()
