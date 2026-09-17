/**
 * glslValidate — GLSL POP shader safety net for the MCP write path.
 *
 * Port of the verified Python analyzer (tests/test_glsl_pop_offline.py) plus
 * the apply flow from docs/GLSL_POP_RULES.md (all rules verified live on
 * TD 2025.32460 by toe/src/test_glsl_pops.py):
 *
 *   R1: the OUTPUT cannot be read in the same shader — `P[id] = P[id] * 1.001;`
 *       fails to compile; read the input instead: `TDIn_P(0, id)`.
 *   R2: canonical iteration: `const uint id = TDIndex(); if (id >= TDNumElements()) return;`
 *   R3: `outputattrs` only selects attributes that ALREADY exist on the input.
 *       A new attribute (Cd, N, custom) must be created via Create Attributes:
 *       attrNname='Custom', attrNcustomname='<attr>', attrNnumcomps=<comps>.
 *   R4: output attributes are WRITE-ONLY; reading one you also write requires
 *       outputaccess='readwrite'.
 *   R5: the real compiler error lives in the auto-generated infoDAT
 *       `<glsl_name>_info` — `errors()` only says "Compile failed".
 *   R6: POP numPoints/numPrims/bounds/points are METHODS.
 */

/** Component counts verified against the live build (docs/GLSL_POP_RULES.md R3). */
export const ATTR_COMPONENTS: Record<string, number> = {
  P: 3,
  Cd: 4,
  N: 3,
  uv: 2,
  T: 3,
  v: 3,
  masa: 1,
  custom: 1,
};

/** Attributes TD provides automatically on the input. */
export const BUILTIN_ATTRS = new Set(["P", "N", "Cd", "uv", "T", "v"]);

const WRITE_RE = /^\s*(\w+)\s*\[\s*(?:id|TDIndex\(\))\s*\]\s*=/;
const READ_RE = /\b(\w+)\s*\[\s*(?:id|TDIndex\(\))\s*\]/g;

export interface GlslAnalysis {
  writes: string[];
  reads: string[];
  /** Attributes written that don't exist on the input → must be created (R3). */
  needs_create_attrs: string[];
  /** Shader reads an attribute it also writes (other than P) → set readwrite (R4). */
  needs_readwrite: boolean;
  /** Blocking errors: shader reads the OUTPUT P (R1) — refuses before compile. */
  errors: string[];
  warnings: string[];
  has_tdindex_pattern: boolean;
  /** Create-Attributes parameter recipes for needs_create_attrs. */
  create_attr_params: Array<{ attr: string; params: Record<string, string | number> }>;
}

/**
 * Analyze a GLSL POP shader before it reaches TD (pure function, no I/O).
 * Mirrors GLSLSyntaxChecker.analyze()/validate_shader() in
 * tests/test_glsl_pop_offline.py — do not fork the semantics.
 */
