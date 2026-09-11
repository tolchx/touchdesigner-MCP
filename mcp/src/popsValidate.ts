/**
 * POPs Validate — parameter validation + corpus-derived POP network templates.
 *
 * 1. validatePopParameters: check requested parameter names against the REAL
 *    parameter list of a POP type (from pop_operators.json, live-probed on
 *    TD 2025.32460) BEFORE setting anything — never set parameters blindly.
 *    Unknown names return a clear error with fuzzy suggestions.
 * 2. POP_NETWORK_TEMPLATES: the six corpus-validated chains (patterns.json):
 *    line→merge→copy, circle→merge→switch, grid→attribute (instancing),
 *    sphere→transform→trail, box→glsl (chained glsl→glsl),
 *    sprinkle→particle (feedback loop). Parameter names used in templates are
 *    real build names (param_usage.json top writes per type).
 *
 * Pure offline module (no TD connection) — unit-testable without TouchDesigner.
 */

import type { TDClient } from "td-api";
import {
  getPopInfo,
  suggestParameterNames,
  formatUnknownParameterError,
  type PopOperatorInfo,
} from "./popKnowledge.js";

// ─── 1. Parameter validation ────────────────────────────────────────────────

export interface PopParamIssue {
  name: string;
  suggestions: string[];
}

export interface PopParamValidation {
  ok: boolean;
  /** Lowercased short type key used for the lookup ("circlepop"). */
  typeKey: string;
  /** Number of real parameters known for this type (0 = unknown type). */
  knownParamCount: number;
  /** Params not in the knowledge base for this type. */
  unknown: PopParamIssue[];
  /** Params confirmed to exist in the knowledge base. */
  valid: string[];
  /** True when the type is not in the knowledge base (validation skipped). */
  skipped: boolean;
}

export function validatePopParameters(
  opType: string,
  requestedNames: string[],
): PopParamValidation {
  const requested = requestedNames.filter(Boolean).map((n) => String(n));
  const info: PopOperatorInfo | undefined = getPopInfo(opType);
  if (!info) {
    // Unknown type → cannot validate offline; skip (never block blindly).
    return {
      ok: true,
      typeKey: opType.toLowerCase(),
      knownParamCount: 0,
      unknown: [],
      valid: requested,
      skipped: true,
    };
  }
  const known = new Set(info.liveParams.map((p) => p.toLowerCase()));
  const unknown: PopParamIssue[] = [];
  for (const name of requested) {
    if (!known.has(name.toLowerCase())) {
      unknown.push({
        name,
        suggestions: suggestParameterNames(info.liveParams, name, 5),
      });
    }
  }
  const valid = requested.filter((n) => known.has(n.toLowerCase()));
  return {
    ok: unknown.length === 0,
    typeKey: info.type.toLowerCase(),
    knownParamCount: info.liveParams.length,
    unknown,
    valid,
    skipped: false,
  };
}

/** Validate + throw a formatted error when unknown parameters are detected. */
export function assertValidPopParameters(
  opType: string,
  requestedNames: string[],
): PopParamValidation {
  const v = validatePopParameters(opType, requestedNames);
  if (!v.ok) {
    throw new Error(
      formatUnknownParameterError(opType, v.unknown, v.knownParamCount),
    );
  }
  return v;
}

// ─── 1b. Runtime validation for a concrete operator path ───────────────────

export interface RuntimeParamValidation {
  ok: boolean;
  /** Where the authoritative name list came from. */
  source: "live" | "knowledge-base" | "skipped";
  unknown: PopParamIssue[];
  valid: string[];
  knownParamCount: number;
  /** Human-readable detail (error message with suggestions when !ok). */
  detail: string;
}

/**
 * Validate parameter names for a specific operator path before setting them.
 *
 * Preferred source: the operator's REAL parameters read live via /parameters.
 * Fallback: the offline POP knowledge base (pop_operators.json) when the live
 * read fails and the type is a known POP. If neither source can verify, the
 * validation is skipped (ok) — callers must not block on unverifiable names.
 */
