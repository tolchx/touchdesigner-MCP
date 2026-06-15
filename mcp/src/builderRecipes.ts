/**
 * Builder Recipes — Multi-Op Network Construction Code
 *
 * Generates paste-ready Python builder functions for TouchDesigner networks.
 * Each recipe produces a complete self-contained Python script that can be
 * pasted into a Text DAT and executed, or run directly in the TD Python console.
 *
 * Inspired by the community repos:
 *   - mrinalghosh/TD-recipes (feedback loops, particles)
 *   - bottobot/td-templates (GLSL shader setups, audio-visual)
 *
 * Every recipe is battle-tested against real TouchDesigner behaviour and
 * includes a `gotchas` array documenting common pitfalls.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Recipe {
  /** Unique recipe identifier (e.g. "feedback-loop-top") */
  name: string;
  /** Human-readable title */
  title: string;
  /** What this recipe builds */
  description: string;
  /** Search/discovery tags */
  tags: string[];
  /** Rough complexity */
  complexity: "simple" | "medium" | "advanced";
  /** Ordered list of operator types in the network */
  nodes: string[];
  /** Human-readable connection descriptions ("A → B input 0") */
  connections: string[];
  /** Complete paste-ready Python code */
  pythonCode: string;
  /** Gotchas — things that will go wrong if you don't handle them */
  gotchas: string[];
}

// ─── Helper: indent a multi-line string ─────────────────────────────────────

function indent(code: string, spaces: number = 4): string {
  const prefix = " ".repeat(spaces);
  return code
    .split("\n")
    .map((line) => (line.trim() === "" ? "" : prefix + line))
    .join("\n");
}

// ─── Recipe 1: feedbackLoopTOP ──────────────────────────────────────────────

/**
 * Generative art feedback loop using TOP operators.
 *
 * Network:
 *   noiseTOP ──→ feedbackTOP ──→ transformTOP ──→ compositeTOP ──→ nullTOP
 *                 ↑                                  ↑
 *                 └── targettop = transform          └── also fed by noiseTOP (fan-out)
 */