export function analyzeGlslShader(code: string): GlslAnalysis {
  const normalized = code.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");

  const writes: string[] = [];
  const reads: string[] = [];
  for (const line of lines) {
    const w = line.match(WRITE_RE);
    if (w && !writes.includes(w[1])) writes.push(w[1]);
    for (const m of line.matchAll(READ_RE)) {
      const after = line.slice(m.index! + m[0].length).trim();
      if (after.startsWith("=")) continue; // it's the write itself
      if (!reads.includes(m[1])) reads.push(m[1]);
    }
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const needs_create_attrs = writes.filter((a) => !BUILTIN_ATTRS.has(a));

  // R1: reading the output P is a guaranteed "Compile failed" — reject early
  // with the actionable fix instead of TD's opaque error.
  if (writes.includes("P") && reads.includes("P")) {
    errors.push(
      "Regla 1 (GLSL_POP_RULES.md): el shader LEE la salida P después de escribirla " +
        "→ 'Compile failed' garantizado. Corrección: leé desde la entrada, " +
        "P[id] = TDIn_P(0, id) * k; nunca P[id] = P[id] * k."
    );
  }

  // R4: reading an attribute it also writes needs outputaccess='readwrite'.
  // (If the culprit is P, the R1 error above blocks the apply anyway.)
  const needs_readwrite = reads.some((a) => writes.includes(a));

  if (normalized.includes("TDIndex()") && normalized.includes("TDNumElements()")) {
    // canonical pattern present
  } else if (normalized.includes("TDIndex()")) {
    warnings.push("usa TDIndex() pero no verifica TDNumElements() (Regla 2)");
  }

  if (!normalized.includes("void main()")) {
    errors.push("falta 'void main()' — no es un shader POP válido");
  }

  // Attributes read but neither builtin nor written → undeclared identifier risk.
  const declared = new Set([...BUILTIN_ATTRS, ...writes]);
  for (const a of reads) {
    if (!declared.has(a)) {
      warnings.push(
        `lee '${a}' que no es builtin ni se escribe en el shader — declarala (Create Attributes o input attr) o será undeclared identifier`
      );
    }
  }

  const create_attr_params = needs_create_attrs.map((attr) => ({
    attr,
    params: buildCreateAttrParams(attr),
  }));

  return {
    writes,
    reads,
    needs_create_attrs,
    needs_readwrite,
    errors,
    warnings,
    has_tdindex_pattern:
      normalized.includes("TDIndex()") && normalized.includes("TDNumElements()"),
    create_attr_params,
  };
}

/** R3 recipe: Create Attributes parameters for one attribute (None → builtin). */
export function buildCreateAttrParams(
  attr: string
): Record<string, string | number> {
  return {
    attr0name: "Custom",
    attr0customname: attr,
    attr0numcomps: ATTR_COMPONENTS[attr] ?? 1,
  };
}

// ─── GLSL TOP analysis (docs/GLSL_TOP_RULES.md, verified live 2026-09-17) ───

export interface GlslTopAnalysis {
  has_fragcolor_out: boolean;
  bad_uv_swizzles: string[];
  has_main: boolean;
  uses_uniform0name_risk: boolean;
  errors: string[];
  warnings: string[];
}

const BAD_UV_RE = /vUV\.(uv1?|texcoord)\b/g;

/**
 * Analyze a GLSL TOP pixel shader before it reaches TD (pure function).
 * Rules from docs/GLSL_TOP_RULES.md (all verified live on TD 2025.31760):
 *   T1: explicit `out vec4 fragColor` declaration.
 *   T2: vUV swizzles are .st/.xy — .uv/.uv1/.texcoord do NOT compile (probe G).
 *   T4: uniforms are bound via vec0-star/const0-star/matrix0/ac0 families — there is NO
 *       uniform0name on glslTOP (probe D); flag it when the creation code tries.
 *   T9: real compile errors live in `<name>_info` (probe A).
 */
export function analyzeGlslTopShader(code: string, creationCode?: string): GlslTopAnalysis {
  const normalized = code.replace(/\r\n/g, "\n");
  const errors: string[] = [];
  const warnings: string[] = [];

  const has_fragcolor_out =
    /\bout\s+vec4\s+fragColor\b/.test(normalized) ||
    /layout\s*\([^)]*location\s*=\s*0[^)]*\)\s*out\s+vec4\s+fragColor\b/.test(normalized);
  if (!has_fragcolor_out) {
    errors.push(
      "Regla TOP 1 (GLSL_TOP_RULES.md): falta 'out vec4 fragColor;' — el pixel shader " +
        "debe declarar su salida: layout(location = 0) out vec4 fragColor;"
    );
  }

  const bad_uv_swizzles = [...new Set(
    [...normalized.matchAll(BAD_UV_RE)].map((m) => "vUV." + m[1])
  )];
  if (bad_uv_swizzles.length > 0) {
    errors.push(
      "Regla TOP 2 (GLSL_TOP_RULES.md): " + bad_uv_swizzles.join(", ") +
        " NO compila ('unknown swizzle selection', probe G). Corrección: usá vUV.st o vUV.xy."
    );
  }

  const has_main = /void\s+main\s*\(/.test(normalized);
  if (!has_main) {
    errors.push("falta 'void main()' — no es un pixel shader TOP válido");
  }

  const uses_uniform0name_risk =
    !!creationCode && /uniform\d+name/.test(creationCode) &&
    !/vec\d+name|const\d+name|matrix\d+name|ac\d+name/.test(creationCode);
  if (uses_uniform0name_risk) {
    errors.push(
      "Regla TOP 4 (GLSL_TOP_RULES.md, probe D): en glslTOP NO existe uniform0name " +
        "(eso es del glslPOP). Bind de uniforms: vec0name+vec0valuex/y/z/w (vec), " +
        "const0name+const0value (float), matrix0value (mat4), ac0* (alimentado por CHOP)."
    );
  }

  if (/uTD2DInfos\[\d+\]\.res\.zw/.test(normalized)) {
    // correct aspect idiom — nothing to flag
  }
  if (/texture\s*\(\s*sTD2DInputs\[\d+\]\s*,\s*vUV\./.test(normalized)) {
    warnings.push(
      "lee sTD2DInputs con vUV — en redes de feedback el buffer no avanza con " +
        "cook(force=True) scripteado (Regla TOP 10); requiere frames reales"
    );
  }

  return { has_fragcolor_out, bad_uv_swizzles, has_main, uses_uniform0name_risk, errors, warnings };
}

/** TOP pre-validation: blocking errors or null when safe. */
export function preValidateTopShader(code: string, creationCode?: string): string[] | null {
  const a = analyzeGlslTopShader(code, creationCode);
  return a.errors.length > 0 ? a.errors : null;
}

/**
 * Pre-validation for the apply flow: returns blocking errors (R1 / no main)
 * that must stop the write, or null when safe to proceed.
 */
export function preValidateShader(code: string): string[] | null {
  const a = analyzeGlslShader(code);
  return a.errors.length > 0 ? a.errors : null;
}

// ─── Apply flow: one /exec round-trip that does everything safely ───────────

export interface GlslApplyArgs {
  /** Parent COMP path, e.g. "/project1". */
  parentPath: string;
  /** Name for the glslPOP (also derives the textDAT `<name>_code`). */
  name: string;
  /** Full GLSL shader source. */
  shader: string;
  /** Optional POP source path to wire into input 0 (GLSL POP needs an input). */
  sourcePath?: string;
  /** Override outputattrs (default 'P' — the verified recipe, R3). */
  outputattrs?: string;
}

/**
 * Generate ONE Python script (for client.execute) that:
 *   1. writes the shader to `<name>_code` textDAT,
 *   2. creates the glslPOP,
 *   3. applies Create Attributes for every new attribute the shader writes (R3),
 *   4. sets outputaccess='readwrite' when the shader reads what it writes (R4),
 *   5. wires the source (input 0) if given,
 *   6. cooks, checks errors() and on failure reads the infoDAT `<name>_info` (R5),
 *   7. prints a single JSON line report.
 * Every step is defensive: params are hasattr-guarded, failures are reported,
 * never thrown (the script must always print its JSON).
 */
export function buildGlslApplyCode(args: GlslApplyArgs): string {
  const parentPath = JSON.stringify(args.parentPath);
  const name = JSON.stringify(args.name);
  const shaderLiteral = JSON.stringify(args.shader); // JSON string literal is a valid Python literal
  const outputattrs = JSON.stringify(args.outputattrs ?? "P");
  const sourcePath = args.sourcePath ? JSON.stringify(args.sourcePath) : null;

  const analysis = analyzeGlslShader(args.shader);
  // Apply flow creates a slot for EVERY written attribute except P (which
  // always exists on POP input). This matches the live-verified example in
  // docs/GLSL_POP_RULES.md, where Cd is created via Create Attributes even
  // though the static analyzer treats it as builtin (input-provided Cd is
  // not guaranteed on an arbitrary source).
  const attrsToCreate = analysis.writes.filter((a) => a !== "P");
  const attrLines = attrsToCreate
    .map((attr, i) => {
      const params = buildCreateAttrParams(attr);
      return `    _set_par(glsl, 'attr${i}name', ${JSON.stringify(params.attr0name)})
    _set_par(glsl, 'attr${i}customname', ${JSON.stringify(params.attr0customname)})
    _set_par(glsl, 'attr${i}numcomps', ${params.attr0numcomps})  # ${attr}`;
    })
    .join("\n");

  return `import json
_out = {"ok": False, "path": None, "errors": [], "warnings": [], "skipped": [], "shader_info": None, "num_points": None, "num_prims": None}
def _set_par(op_, name_, value_):
    try:
        if hasattr(op_.par, name_):
            setattr(op_.par, name_, value_)
        else:
            _out["skipped"].append(name_ + " (param not in build)")
    except Exception as e_:
        _out["skipped"].append(name_ + ": " + str(e_))
try:
    parent = op(${parentPath})
    if parent is None:
        raise RuntimeError("parent not found: " + ${parentPath})
    code_dat = parent.create(td.textDAT, ${name} + "_code")
    code_dat.text = ${shaderLiteral}
    glsl = parent.create(td.glslPOP, ${name})
    _out["path"] = glsl.path
    _set_par(glsl, 'computedat', code_dat.name)
    _set_par(glsl, 'outputattrs', ${outputattrs})
${attrLines}${analysis.needs_readwrite ? "\n    _set_par(glsl, 'outputaccess', 'readwrite')  # R4: shader reads what it writes" : ""}
    ${
      sourcePath
        ? `src = op(${sourcePath})
    if src is None:
        raise RuntimeError("source not found: " + ${sourcePath})
    src.outputConnectors[0].connect(glsl)`
        : "# no sourcePath given — GLSL POP needs an input before it can cook data"
    }
    glsl.cook(force=True)
    errs = glsl.errors()
    if errs:
        _out["errors"].append(errs)
        # R5: the real compiler log is in the auto-generated infoDAT
        info = None
        for cand in (op(glsl.path + "_info"), op(glsl.parent().path + "/" + glsl.name + "_info")):
            if cand is not None:
                info = cand
                break
        if info is None:
            for ch in parent.children:
                if ch.name == glsl.name + "_info":
                    info = ch
                    break
        if info is not None:
            try:
                _out["shader_info"] = info.text
            except Exception:
                pass
    else:
        _out["ok"] = True
    try:
        _out["num_points"] = int(glsl.numPoints())
    except Exception:
        pass
    try:
        _out["num_prims"] = int(glsl.numPrims())
    except Exception:
        pass
except Exception as e:
    _out["errors"].append(str(e))
print(json.dumps(_out))
`;
}

export interface GlslApplyReport {
  ok: boolean;
  path: string | null;
  errors: string[];
  warnings: string[];
  skipped: string[];
  shader_info: string | null;
  num_points: number | null;
  num_prims: number | null;
}

export interface GlslApplyResult {
  isError?: boolean;
  preValidationErrors?: string[];
  report?: GlslApplyReport;
  message: string;
}

/**
 * Full safe apply: pre-validate (R1 blocking errors never reach TD), run the
 * generated script via client.execute, and surface the infoDAT compiler log
 * (R5) when TD still fails to compile. Never throws — returns a result object.
 */
export async function applyGlslPop(
  client: { execute: (code: string) => Promise<{ success: boolean; stdout?: string }> },
  args: GlslApplyArgs
): Promise<GlslApplyResult> {
  const blocking = preValidateShader(args.shader);
  if (blocking) {
    return {
      isError: true,
      preValidationErrors: blocking,
      message:
        "Shader rechazado antes de compilar (docs/GLSL_POP_RULES.md):\n" +
        blocking.join("\n"),
    };
  }

  const res = await client.execute(buildGlslApplyCode(args));
  let report: GlslApplyReport | undefined;
  try {
    const line = (res.stdout ?? "").split("\n").find((l) => l.startsWith("{"));
    if (line) report = JSON.parse(line) as GlslApplyReport;
  } catch {
    // fall through — report stays undefined
  }

  if (!report) {
    return {
      isError: true,
      message:
        "No se pudo interpretar la salida de TD. stdout: " +
        (res.stdout ?? "(vacío)").slice(0, 500),
    };
  }

  if (!report.ok) {
    const info = report.shader_info
      ? "\n--- infoDAT (log real del compilador, R5) ---\n" + report.shader_info
      : "\n(sin infoDAT disponible — buscá el DAT <nombre>_info en la red)";
    return {
      isError: true,
      report,
      message:
        `Compile failed en ${report.path ?? args.name}: ` +
        (report.errors.join(" | ") || "(sin detalle)") +
        info,
    };
  }

  return {
    report,
    message:
      `GLSL POP creado en ${report.path} — compila, ${report.num_points} puntos, ` +
      `${report.num_prims} prims.` +
      (report.skipped.length ? ` Params omitidos: ${report.skipped.join(", ")}` : "") +
      (report.warnings.length ? ` Warnings: ${report.warnings.join("; ")}` : ""),
  };
}