export async function validateParameterNamesForPath(
  client: TDClient,
  path: string,
  names: string[],
  opTypeHint?: string,
): Promise<RuntimeParamValidation> {
  const requested = names.filter(Boolean).map(String);
  if (requested.length === 0) {
    return {
      ok: true,
      source: "skipped",
      unknown: [],
      valid: [],
      knownParamCount: 0,
      detail: "no parameter names to validate",
    };
  }

  // 1) Live source of truth: the operator's actual parameter list.
  try {
    const result: any = await client.getParameters(path);
    const liveNames: string[] = (result?.parameters ?? [])
      .map((p: any) => p?.name)
      .filter(Boolean);
    if (liveNames.length > 0) {
      const liveSet = new Set(liveNames.map((n) => String(n).toLowerCase()));
      const unknown = requested
        .filter((n) => !liveSet.has(n.toLowerCase()))
        .map((n) => ({
          name: n,
          suggestions: suggestParameterNames(liveNames, n, 5),
        }));
      const valid = requested.filter((n) => liveSet.has(n.toLowerCase()));
      return {
        ok: unknown.length === 0,
        source: "live",
        unknown,
        valid,
        knownParamCount: liveNames.length,
        detail:
          unknown.length === 0
            ? `all ${requested.length} parameter name(s) verified against the live operator (${liveNames.length} params)`
            : formatUnknownParameterError(
                opTypeHint ?? path,
                unknown,
                liveNames.length,
              ),
      };
    }
  } catch {
    // Live read failed → fall through to the offline knowledge base.
  }

  // 2) Offline fallback: live-validated POP knowledge base.
  const kb = validatePopParameters(opTypeHint ?? "", requested);
  if (!kb.skipped) {
    return {
      ok: kb.ok,
      source: "knowledge-base",
      unknown: kb.unknown,
      valid: kb.valid,
      knownParamCount: kb.knownParamCount,
      detail:
        kb.ok
          ? `validated against the live-validated POP knowledge base (${kb.knownParamCount} params for ${opTypeHint})`
          : formatUnknownParameterError(
              opTypeHint ?? path,
              kb.unknown,
              kb.knownParamCount,
            ),
    };
  }

  // 3) Cannot verify (unknown type, no live read) → skip, never block blindly.
  return {
    ok: true,
    source: "skipped",
    unknown: [],
    valid: requested,
    knownParamCount: 0,
    detail: "operator type not in knowledge base — validation skipped",
  };
}

// ─── 2. Corpus-derived POP network templates ────────────────────────────────

export interface PopTemplateOperator {
  id: string;
  opType: string;
  label: string;
  purpose: string;
}

export interface PopTemplateConnection {
  from: string;
  to: string;
  inputIndex: number;
  note: string;
}

export interface PopTemplateParameter {
  opId: string;
  paramName: string;
  value: unknown;
  note: string;
}

export interface PopNetworkTemplate {
  name: string;
  description: string;
  /** Corpus evidence: POP→POP chain from patterns.json with occurrence count. */
  corpusChain: string;
  corpusCount: number;
  complexity: "simple" | "medium" | "advanced";
  operators: PopTemplateOperator[];
  connections: PopTemplateConnection[];
  parameters: PopTemplateParameter[];
  pythonBuilder: string;
}

/**
 * The six templates requested, each backed by a measured corpus chain.
 * All parameter names are real build names verified against
 * pop_operators.json `live_params` and param_usage.json writes.
 */