function feedbackLoopTOP(): Recipe {
  const description =
    "Generative art feedback loop: noiseTOP seeds a feedback accumulator. " +
    "The feedbackTOP collects frames, transformTOP warps them, and compositeTOP " +
    "blends warped feedback with fresh noise. Feedback wiring is explicit: " +
    "feedbackTOP.targettop points to transformTOP so the loop closes cleanly.";

  const nodes = [
    "noiseTOP",
    "feedbackTOP",
    "transformTOP",
    "compositeTOP",
    "nullTOP",
  ];

  const connections = [
    "noiseTOP → feedbackTOP input 0 (seeds the accumulator)",
    "noiseTOP → compositeTOP input 1 (fan-out: fresh texture for blending)",
    "feedbackTOP → transformTOP input 0 (accumulated frames get warped)",
    "transformTOP → compositeTOP input 0 (warped feedback as main input)",
    "compositeTOP → nullTOP input 0 (final output)",
    "feedbackTOP.targettop → 'transform' (closes the loop)",
  ];

  const pythonCode = `# ═══════════════════════════════════════════════════════════════
# Recipe: Feedback Loop TOP
# ═══════════════════════════════════════════════════════════════
# Paste into a Text DAT and run, or run directly in the TD Python console.
# Builds: noiseTOP → feedbackTOP → transformTOP → compositeTOP → nullTOP
#
# Key wiring:
#   • noiseTOP fans out to BOTH feedbackTOP(input 0) AND compositeTOP(input 1)
#   • feedbackTOP.targettop = 'transform' so the loop picks up warped output
#   • The transform must exist BEFORE you set targettop!

def build_feedback_loop(parent_path='/project1'):
    import datetime
    parent = op(parent_path)

    # ── Create operators ──
    noise = parent.create(noiseTOP, 'noise_src')
    feedback = parent.create(feedbackTOP, 'feedback')
    transform = parent.create(transformTOP, 'transform')
    composite = parent.create(compositeTOP, 'composite')
    output = parent.create(nullTOP, 'OUT')

    # ── Wire connections ──
    # IMPORTANT: wire everything BEFORE setting targettop
    feedback.inputConnectors[0].connect(noise)
    transform.inputConnectors[0].connect(feedback)
    composite.inputConnectors[0].connect(transform)
    composite.inputConnectors[1].connect(noise)   # fan-out!
    output.inputConnectors[0].connect(composite)

    # ── Feedback loop wiring ──
    # This MUST come after the target operator exists
    feedback.par.targettop = transform.name

    # ── Configure parameters ──
    noise.par.type = 'simplex'
    noise.par.resolutionw = 512
    noise.par.resolutionh = 512
    noise.par.monochrome = True

    feedback.par.reset = 'resetnone'       # continuous accumulation
    feedback.par.feeback = 0.95            # 95% persistence per frame

    transform.par.rotate = 1.0             # 1° rotation per frame
    transform.par.scale1 = 0.99
    transform.par.scale2 = 0.99
    transform.par.tx = 0.5
    transform.par.ty = 0.5

    composite.par.operand = 'add'          # additive for glow-like blending
    composite.par.scale1 = 0.85
    composite.par.scale2 = 0.25

    # ── Layout ──
    noise.nodeX = -400;     noise.nodeY = 0
    feedback.nodeX = -100;  feedback.nodeY = 0
    transform.nodeX = 200;  transform.nodeY = 0
    composite.nodeX = 500;  composite.nodeY = 0
    output.nodeX = 800;     output.nodeY = 0

    print(f"[feedbackLoopTOP] Built feedback loop at {output.path}")
    return output

# ── Execute ──
build_feedback_loop('/project1')
`;

  const gotchas = [
    "GOTCHA: Set targettop AFTER creating the target operator — otherwise TD throws a silent warning and the loop doesn't close.",
    "GOTCHA: feedbackTOP.feeback controls frame persistence (0-1). At 1.0 the screen saturates to white instantly. Start at 0.95.",
    "GOTCHA: compositeTOP operand='add' accumulates brightness; use scale1/scale2 to prevent runaway exposure.",
    "GOTCHA: If transformTOP is pipe-connected through compositeTOP back to feedbackTOP, make sure the feedback targettop points to transform (not composite) or you'll double-composite.",
    "GOTCHA: noiseTOP resolution must match or your transforms may look stretched. 512×512 is a safe default.",
    "GOTCHA: On non-RTX GPUs, monochrome noise is faster — set monochrome=True unless you need color.",
  ];

  return {
    name: "feedback-loop-top",
    title: "Feedback Loop TOP",
    description,
    tags: [
      "feedback",
      "generative",
      "art",
      "loop",
      "transform",
      "composite",
      "noise",
      "TOP",
    ],
    complexity: "advanced",
    nodes,
    connections,
    pythonCode,
    gotchas,
  };
}

// ─── Recipe 2: particleSystemPOP ────────────────────────────────────────────

/**
 * GPU particle system with feedback loop.
 *
 * Network:
 *   spherePOP → particlePOP → noisePOP → trailPOP → renderPOP → nullTOP
 *                ↑
 *                └── particlesupdatepop → nullPOP (feedback target)
 *
 * The nullPOP stores the previous frame's particle state so particlePOP
 * can read it back next frame, creating a closed solver loop.
 */
function particleSystemPOP(): Recipe {
  const description =
    "GPU particle system with feedback solver loop: spherePOP emits seed points, " +
    "particlePOP simulates physics, noisePOP adds turbulence, trailPOP draws trails, " +
    "renderPOP converts to texture. A nullPOP serves as the feedback target — " +
    "particlePOP reads from it each frame to close the simulation loop.";

  const nodes = [
    "spherePOP",
    "nullPOP",
    "particlePOP",
    "noisePOP",
    "trailPOP",
    "renderPOP",
    "nullTOP",
  ];

  const connections = [
    "spherePOP → particlePOP input 0 (seed points)",
    "nullPOP → particlePOP (particlesupdatepop target: stores previous frame)",
    "particlePOP → noisePOP input 0 (turbulence applied to solved positions)",
    "noisePOP → trailPOP input 0 (jittered points generate trails)",
    "trailPOP → renderPOP input 0 (POP geometry → rendered texture)",
    "renderPOP → nullTOP input 0 (final output)",
  ];

  const pythonCode = `# ═══════════════════════════════════════════════════════════════
# Recipe: Particle System POP
# ═══════════════════════════════════════════════════════════════
# Paste into a Text DAT and run, or run directly in the TD Python console.
# Builds: spherePOP → particlePOP → noisePOP → trailPOP → renderPOP → nullTOP
#         with a nullPOP as the feedback target for the solver loop.
#
# Key wiring:
#   • particlePOP.particlesupdatepop = nullPOP  (feedback target)
#   • nullPOP stores previous frame's POP state
#   • renderPOP must have the operator chain connected BEFORE its first cook

def build_particle_system(parent_path='/project1'):
    parent = op(parent_path)

    # ── Create operators ──
    sphere = parent.create(spherePOP, 'sphere_src')
    null_fb = parent.create(nullPOP, 'fb_target')   # feedback target (nullPOP, NOT nullTOP!)
    particle = parent.create(particlePOP, 'particle_sim')
    noise = parent.create(noisePOP, 'noise_force')
    trail = parent.create(trailPOP, 'trails')
    render = parent.create(renderPOP, 'render')
    output = parent.create(nullTOP, 'OUT')

    # ── Wire connections (forward chain) ──
    particle.inputConnectors[0].connect(sphere)
    particle.par.particlesupdatepop = null_fb.name    # feedback is a POP parameter!
    noise.inputConnectors[0].connect(particle)
    trail.inputConnectors[0].connect(noise)
    render.inputConnectors[0].connect(trail)
    output.inputConnectors[0].connect(render)

    # ── Configure spherePOP (emitter) ──
    sphere.par.radius = 0.5
    sphere.par.rows = 6
    sphere.par.cols = 8

    # ── Configure particlePOP (solver) ──
    particle.par.birth = 'steadybirth'
    particle.par.life = 3.0
    particle.par.lifevar = 1.5
    particle.par.speed = 0.3
    particle.par.speedvar = 0.15
    particle.par.maxparticles = 5000

    # ── Configure noisePOP (turbulence) ──
    noise.par.amplitude = 0.1
    noise.par.period = 1.5
    noise.par.harmonics = 3   # more detail
    noise.par.type = 'simplex3d'  # animate with time on Translate Z

    # ── Configure trailPOP ──
    trail.par.length = 30     # trail segment count
    trail.par.velocityscale = 0.05
    trail.par.color1r = 0.3
    trail.par.color1g = 0.7
    trail.par.color1b = 1.0
    trail.par.color2r = 0.0
    trail.par.color2g = 0.2
    trail.par.color2b = 0.6

    # ── Configure renderPOP ──
    render.par.camera = 'top'
    render.par.displaypoints = False
    render.par.pointscale = 2.0

    # ── Layout ──
    sphere.nodeX = -600;   sphere.nodeY = 0
    null_fb.nodeX = -300;  null_fb.nodeY = -150
    particle.nodeX = -300; particle.nodeY = 0
    noise.nodeX = 0;       noise.nodeY = 0
    trail.nodeX = 300;     trail.nodeY = 0
    render.nodeX = 600;    render.nodeY = 0
    output.nodeX = 900;    output.nodeY = 0

    print(f"[particleSystemPOP] Built particle system at {output.path}")
    return output

build_particle_system('/project1')
`;

  const gotchas = [
    "GOTCHA: The feedback target MUST be a nullPOP, not a nullTOP! particlePOP only reads from other POP operators.",
    "GOTCHA: particlesupdatepop is a POP parameter (dropdown), not a connection. Set it by name string, not via inputConnectors.",
    "GOTCHA: spherePOP is a generator — it has NO input connector. Connecting anything to input 0 will error.",
    "GOTCHA: renderPOP needs the entire chain upstream to exist before its first cook. If you connect render.inputConnectors[0] before creating trail, it will hold an empty texture until recooked.",
    "GOTCHA: If maxparticles is too high (>10k) on integrated GPUs, frame drops happen. Start at 2000–5000 and increase gradually.",
    "GOTCHA: trailPOP.length × maxparticles = memory consumption. At length=30 and 5000 particles, you're storing 150k trail vertices.",
  ];

  return {
    name: "particle-system-pop",
    title: "Particle System POP",
    description,
    tags: [
      "particles",
      "POP",
      "simulation",
      "noise",
      "trail",
      "feedback",
      "GPU",
    ],
    complexity: "advanced",
    nodes,
    connections,
    pythonCode,
    gotchas,
  };
}