export const POP_NETWORK_TEMPLATES: PopNetworkTemplate[] = [
  {
    name: "pop-line-merge-copy",
    description:
      "Two line strips merged and copied along template points — the single most common POP chain in real projects.",
    corpusChain: "line > merge > copy",
    corpusCount: 168,
    complexity: "simple",
    operators: [
      { id: "line_a", opType: "linePOP", label: "line_a", purpose: "First line strip source (0 inputs)" },
      { id: "line_b", opType: "linePOP", label: "line_b", purpose: "Second line strip source (0 inputs)" },
      { id: "merge", opType: "mergePOP", label: "merge1", purpose: "Merges both line strips (dynamic inputs: grows one connector per connection)" },
      { id: "copy", opType: "copyPOP", label: "copy1", purpose: "Copies the merged geometry (in0 geometry, in1 template)" },
    ],
    connections: [
      { from: "line_a", to: "merge", inputIndex: 0, note: "line→merge: 181 occurrences in corpus" },
      { from: "line_b", to: "merge", inputIndex: 1, note: "mergePOP inputs are DYNAMIC — connecting grows the connector list 1→2→3" },
      { from: "merge", to: "copy", inputIndex: 0, note: "copyPOP in0 = geometry to copy" },
    ],
    parameters: [
      { opId: "line_a", paramName: "divs", value: 100, note: "Line segments (top corpus write for line: divs hits=26)" },
      { opId: "copy", paramName: "ncy", value: 3, note: "Number of copies Y (top corpus write: ncy hits=19)" },
    ],
    pythonBuilder: `# pop-line-merge-copy (corpus: line > merge > copy, x168)
def build_pop_line_merge_copy(parent):
    parent = op(parent)
    line_a = parent.create(linePOP, 'line_a')
    line_a.par.divs = 100
    line_b = parent.create(linePOP, 'line_b')
    line_b.par.divs = 100
    merge = parent.create(mergePOP, 'merge1')
    line_a.outputConnectors[0].connect(merge)
    line_b.outputConnectors[0].connect(merge)  # dynamic inputs: 1→2
    copy = parent.create(copyPOP, 'copy1')
    merge.outputConnectors[0].connect(copy)    # copy in0 = geometry
    copy.par.ncy = 3
    line_a.nodeX = -600; line_a.nodeY = 200
    line_b.nodeX = -600; line_b.nodeY = -200
    merge.nodeX = -300;  merge.nodeY = 0
    copy.nodeX = 0;      copy.nodeY = 0
    return copy
build_pop_line_merge_copy('/project1')`,
  },
  {
    name: "pop-circle-merge-switch",
    description:
      "Two circles merged into a switcher for A/B source selection — second most common corpus chain.",
    corpusChain: "circle > merge > switch",
    corpusCount: 161,
    complexity: "simple",
    operators: [
      { id: "circle_a", opType: "circlePOP", label: "circle_a", purpose: "First circle source" },
      { id: "circle_b", opType: "circlePOP", label: "circle_b", purpose: "Second circle source" },
      { id: "merge", opType: "mergePOP", label: "merge1", purpose: "Merges both circles" },
      { id: "switch", opType: "switchPOP", label: "switch1", purpose: "Switches between input sources by index" },
    ],
    connections: [
      { from: "circle_a", to: "merge", inputIndex: 0, note: "circle→merge: 179 occurrences" },
      { from: "circle_b", to: "merge", inputIndex: 1, note: "dynamic inputs grow per connection" },
      { from: "merge", to: "switch", inputIndex: 0, note: "merge→switch: 113 occurrences" },
    ],
    parameters: [
      { opId: "circle_a", paramName: "radx", value: 0.5, note: "Radius X (corpus: radx hits=22)" },
      { opId: "circle_a", paramName: "rady", value: 0.5, note: "Radius Y (corpus: rady hits=22)" },
      { opId: "circle_b", paramName: "divs", value: 32, note: "Circle divisions (corpus: divs hits=9)" },
      { opId: "switch", paramName: "index", value: 0, note: "Active input index (corpus: index hits=11)" },
    ],
    pythonBuilder: `# pop-circle-merge-switch (corpus: circle > merge > switch, x161)
def build_pop_circle_merge_switch(parent):
    parent = op(parent)
    circle_a = parent.create(circlePOP, 'circle_a')
    circle_a.par.radx = 0.5
    circle_a.par.rady = 0.5
    circle_b = parent.create(circlePOP, 'circle_b')
    circle_b.par.divs = 32
    merge = parent.create(mergePOP, 'merge1')
    circle_a.outputConnectors[0].connect(merge)
    circle_b.outputConnectors[0].connect(merge)  # dynamic inputs: 1→2
    switch = parent.create(switchPOP, 'switch1')
    merge.outputConnectors[0].connect(switch)
    switch.par.index = 0
    circle_a.nodeX = -600; circle_a.nodeY = 200
    circle_b.nodeX = -600; circle_b.nodeY = -200
    merge.nodeX = -300;    merge.nodeY = 0
    switch.nodeX = 0;      switch.nodeY = 0
    return switch
build_pop_circle_merge_switch('/project1')`,
  },
  {
    name: "pop-grid-attribute-instancing",
    description:
      "Grid of points plus an attribute POP that adds an instancing attribute (scale/pivot per point) — the standard instancing setup.",
    corpusChain: "grid > attribute",
    corpusCount: 54,
    complexity: "medium",
    operators: [
      { id: "grid", opType: "gridPOP", label: "grid1", purpose: "Point grid source" },
      { id: "attr", opType: "attributePOP", label: "attrib1", purpose: "Adds a custom attribute used downstream for instancing" },
      { id: "out", opType: "nullPOP", label: "out_grid", purpose: "Stable output node" },
    ],
    connections: [
      { from: "grid", to: "attr", inputIndex: 0, note: "grid→attribute: 54 occurrences" },
      { from: "attr", to: "out", inputIndex: 0, note: "attribute→null: 69 occurrences" },
    ],
    parameters: [
      { opId: "grid", paramName: "cols", value: 50, note: "Grid columns (top corpus write: cols hits=20)" },
      { opId: "grid", paramName: "rows", value: 50, note: "Grid rows (corpus: rows hits=20)" },
      { opId: "grid", paramName: "surftype", value: "points", note: "Render as points for instancing (corpus sample: 'points')" },
      { opId: "attr", paramName: "attr0name", value: "pointscale", note: "Attribute name (top corpus write: attr0name hits=26, sample 'pointscale')" },
      { opId: "attr", paramName: "attr0type", value: "float", note: "Attribute type (real build param)" },
      { opId: "attr", paramName: "attr0value0", value: 0.011, note: "Attribute value (corpus sample)" },
    ],
    pythonBuilder: `# pop-grid-attribute-instancing (corpus: grid > attribute, x54)
def build_pop_grid_attribute(parent):
    parent = op(parent)
    grid = parent.create(gridPOP, 'grid1')
    grid.par.cols = 50
    grid.par.rows = 50
    grid.par.surftype = 'points'
    attr = parent.create(attributePOP, 'attrib1')
    grid.outputConnectors[0].connect(attr)
    attr.par.attr0name = 'pointscale'
    attr.par.attr0type = 'float'
    attr.par.attr0value0 = 0.011
    out = parent.create(nullPOP, 'out_grid')
    attr.outputConnectors[0].connect(out)
    grid.nodeX = -600; grid.nodeY = 0
    attr.nodeX = -300; attr.nodeY = 0
    out.nodeX = 0;     out.nodeY = 0
    return out
build_pop_grid_attribute('/project1')`,
  },
  {
    name: "pop-sphere-transform-trail",
    description:
      "Sphere animated by a transform and recorded into a trail — classic motion-graphics setup.",
    corpusChain: "sphere > transform > trail",
    corpusCount: 6,
    complexity: "medium",
    operators: [
      { id: "sphere", opType: "spherePOP", label: "sphere1", purpose: "Sphere source geometry" },
      { id: "xform", opType: "transformPOP", label: "xform1", purpose: "Animates the sphere (tx/ty/tz or expressions)" },
      { id: "trail", opType: "trailPOP", label: "trail1", purpose: "Records the sphere positions as a trail" },
      { id: "out", opType: "nullPOP", label: "out_trail", purpose: "Stable output node" },
    ],
    connections: [
      { from: "sphere", to: "xform", inputIndex: 0, note: "sphere→transform: 8 occurrences" },
      { from: "xform", to: "trail", inputIndex: 0, note: "transform→trail: 6 occurrences" },
      { from: "trail", to: "out", inputIndex: 0, note: "trail→null" },
    ],
    parameters: [
      { opId: "sphere", paramName: "freq", value: 2, note: "Sphere frequency (top corpus write: freq hits=9)" },
      { opId: "sphere", paramName: "radx", value: 0.05, note: "Radius X (corpus: radx hits=7)" },
      { opId: "sphere", paramName: "rady", value: 0.05, note: "Radius Y (corpus: rady hits=7)" },
      { opId: "xform", paramName: "tz", value: 0.5, note: "Translate Z (top corpus write: tz hits=20)" },
      { opId: "trail", paramName: "length", value: 10, note: "Trail length (top corpus write: length hits=9)" },
      { opId: "trail", paramName: "lengthunit", value: "frames", note: "Length unit (corpus sample: 'frames')" },
    ],
    pythonBuilder: `# pop-sphere-transform-trail (corpus: sphere > transform > trail)
def build_pop_sphere_transform_trail(parent):
    parent = op(parent)
    sphere = parent.create(spherePOP, 'sphere1')
    sphere.par.freq = 2
    sphere.par.radx = 0.05
    sphere.par.rady = 0.05
    xform = parent.create(transformPOP, 'xform1')
    sphere.outputConnectors[0].connect(xform)
    xform.par.tz = 0.5
    trail = parent.create(trailPOP, 'trail1')
    xform.outputConnectors[0].connect(trail)
    trail.par.length = 10
    trail.par.lengthunit = 'frames'
    out = parent.create(nullPOP, 'out_trail')
    trail.outputConnectors[0].connect(out)
    sphere.nodeX = -900; sphere.nodeY = 0
    xform.nodeX = -600;  xform.nodeY = 0
    trail.nodeX = -300;  trail.nodeY = 0
    out.nodeX = 0;       out.nodeY = 0
    return out
build_pop_sphere_transform_trail('/project1')`,
  },
  {
    name: "pop-box-glsl-chain",
    description:
      "boxPOP fed into two chained GLSL POPs (glsl→glsl: 140 corpus occurrences — the dominant compute pattern).",
    corpusChain: "box > glsl > glsl",
    corpusCount: 140,
    complexity: "advanced",
    operators: [
      { id: "box", opType: "boxPOP", label: "box_src", purpose: "Geometry source (GLSL POP requires a POP input)" },
      { id: "glsl1", opType: "glslPOP", label: "glsl_1", purpose: "First compute pass — displaces points" },
      { id: "glsl2", opType: "glslPOP", label: "glsl_2", purpose: "Second compute pass — chained glsl→glsl" },
      { id: "out", opType: "nullPOP", label: "out_glsl", purpose: "Stable output node" },
    ],
    connections: [
      { from: "box", to: "glsl1", inputIndex: 0, note: "GLSL POP needs a POP input (verified: boxPOP source)" },
      { from: "glsl1", to: "glsl2", inputIndex: 0, note: "glsl→glsl: 140 occurrences" },
      { from: "glsl2", to: "out", inputIndex: 0, note: "glsl→null: 50 occurrences" },
    ],
    parameters: [
      { opId: "box", paramName: "sizex", value: 0.05, note: "Box size X (top corpus write: sizex hits=4)" },
      { opId: "box", paramName: "sizey", value: 0.05, note: "Box size Y (corpus: sizey hits=4)" },
      { opId: "glsl1", paramName: "outputattrs", value: "P", note: "Output attributes — REQUIRED for position writes (verified live: outputattrs='P')" },
      { opId: "glsl2", paramName: "outputattrs", value: "P", note: "Second pass also writes P" },
    ],
    pythonBuilder: `# pop-box-glsl-chain (corpus: box > glsl > glsl, x140)
# Verified rules: GLSL POP requires a POP input (boxPOP) and
# outputattrs='P' declared to write positions.
def build_pop_box_glsl_chain(parent):
    parent = op(parent)
    box = parent.create(boxPOP, 'box_src')
    box.par.sizex = 0.05
    box.par.sizey = 0.05
    box.par.sizez = 0.01
    glsl1 = parent.create(glslPOP, 'glsl_1')
    box.outputConnectors[0].connect(glsl1)
    glsl1.par.outputattrs = 'P'
    glsl1.par.computedat = 'glsl_1_compute'
    glsl2 = parent.create(glslPOP, 'glsl_2')
    glsl1.outputConnectors[0].connect(glsl2)  # glsl→glsl chaining
    glsl2.par.outputattrs = 'P'
    out = parent.create(nullPOP, 'out_glsl')
    glsl2.outputConnectors[0].connect(out)
    box.nodeX = -900;   box.nodeY = 0
    glsl1.nodeX = -600; glsl1.nodeY = 0
    glsl2.nodeX = -300; glsl2.nodeY = 0
    out.nodeX = 0;      out.nodeY = 0
    return out
build_pop_box_glsl_chain('/project1')`,
  },
  {
    name: "pop-sprinkle-particle-feedback",
    description:
      "sprinklePOP scatters points on a sphere surface, particlePOP simulates them, and the result loops back through the particle system (corpus: sprinkle→particle x4; particle systems update from a feedback POP).",
    corpusChain: "sprinkle > particle",
    corpusCount: 4,
    complexity: "advanced",
    operators: [
      { id: "surface", opType: "spherePOP", label: "emit_surface", purpose: "Surface to sprinkle emission points on" },
      { id: "sprinkle", opType: "sprinklePOP", label: "sprinkle1", purpose: "Scatters points on the surface (emitter)" },
      { id: "feedback", opType: "feedbackPOP", label: "feedback1", purpose: "Feedback buffer so particles read their previous state" },
      { id: "particle", opType: "particlePOP", label: "particle1", purpose: "Particle simulation (uses previous state via feedback)" },
      { id: "out", opType: "nullPOP", label: "out_particles", purpose: "Stable output node" },
    ],
    connections: [
      { from: "surface", to: "sprinkle", inputIndex: 0, note: "sprinkle scatters points on its input surface" },
      { from: "sprinkle", to: "particle", inputIndex: 0, note: "sprinkle→particle: 4 occurrences" },
      { from: "feedback", to: "particle", inputIndex: 1, note: "Second input of particle reads previous frame state; feedback.par.targetpop points back at particle1" },
    ],
    parameters: [
      { opId: "sprinkle", paramName: "method", value: "volnondeterministic", note: "Scatter method (top corpus write: method hits=6, sample 'volnondeterministic')" },
      { opId: "sprinkle", paramName: "numpoints", value: 50, note: "Point count (corpus: numpoints hits=6)" },
      { opId: "particle", paramName: "birthrate", value: 100, note: "Birth rate (top corpus write: birthrate hits=22)" },
      { opId: "particle", paramName: "maxparticles", value: 10000, note: "Particle cap (corpus: maxparticles hits=20)" },
      { opId: "particle", paramName: "life", value: 5, note: "Particle life (corpus: life hits=9)" },
      { opId: "particle", paramName: "initdrag", value: 0.5, note: "Initial drag (corpus: initdrag hits=11)" },
      { opId: "feedback", paramName: "targetpop", value: "particle1", note: "Feedback loop target (verified param on feedbackPOP live_params)" },
    ],
    pythonBuilder: `# pop-sprinkle-particle-feedback (corpus: sprinkle > particle)
# Feedback loop: particle reads its previous state through feedbackPOP.
def build_pop_sprinkle_particle(parent):
    parent = op(parent)
    surface = parent.create(spherePOP, 'emit_surface')
    sprinkle = parent.create(sprinklePOP, 'sprinkle1')
    surface.outputConnectors[0].connect(sprinkle)
    sprinkle.par.method = 'volnondeterministic'
    sprinkle.par.numpoints = 50
    feedback = parent.create(feedbackPOP, 'feedback1')
    particle = parent.create(particlePOP, 'particle1')
    sprinkle.outputConnectors[0].connect(particle)
    particle.par.birthrate = 100
    particle.par.maxparticles = 10000
    particle.par.life = 5
    particle.par.initdrag = 0.5
    feedback.par.targetpop = particle.name
    out = parent.create(nullPOP, 'out_particles')
    particle.outputConnectors[0].connect(out)
    surface.nodeX = -900;  surface.nodeY = 300
    sprinkle.nodeX = -600; sprinkle.nodeY = 300
    feedback.nodeX = -600; feedback.nodeY = -300
    particle.nodeX = -300; particle.nodeY = 0
    out.nodeX = 0;         out.nodeY = 0
    return out
build_pop_sprinkle_particle('/project1')`,
  },
];