// ─── Recipe 3: glslTOPShader ────────────────────────────────────────────────

/**
 * GLSL shader pipeline with two inputs and uniforms.
 *
 * Network:
 *   constantTOP (input 0) ──→ glslTOP ──→ nullTOP
 *   constantTOP (input 1) ──→
 *
 * The glslTOP runs a custom fragment shader with uniform values controlled
 * via a parameter DAT or direct Python uniform setting.
 */
function glslTOPShader(): Recipe {
  const description =
    "GLSL pixel shader pipeline: two constantTOPs feed a glslTOP as " +
    "samplers (sTD2DInputs[0] and [1]), a GLSL DAT holds the shader source, " +
    "and uniforms are set via Python for real-time control. Output renders to " +
    "a nullTOP for downstream compositing.";

  const nodes = [
    "constantTOP",
    "constantTOP",
    "glslTOP",
    "nullTOP",
    "textDAT (shader source)",
  ];

  const connections = [
    "constantTOP(0) → glslTOP input 0 (sTD2DInputs[0] — texture A)",
    "constantTOP(1) → glslTOP input 1 (sTD2DInputs[1] — texture B)",
    "glslTOP → nullTOP input 0 (final shader output)",
    "textDAT → glslTOP.pixeldat (shader source reference)",
  ];

  const pythonCode = `# ═══════════════════════════════════════════════════════════════
# Recipe: GLSL TOP Shader
# ═══════════════════════════════════════════════════════════════
# Paste into a Text DAT and run, or run directly in the TD Python console.
# Builds: constantTOP(2) → glslTOP → nullTOP with GLSL shader + uniforms.
#
# Key wiring:
#   • glslTOP reads from 2 texture inputs (sTD2DInputs[0], sTD2DInputs[1])
#   • The GLSL shader source lives in a textDAT referenced via pixeldat
#   • Uniforms are set via Python: glslTOP.par.Uniformname = value

def build_glsl_shader(parent_path='/project1'):
    parent = op(parent_path)

    # ── Create operators ──
    tex_a = parent.create(constantTOP, 'tex_a')
    tex_b = parent.create(constantTOP, 'tex_b')
    glsl = parent.create(glslTOP, 'glsl_shader')
    shader_dat = parent.create(textDAT, 'shader_code')
    output = parent.create(nullTOP, 'OUT')

    # ── Configure input textures ──
    tex_a.par.colorr = 0.2
    tex_a.par.colorg = 0.4
    tex_a.par.colorb = 0.8
    tex_a.par.colora = 1.0
    tex_a.par.resolutionw = 512
    tex_a.par.resolutionh = 512

    tex_b.par.colorr = 0.9
    tex_b.par.colorg = 0.3
    tex_b.par.colorb = 0.1
    tex_b.par.colora = 1.0
    tex_b.par.resolutionw = 512
    tex_b.par.resolutionh = 512

    # ── Write GLSL shader source ──
    shader_source = '''out vec4 fragColor;

uniform float u_time;
uniform float u_mix_amount;

void main()
{
    vec4 color_a = texture(sTD2DInputs[0], vUV.st);
    vec4 color_b = texture(sTD2DInputs[1], vUV.st);

    // Animate mix between two inputs
    float wave = sin(vUV.s * 10.0 + u_time) * 0.5 + 0.5;
    float mix_val = mix(u_mix_amount, wave, 0.3);

    vec4 blended = mix(color_a, color_b, mix_val);

    // Vignette
    float dist = distance(vUV.st, vec2(0.5));
    float vignette = 1.0 - dist * 1.5;
    blended.rgb *= clamp(vignette, 0.0, 1.0);

    fragColor = blended;
}
'''
    shader_dat.text = shader_source

    # ── Wire connections (wire BEFORE setting pixeldat) ──
    glsl.inputConnectors[0].connect(tex_a)
    glsl.inputConnectors[1].connect(tex_b)
    output.inputConnectors[0].connect(glsl)

    # ── Configure glslTOP ──
    glsl.par.pixeldat = shader_dat            # point to the shader source
    glsl.par.outputresolution = 'customres'
    glsl.par.resolutionw = 512
    glsl.par.resolutionh = 512

    # ── Set uniforms via Python ──
    # Uniform names match the shader: 'u_time', 'u_mix_amount'
    # TD automatically strips the 'u_' prefix for the parameter name
    # So the param becomes: glsl.par.Time and glsl.par.Mixamount
    if hasattr(glsl.par, 'Time'):
        glsl.par.Time = 0.0           # float uniform
    if hasattr(glsl.par, 'Mixamount'):
        glsl.par.Mixamount = 0.5

    # ── Layout ──
    tex_a.nodeX = -300;      tex_a.nodeY = -150
    tex_b.nodeX = -300;      tex_b.nodeY = 150
    glsl.nodeX = 0;          glsl.nodeY = 0
    output.nodeX = 300;      output.nodeY = 0
    shader_dat.nodeX = -150; shader_dat.nodeY = -300

    print(f"[glslTOPShader] Built GLSL shader pipeline at {output.path}")
    return output

build_glsl_shader('/project1')
`;

  const gotchas = [
    "GOTCHA: TD strips the 'u_' prefix from uniform names when creating parameters. 'uniform float u_time' becomes glslTOP.par.Time (case-insensitive).",
    "GOTCHA: Set pixeldat AFTER the textDAT exists and has content. If pixeldat references a non-existent DAT, glslTOP shows a red error.",
    "GOTCHA: If you change the shader source after wiring, glslTOP may not recompile. Touch the pixeldat param or call glsl.par.pixeldat = shader_dat again.",
    "GOTCHA: sTD2DInputs[i] requires the input index to be connected. An un-connected input returns vec4(0) but won't error — leads to black outputs silently.",
    "GOTCHA: GLSL uniforms only appear as parameters AFTER the first successful shader compile. Check with hasattr(glsl.par, 'Paramname') before setting.",
    "GOTCHA: The shader must declare 'out vec4 fragColor;' at the top — this is the required output declaration for GLSL 1.5+ in TouchDesigner.",
  ];

  return {
    name: "glsl-top-shader",
    title: "GLSL TOP Shader",
    description,
    tags: ["GLSL", "shader", "TOP", "texture", "sampler", "uniform"],
    complexity: "medium",
    nodes,
    connections,
    pythonCode,
    gotchas,
  };
}

// ─── Recipe 4: audioReactive ────────────────────────────────────────────────

/**
 * Audio-reactive spectrum visualizer.
 *
 * Network:
 *   audiofileinCHOP → audiospectrumCHOP → mathCHOP → choptoTOP → nullTOP
 *
 * Converts audio frequencies to a texture row-by-row each frame.
 */
function audioReactive(): Recipe {
  const description =
    "Audio-reactive spectrum visualizer: audiofileinCHOP loads and plays audio, " +
    "audiospectrumCHOP runs FFT analysis, mathCHOP applies gain and post-processing, " +
    "and choptoTOP converts the frequency data to a 1D texture. Each frame, a new " +
    "row of spectrum data is appended to the texture.";

  const nodes = [
    "audiofileinCHOP",
    "audiospectrumCHOP",
    "mathCHOP",
    "choptoTOP",
    "nullTOP",
  ];

  const connections = [
    "audiofileinCHOP → audiospectrumCHOP input 0 (raw audio → FFT)",
    "audiospectrumCHOP → mathCHOP input 0 (frequency magnitudes → gain)",
    "mathCHOP → choptoTOP input 0 (CHOP data → texture rows)",
    "choptoTOP → nullTOP input 0 (final spectrum texture)",
  ];

  const pythonCode = `# ═══════════════════════════════════════════════════════════════
# Recipe: Audio-Reactive Spectrum
# ═══════════════════════════════════════════════════════════════
# Paste into a Text DAT and run, or run directly in the TD Python console.
# Builds: audiofileinCHOP → audiospectrumCHOP → mathCHOP → choptoTOP → nullTOP
#
# Key wiring:
#   • audiospectrumCHOP needs timeslice=True for real-time output
#   • choptoTOP dataformat='r' produces single-channel red texture
#   • Set FFT size to a power of 2 (256, 512, 1024)

def build_audio_reactive(parent_path='/project1', audio_file=''):
    parent = op(parent_path)

    # ── Create operators ──
    audio_in = parent.create(audiofileinCHOP, 'audio_in')
    spectrum = parent.create(audiospectrumCHOP, 'spectrum')
    math = parent.create(mathCHOP, 'math_gain')
    chop_to_top = parent.create(choptoTOP, 'chop_to_top')
    output = parent.create(nullTOP, 'OUT')

    # ── Wire connections ──
    spectrum.inputConnectors[0].connect(audio_in)
    math.inputConnectors[0].connect(spectrum)
    chop_to_top.inputConnectors[0].connect(math)
    output.inputConnectors[0].connect(chop_to_top)

    # ── Configure audio source ──
    if audio_file:
        audio_in.par.file = audio_file
    audio_in.par.play = 1
    audio_in.par.loop = False          # single playthrough (set True for loops)

    # ── Configure audiospectrumCHOP ──
    spectrum.par.fftsize = 512         # 512-sample FFT window
    spectrum.par.outputmenu = 'setmanually'
    spectrum.par.outlength = 256       # 256 frequency bins → 256px texture width
    spectrum.par.timeslice = True      # CRITICAL: real-time, one row per frame
    spectrum.par.window = 'hamming'    # cleaner spectrum than rectangular

    # ── Configure mathCHOP (gain + smoothing) ──
    math.par.gain = 10.0               # amplify quiet frequencies
    math.par.range = 'positive'        # strip negative values (FFT magnitude is positive)
    math.par.postoff = 0.0

    # ── Configure choptoTOP ──
    chop_to_top.par.dataformat = 'r'   # single-channel red → luminance
    chop_to_top.par.layout = 'rowscropped'  # each CHOP channel = one texture row
    chop_to_top.par.resolutionw = 256  # matches outlength
    chop_to_top.par.resolutionh = 256  # rows

    # ── Layout ──
    audio_in.nodeX = -800;    audio_in.nodeY = 0
    spectrum.nodeX = -500;    spectrum.nodeY = 0
    math.nodeX = -200;        math.nodeY = 0
    chop_to_top.nodeX = 100;  chop_to_top.nodeY = 0
    output.nodeX = 400;       output.nodeY = 0

    print(f"[audioReactive] Built audio-reactive pipeline at {output.path}")
    return output

build_audio_reactive('/project1', '')
`;

  const gotchas = [
    "GOTCHA: audiospectrumCHOP.timeslice MUST be True for real-time operation. Without it, the CHOP outputs static data and the texture won't update.",
    "GOTCHA: choptoTOP.layout='rowscropped' maps CHOP channels to texture rows. If you want columns instead, use 'colscropped'.",
    "GOTCHA: mathCHOP.range='positive' is important — FFT magnitude is non-negative, but noise/interpolation can produce tiny negative values. Clamping prevents artifacts.",
    "GOTCHA: outlength on audiospectrumCHOP must match choptoTOP.resolutionw or the texture will be misaligned/cropped.",
    "GOTCHA: If audio_file is empty, the recipe still works — switch to a live audio device in (audioinCHOP) or set the file path later.",
    "GOTCHA: On slow machines, FFT size 1024+ with timeslice can miss frames. Use 256 or 512 for stable 60fps.",
  ];

  return {
    name: "audio-reactive-spectrum",
    title: "Audio-Reactive Spectrum",
    description,
    tags: ["audio", "reactive", "spectrum", "FFT", "visualizer", "CHOP", "TOP"],
    complexity: "medium",
    nodes,
    connections,
    pythonCode,
    gotchas,
  };
}