/**
 * Find POP templates by query (name, tag-ish substring on description or
 * corpus chain). Empty query returns all templates.
 */
export function searchPopTemplates(query: string): PopNetworkTemplate[] {
  const q = query.toLowerCase().trim();
  if (!q) return [...POP_NETWORK_TEMPLATES];
  return POP_NETWORK_TEMPLATES.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.corpusChain.toLowerCase().includes(q),
  );
}

/** Get a POP template by exact name. */
export function getPopTemplateByName(
  name: string,
): PopNetworkTemplate | undefined {
  return POP_NETWORK_TEMPLATES.find((t) => t.name === name);
}

// ─── 2b. Adapter into the generic NetworkTemplate shape ────────────────────

import type {
  NetworkTemplate,
} from "./networkTemplates.js";

/**
 * Convert the corpus-derived POP templates to the generic NetworkTemplate
 * shape used by networkTemplates.ts (search, td_list_templates, resolvePrompt).
 */
export function popTemplatesAsNetworkTemplates(): NetworkTemplate[] {
  return POP_NETWORK_TEMPLATES.map((t) => ({
    name: t.name,
    description: `[corpus ${t.corpusChain} x${t.corpusCount}] ${t.description}`,
    tags: [
      "pop",
      "pop-chain",
      ...t.corpusChain.split(" ").filter((s) => s !== ">"),
    ],
    complexity: t.complexity,
    operators: t.operators.map((o) => ({
      id: o.id,
      opType: o.opType,
      label: o.label,
      purpose: o.purpose,
    })),
    connections: t.connections.map((c) => ({
      from: c.from,
      to: c.to,
      inputIndex: c.inputIndex,
      note: c.note,
    })),
    parameters: t.parameters.map((p) => ({
      opId: p.opId,
      paramName: p.paramName,
      value: p.value,
      note: p.note,
    })),
    pythonBuilder: t.pythonBuilder,
  }));
}

// ─── 3. Runtime type resolution for a concrete operator path ───────────────

/**
 * Best-effort resolution of the real operator type for a path, used as the
 * type hint for knowledge-base parameter validation. Returns the TD type
 * (e.g. "circlePOP") when the operator is a known POP, otherwise null.
 * Errors are swallowed — validation must never block on this lookup.
 */
export async function resolvePopTypeForPath(
  client: TDClient,
  path: string,
): Promise<string | null> {
  try {
    const detail: any = await client.getNodeDetail(path);
    const t = detail?.data?.type ?? detail?.type;
    if (typeof t === "string" && getPopInfo(t)) return t;
    return null;
  } catch {
    return null;
  }
}