// ─── Recipe 5: renderScene3D ────────────────────────────────────────────────

/**
 * 3D scene rendering with geometry, light, and camera.
 *
 * Network:
 *   geometryCOMP (light + camera + geo inside) → renderTOP → nullTOP
 *
 * Creates a full 3D render pipeline: a geometryCOMP contains a lightCOMP,
 * cameraCOMP, and torusSOP (or other geometry), and a renderTOP renders the
 * scene to a 2D texture.
 */
function renderScene3D(): Recipe {
  const description =
    "Complete 3D render pipeline: a geometryCOMP contains a light, camera, " +
    "and geometry (torusSOP). The renderTOP renders the scene to a 2D texture " +
    "for downstream TOP compositing. Self-contained scene — no external assets needed.";

  const nodes = [
    "torusSOP (inside geometryCOMP)",
    "lightCOMP (inside geometryCOMP)",
    "cameraCOMP (inside geometryCOMP)",
    "geometryCOMP (container)",
    "renderTOP",
    "nullTOP",
  ];

  const connections = [
    "torusSOP → geometryCOMP (child of)",
    "lightCOMP → geometryCOMP (child of)",
    "cameraCOMP → geometryCOMP (child of)",
    "geometryCOMP → renderTOP input 0 (3D scene → 2D texture)",
    "renderTOP → nullTOP input 0 (final output)",
  ];

  const pythonCode = `# ═══════════════════════════════════════════════════════════════
# Recipe: Render 3D Scene
# ═══════════════════════════════════════════════════════════════
# Paste into a Text DAT and run, or run directly in the TD Python console.
# Builds: geometryCOMP (light + camera + torus) → renderTOP → nullTOP
#
# Key wiring:
#   • geometryCOMP contains the 3D scene hierarchy
#   • renderTOP renders the geometryCOMP to a 2D texture
#   • The whole setup is self-contained (no external files)

def build_render_scene_3d(parent_path='/project1'):
    parent = op(parent_path)

    # ── Create the geometry container ──
    geo_comp = parent.create(geometryCOMP, 'scene_geo')

    # ── Create scene objects INSIDE the geometryCOMP ──
    light = geo_comp.create(lightCOMP, 'key_light')
    camera = geo_comp.create(cameraCOMP, 'main_camera')
    torus = geo_comp.create(torusSOP, 'torus_geo')

    # ── Create render + output ──
    render = parent.create(renderTOP, 'render')
    output = parent.create(nullTOP, 'OUT')

    # ── Wire 3D scene to render ──
    render.inputConnectors[0].connect(geo_comp)
    output.inputConnectors[0].connect(render)

    # ── Configure light ──
    light.par.tx = 2.0
    light.par.ty = 3.0
    light.par.tz = 4.0
    light.par.rotx = 35   # angle down toward origin
    light.par.roty = -30
    light.par.intensity = 1.2
    light.par.colr = 1.0
    light.par.colg = 0.95
    light.par.colb = 0.85
    light.par.lighttype = 'directional'  # directional for even illumination

    # ── Configure camera ──
    camera.par.tx = 0.0
    camera.par.ty = 1.5
    camera.par.tz = 4.0
    camera.par.rotx = -15  # tilt down
    camera.par.roty = 0
    camera.par.fov = 60

    # ── Configure torus ──
    torus.par.radx = 1.2
    torus.par.rady = 0.5
    torus.par.rows = 80
    torus.par.cols = 120
    torus.par.rotx = 0
    torus.par.roty = 0
    torus.par.rotz = 0

    # ── Add a material (phong) ──
    mat = geo_comp.create(phongMAT, 'torus_material')
    mat.par.diffr = 0.3
    mat.par.diffg = 0.6
    mat.par.diffb = 1.0
    mat.par.specr = 0.8
    mat.par.specg = 0.8
    mat.par.specb = 0.8
    mat.par.shininess = 32
    torus.par.material = 'torus_material'

    # ── Configure renderTOP ──
    render.par.camera = camera.name        # use camera inside geo_comp
    render.par.resolutionw = 1280
    render.par.resolutionh = 720
    render.par.antialiasing = True
    render.par.shadows = False             # no shadows for simple scene
    render.par.backgroundr = 0.05
    render.par.backgroundg = 0.05
    render.par.backgroundb = 0.1

    # ── Layout (outer operators) ──
    geo_comp.nodeX = -300;  geo_comp.nodeY = 0
    render.nodeX = 0;       render.nodeY = 0
    output.nodeX = 300;     output.nodeY = 0

    # ── The renderTOP may need a pulse to start cooking ──
    render.cook(force=True)

    print(f"[renderScene3D] Built 3D render pipeline at {output.path}")
    return output

build_render_scene_3d('/project1')
`;

  const gotchas = [
    "GOTCHA: renderTOP.camera must reference a camera that exists INSIDE the geometryCOMP, not at the project level. Use camera.name (relative to geo_comp).",
    "GOTCHA: Materials (phongMAT) must also be inside the same geometryCOMP as the geometry they apply to. Cross-COMP material references won't work.",
    "GOTCHA: After creating the scene, call render.cook(force=True) to ensure the first frame renders. Otherwise you may see a black frame until the next cook cycle.",
    "GOTCHA: renderTOP.resolution resets to the project resolution if not explicitly set. Always set resolutionw/resolutionh explicitly.",
    "GOTCHA: lightCOMP.lighttype='directional' ignores position but respects rotation — this is a common source of \"light not affecting scene\" bugs.",
    "GOTCHA: For complex meshes, increase torus.rows/cols gradually. High values (200+) on integrated GPUs can cause frame drops at render time.",
  ];

  return {
    name: "render-scene-3d",
    title: "Render 3D Scene",
    description,
    tags: ["3D", "render", "geometry", "light", "camera", "scene", "COMP", "TOP"],
    complexity: "medium",
    nodes,
    connections,
    pythonCode,
    gotchas,
  };
}

// ─── Recipe registry ────────────────────────────────────────────────────────

const RECIPES: Recipe[] = [
  feedbackLoopTOP(),
  particleSystemPOP(),
  glslTOPShader(),
  audioReactive(),
  renderScene3D(),
];

const RECIPE_MAP: Map<string, Recipe> = new Map(
  RECIPES.map((r) => [r.name, r])
);

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * List all available builder recipes.
 *
 * @returns Array of all recipes with full metadata.
 */
export function listRecipes(): Recipe[] {
  return RECIPES;
}

/**
 * Get a single recipe by name.
 *
 * @param name - Recipe identifier (e.g. "feedback-loop-top").
 * @returns The matching recipe, or undefined if not found.
 */
export function getRecipe(name: string): Recipe | undefined {
  return RECIPE_MAP.get(name);
}

/**
 * Search recipes by tag or keyword in the description.
 *
 * @param query - Free-text search across name, description, and tags.
 * @returns Matching recipes sorted by relevance.
 */
export function searchRecipes(query: string): Recipe[] {
  const q = query.toLowerCase().trim();
  if (!q) return RECIPES;

  const scored = RECIPES.map((r) => {
    let score = 0;
    if (r.name.toLowerCase().includes(q)) score += 10;
    if (r.description.toLowerCase().includes(q)) score += 5;
    if (r.tags.some((t) => t.toLowerCase().includes(q))) score += 8;
    if (r.title.toLowerCase().includes(q)) score += 7;
    return { recipe: r, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.recipe);

  return scored;
}

/**
 * Get all recipe names (for UI listing).
 */
export function listRecipeNames(): string[] {
  return RECIPES.map((r) => r.name);
}

/**
 * Get all tags across all recipes with counts.
 */
export function recipeTags(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of RECIPES) {
    for (const tag of r.tags) {
      counts[tag] = (counts[tag] ?? 0) + 1;
    }
  }
  return counts;
}

// ─── End of builderRecipes.ts ──────────────────────────────────────────────
