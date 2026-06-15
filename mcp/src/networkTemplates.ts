/**
 * Network Templates & Natural Language Type Resolution
 *
 * Merged from the best features of community repos:
 *   1. 8 detailed network templates with EXACT port-level wiring + Python builder code
 *   2. 200+ natural language synonyms mapping words → TD operator types
 *   3. FAMILY_HINTS for family inference
 *   4. resolveOperatorType() and getBestFamily() functions
 *
 * Each template carries a complete paste-ready Python snippet that builds the
 * network inside TouchDesigner.  Port indices ARE part of the template contract —
 * not inferred, not "just a chain".
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TemplateOperator {
  /** Unique ID within this template (e.g. "noise_src", "feedback") */
  id: string;
  /** Canonical TouchDesigner operator type (e.g. "noiseTOP", "compositeTOP") */
  opType: string;
  /** Human-readable label shown in TD network editor */
  label: string;
  /** What this operator does in the network */
  purpose: string;
}

export interface TemplateConnection {
  /** Source operator ID */
  from: string;
  /** Target operator ID */
  to: string;
  /** EXACT target input port index (0-based, as TD uses) */
  inputIndex: number;
  /** Why this specific port wiring was chosen */
  note: string;
}

export interface TemplateParameter {
  /** Operator ID this parameter belongs to */
  opId: string;
  /** TD parameter name (e.g. "operand", "size", "fftsize") */
  paramName: string;
  /** Value to set */
  value: unknown;
  /** Explanation of this parameter choice */
  note: string;
}

export interface NetworkTemplate {
  /** Unique template identifier */
  name: string;
  /** Human-readable description */
  description: string;
  /** Search/discovery tags */
  tags: string[];
  /** Rough complexity: "simple" | "medium" | "advanced" */
  complexity: "simple" | "medium" | "advanced";
  /** Nodes in the network */
  operators: TemplateOperator[];
  /** EXACT port-level wiring — every connection has a specific inputIndex */
  connections: TemplateConnection[];
  /** Key parameters to configure */
  parameters: TemplateParameter[];
  /** Complete paste-ready Python code that builds this network in TD */
  pythonBuilder: string;
}

// ─── 8 Network Templates with Exact Port Wiring ────────────────────────────

export const NETWORK_TEMPLATES: NetworkTemplate[] = [

  // ════════════════════════════════════════════════════════════════════════════
  // TEMPLATE 1: generative-art-feedback
  // ════════════════════════════════════════════════════════════════════════════
  {
    name: "generative-art-feedback",
    description:
      "Generative art feedback loop: noiseTOP seeds a feedback system. " +
      "The feedbackTOP accumulates frames, transformTOP warps the output, " +
      "and compositeTOP blends the original noise with the warped feedback. " +
      "Fans out: noiseTOP drives BOTH feedbackTOP (input 0) AND compositeTOP (input 1).",
    tags: ["feedback", "generative", "art", "loop", "transform", "composite", "noise"],
    complexity: "advanced",
    operators: [
      {
        id: "noise_src",
        opType: "noiseTOP",
        label: "Noise Source",
        purpose: "Generates the initial noise texture that seeds the feedback loop",
      },
      {
        id: "feedback",
        opType: "feedbackTOP",
        label: "Feedback Accumulator",
        purpose:
          "Accumulates frames from the transform chain, creating temporal smearing. " +
          "Target TOP set to transformTOP so the loop feeds through transform.",
      },
      {
        id: "transform",
        opType: "transformTOP",
        label: "Warp Transform",
        purpose: "Rotates, scales, and translates the feedback output each frame",
      },
      {
        id: "composite",
        opType: "compositeTOP",
        label: "Mix Blend",
        purpose: "Blends the original noise (input 0) with the warped feedback (input 1)",
      },
      {
        id: "output",
        opType: "nullTOP",
        label: "OUT",
        purpose: "Rendered output for display or downstream processing",
      },
    ],
    connections: [
      {
        from: "noise_src",
        to: "feedback",
        inputIndex: 0,
        note: "noiseTOP output → feedbackTOP input 0: seeds the feedback accumulator",
      },
      {
        from: "feedback",
        to: "transform",
        inputIndex: 0,
        note: "feedbackTOP → transformTOP input 0: accumulated frames get warped each tick",
      },
      {
        from: "transform",
        to: "composite",
        inputIndex: 0,
        note: "transformTOP → compositeTOP input 0: warped feedback is the main input",
      },
      {
        from: "noise_src",
        to: "composite",
        inputIndex: 1,
        note:
          "noiseTOP → compositeTOP input 1: original noise mixed with feedback " +
          "(fan-out — noise drives TWO consumers)",
      },
      {
        from: "composite",
        to: "output",
        inputIndex: 0,
        note: "compositeTOP → nullTOP input 0: final blended output",
      },
    ],
    parameters: [
      {
        opId: "noise_src",
        paramName: "type",
        value: "simplex",
        note: "Simplex noise gives organic, flowing shapes for feedback art",
      },
      {
        opId: "noise_src",
        paramName: "resolution",
        value: [512, 512],
        note: "Square resolution for symmetry",
      },
      {
        opId: "feedback",
        paramName: "reset",
        value: "resetnone",
        note: "Never reset — continuous accumulation",
      },
      {
        opId: "feedback",
        paramName: "targettop",
        value: "transform",
        note: "Target TOP set to transform so loop picks up warped output",
      },
      {
        opId: "transform",
        paramName: "rotate",
        value: 1.0,
        note: "Subtle 1° rotation per frame creates spiral motion",
      },
      {
        opId: "transform",
        paramName: "scale",
        value: [0.99, 0.99],
        note: "Slight zoom-in each frame compresses the feedback",
      },
      {
        opId: "composite",
        paramName: "operand",
        value: "add",
        note: "Additive blend brightens overlapping regions",
      },
      {
        opId: "composite",
        paramName: "scale1",
        value: 0.85,
        note: "Feedback at 85% opacity to avoid runaway brightness",
      },
      {
        opId: "composite",
        paramName: "scale2",
        value: 0.25,
        note: "Original noise at 25% as subtle texture",
      },
    ],
    pythonBuilder: `# ── generative-art-feedback ──────────────────────────────────
# Paste into a Text DAT and run, or run in the TD Python console.
# Builds: noiseTOP → feedbackTOP → transformTOP → compositeTOP → nullTOP
# With noiseTOP fanning out to both feedbackTOP(input 0) and compositeTOP(input 1).

def build_generative_art_feedback(parent):
    import datetime
    parent = op(parent)

    noise = parent.create(noiseTOP, 'noise_src')
    noise.par.type = 'simplex'
    noise.par.resolutionw = 512
    noise.par.resolutionh = 512

    feedback = parent.create(feedbackTOP, 'feedback')
    feedback.inputConnectors[0].connect(noise)
    feedback.par.reset = 'resetnone'

    transform = parent.create(transformTOP, 'transform')
    transform.inputConnectors[0].connect(feedback)
    transform.par.rotate = 1.0
    transform.par.scale1 = 0.99
    transform.par.scale2 = 0.99

    feedback.par.targettop = transform.name

    composite = parent.create(compositeTOP, 'composite')
    # input 0: warped feedback, input 1: original noise (fan-out)
    composite.inputConnectors[0].connect(transform)
    composite.inputConnectors[1].connect(noise)
    composite.par.operand = 'add'
    composite.par.scale1 = 0.85
    composite.par.scale2 = 0.25

    output = parent.create(nullTOP, 'OUT')
    output.inputConnectors[0].connect(composite)

    # Layout nodes in a grid
    noise.nodeX = -300; noise.nodeY = 0
    feedback.nodeX = 0;   feedback.nodeY = 0
    transform.nodeX = 300;  transform.nodeY = 0
    composite.nodeX = 600;  composite.nodeY = 0
    output.nodeX = 900;    output.nodeY = 0

    return output

build_generative_art_feedback('/project1')
`,
  },

  // ════════════════════════════════════════════════════════════════════════════
  // TEMPLATE 2: audio-reactive-spectrum
  // ════════════════════════════════════════════════════════════════════════════
  {
    name: "audio-reactive-spectrum",
    description:
      "Audio-reactive spectrum visualizer: audiofileinCHOP feeds an FFT audiospectrumCHOP, " +
      "mathCHOP applies gain, and choptoTOP converts the spectrum to a texture for rendering.",
    tags: ["audio", "reactive", "spectrum", "FFT", "visualizer", "CHOP", "TOP"],
    complexity: "medium",
    operators: [
      {
        id: "audio_in",
        opType: "audiofileinCHOP",
        label: "Audio Source",
        purpose: "Loads and plays an audio file as a CHOP channel stream",
      },
      {
        id: "spectrum",
        opType: "audiospectrumCHOP",
        label: "FFT Spectrum",
        purpose: "Performs real-time FFT analysis, outputting frequency magnitude channels",
      },
      {
        id: "math",
        opType: "mathCHOP",
        label: "Gain + Post-Process",
        purpose: "Amplifies and optionally smooths the spectrum channels",
      },
      {
        id: "chop_to_top",
        opType: "choptoTOP",
        label: "Spectrum Texture",
        purpose: "Converts CHOP channels to a 1D texture (one row per channel sample)",
      },
      {
        id: "output",
        opType: "nullTOP",
        label: "OUT",
        purpose: "Final spectrum texture for display or GLSL sampling",
      },
    ],
    connections: [
      {
        from: "audio_in",
        to: "spectrum",
        inputIndex: 0,
        note: "audiofileinCHOP → audiospectrumCHOP input 0: audio channels fed to FFT",
      },
      {
        from: "spectrum",
        to: "math",
        inputIndex: 0,
        note: "audiospectrumCHOP → mathCHOP input 0: frequency magnitudes post-processed",
      },
      {
        from: "math",
        to: "chop_to_top",
        inputIndex: 0,
        note: "mathCHOP → choptoTOP input 0: processed channels mapped to pixel rows",
      },
      {
        from: "chop_to_top",
        to: "output",
        inputIndex: 0,
        note: "choptoTOP → nullTOP input 0: final spectrum texture",
      },
    ],
    parameters: [
      {
        opId: "audio_in",
        paramName: "file",
        value: "<audio_file_path>",
        note: "Set to a .wav/.mp3 path; leave as placeholder in template",
      },
      {
        opId: "audio_in",
        paramName: "play",
        value: 1,
        note: "Auto-play on load",
      },
      {
        opId: "spectrum",
        paramName: "fftsize",
        value: 512,
        note: "512-sample FFT window balances frequency resolution and latency",
      },
      {
        opId: "spectrum",
        paramName: "outlength",
        value: 256,
        note: "256 frequency bins → 256px wide texture",
      },
      {
        opId: "spectrum",
        paramName: "timeslice",
        value: true,
        note: "Enable time-sliced output so each frame gets a fresh spectrum row",
      },
      {
        opId: "math",
        paramName: "gain",
        value: 10,
        note: "10× gain to make quiet frequencies visible in the texture",
      },
      {
        opId: "chop_to_top",
        paramName: "dataformat",
        value: "r",
        note: "Single-channel red texture (luminance from spectrum magnitude)",
      },
      {
        opId: "chop_to_top",
        paramName: "layout",
        value: "rowscropped",
        note: "Rows layout: each CHOP channel becomes a texture row",
      },
    ],
    pythonBuilder: `# ── audio-reactive-spectrum ───────────────────────────────
# Builds: audiofileinCHOP → audiospectrumCHOP → mathCHOP → choptoTOP → nullTOP

def build_audio_spectrum(parent, audio_path=''):
    parent = op(parent)

    audio_in = parent.create(audiofileinCHOP, 'audio_in')
    if audio_path:
        audio_in.par.file = audio_path
    audio_in.par.play = 1

    spectrum = parent.create(audiospectrumCHOP, 'spectrum')
    spectrum.inputConnectors[0].connect(audio_in)
    spectrum.par.fftsize = 512
    spectrum.par.outputmenu = 'setmanually'
    spectrum.par.outlength = 256
    spectrum.par.timeslice = True

    math = parent.create(mathCHOP, 'math')
    math.inputConnectors[0].connect(spectrum)
    math.par.gain = 10

    chop_to_top = parent.create(choptoTOP, 'chop_to_top')
    chop_to_top.inputConnectors[0].connect(math)
    chop_to_top.par.dataformat = 'r'
    chop_to_top.par.layout = 'rowscropped'

    output = parent.create(nullTOP, 'OUT')
    output.inputConnectors[0].connect(chop_to_top)

    audio_in.nodeX = -600; audio_in.nodeY = 0
    spectrum.nodeX = -300; spectrum.nodeY = 0
    math.nodeX = 0; math.nodeY = 0
    chop_to_top.nodeX = 300; chop_to_top.nodeY = 0
    output.nodeX = 600; output.nodeY = 0

    return output

build_audio_spectrum('/project1', '/path/to/audio.wav')
`,
  },

  // ════════════════════════════════════════════════════════════════════════════
  // TEMPLATE 3: particle-system-basic
  // ════════════════════════════════════════════════════════════════════════════
  {
    name: "particle-system-basic",
    description:
      "Basic POP particle system with feedback loop: spherePOP emits particles, " +
      "particlePOP simulates them, noisePOP adds turbulence, trailPOP draws trails, " +
      "renderPOP converts to texture, and a nullPOP serves as the feedback target. " +
      "The particlePOP's 'particlesupdatepop' parameter points to the nullPOP to create " +
      "a closed solver loop.",
    tags: ["particles", "POP", "simulation", "noise", "trail", "feedback", "GPU"],
    complexity: "advanced",
    operators: [
      {
        id: "sphere",
        opType: "spherePOP",
        label: "Source Points",
        purpose: "Generates initial particle positions on a sphere surface",
      },
      {
        id: "particle",
        opType: "particlePOP",
        label: "Particle Sim",
        purpose:
          "Core particle solver: simulates physics, births particles, manages lifecycle. " +
          "points to null_fb as the feedback target for the solver loop.",
      },
      {
        id: "noise_force",
        opType: "noisePOP",
        label: "Turbulence Force",
        purpose: "Applies curl/random noise force to particles for organic motion",
      },
      {
        id: "trail",
        opType: "trailPOP",
        label: "Trails",
        purpose: "Records particle history as connected trail segments",
      },
      {
        id: "render",
        opType: "renderPOP",
        label: "Render to TOP",
        purpose: "Converts the POP point cloud into a rendered texture",
      },
      {
        id: "null_fb",
        opType: "nullPOP",
        label: "Feedback Target",
        purpose:
          "Stores the previous frame's particle state. particlePOP reads from here " +
          "to build the next frame, creating the solver feedback loop.",
      },
      {
        id: "output",
        opType: "nullTOP",
        label: "OUT",
        purpose: "Final rendered texture for display or compositing",
      },
    ],
    connections: [
      {
        from: "sphere",
        to: "particle",
        inputIndex: 0,
        note: "spherePOP → particlePOP input 0: initial point positions seed the solver",
      },
      {
        from: "particle",
        to: "noise_force",
        inputIndex: 0,
        note: "particlePOP → noisePOP input 0: solved positions get turbulence applied",
      },
      {
        from: "noise_force",
        to: "trail",
        inputIndex: 0,
        note: "noisePOP → trailPOP input 0: jittered points generate trails",
      },
      {
        from: "trail",
        to: "null_fb",
        inputIndex: 0,
        note:
          "trailPOP → nullPOP input 0: trail output becomes the feedback target. " +
          "particlePOP reads from null_fb via particlesupdatepop parameter.",
      },
      {
        from: "trail",
        to: "render",
        inputIndex: 0,
        note: "trailPOP → renderPOP input 0: trail geometry rendered to texture (fan-out from trail)",
      },
      {
        from: "render",
        to: "output",
        inputIndex: 0,
        note: "renderPOP → nullTOP input 0: final rendered texture",
      },
    ],
    parameters: [
      {
        opId: "sphere",
        paramName: "radius",
        value: [1.0, 1.0, 1.0],
        note: "Unit sphere as birth surface",
      },
      {
        opId: "particle",
        paramName: "birthrate",
        value: 100,
        note: "100 particles born per second",
      },
      {
        opId: "particle",
        paramName: "lifeexpect",
        value: 3,
        note: "Particles live 3 seconds before dying",
      },
      {
        opId: "particle",
        paramName: "enabletimeintegration",
        value: true,
        note: "Enable time-stepped physics simulation",
      },
      {
        opId: "particle",
        paramName: "particlesupdatepop",
        value: "null_fb",
        note:
          "Points to null_fb — this closes the solver feedback loop. " +
          "Each frame the solver reads the previous frame's state from null_fb.",
      },
      {
        opId: "noise_force",
        paramName: "amp0",
        value: 0.5,
        note: "Noise amplitude — controls how chaotic the motion is",
      },
      {
        opId: "noise_force",
        paramName: "freq0",
        value: 2.0,
        note: "Noise frequency — spatial scale of turbulence",
      },
      {
        opId: "trail",
        paramName: "length",
        value: 10,
        note: "Each particle leaves a 10-segment trail",
      },
    ],
    pythonBuilder: `# ── particle-system-basic ───────────────────────────────────
# Builds: spherePOP → particlePOP → noisePOP → trailPOP → (nullPOP + renderPOP) → nullTOP
# Feedback loop: particlePOP.particlesupdatepop → null_fb

def build_particle_system(parent):
    parent = op(parent)

    sphere = parent.create(spherePOP, 'sphere')
    sphere.par.radx = 1.0
    sphere.par.rady = 1.0
    sphere.par.radz = 1.0

    particle = parent.create(particlePOP, 'particle')
    particle.inputConnectors[0].connect(sphere)
    particle.par.birthrate = 100
    particle.par.lifeexpect = 3
    particle.par.enabletimeintegration = True

    noise_force = parent.create(noisePOP, 'noise_force')
    noise_force.inputConnectors[0].connect(particle)
    noise_force.par.amp0 = 0.5
    noise_force.par.freq0 = 2.0

    trail = parent.create(trailPOP, 'trail')
    trail.inputConnectors[0].connect(noise_force)
    trail.par.length = 10

    null_fb = parent.create(nullPOP, 'null_fb')
    null_fb.inputConnectors[0].connect(trail)

    # Close the feedback loop: particle solver reads from null_fb
    particle.par.particlesupdatepop = null_fb.name

    render = parent.create(renderPOP, 'render')
    render.inputConnectors[0].connect(trail)

    output = parent.create(nullTOP, 'OUT')
    output.inputConnectors[0].connect(render)

    sphere.nodeX = -900; sphere.nodeY = 0
    particle.nodeX = -600; particle.nodeY = 0
    noise_force.nodeX = -300; noise_force.nodeY = 0
    trail.nodeX = 0; trail.nodeY = 0
    null_fb.nodeX = 0; null_fb.nodeY = -150
    render.nodeX = 300; render.nodeY = 0
    output.nodeX = 600; output.nodeY = 0

    return output

build_particle_system('/project1')
`,
  },

  // ════════════════════════════════════════════════════════════════════════════
  // TEMPLATE 4: glow-bloom
  // ════════════════════════════════════════════════════════════════════════════
  {
    name: "glow-bloom",
    description:
      "Classic glow/bloom post-processing effect: source TOP feeds a levelTOP " +
      "(thresholds highlights), blurTOP spreads the bright areas, and compositeTOP " +
      "additively blends the blurred glow back over the original. Fan-out: source " +
      "connects to BOTH levelTOP (input 0) AND compositeTOP (input 0).",
    tags: ["effects", "postfx", "glow", "bloom", "blur", "composite"],
    complexity: "medium",
    operators: [
      {
        id: "source",
        opType: "moviefileinTOP",
        label: "Source",
        purpose: "Input video or image that will receive the glow effect",
      },
      {
        id: "level",
        opType: "levelTOP",
        label: "High-Pass Threshold",
        purpose:
          "Crush blacks so only bright highlight areas pass through to the blur stage",
      },
      {
        id: "blur",
        opType: "blurTOP",
        label: "Glow Blur",
        purpose: "Gaussian blur spreads the isolated highlights into a soft glow",
      },
      {
        id: "composite",
        opType: "compositeTOP",
        label: "Add Blend",
        purpose:
          "Additively composites the blurred glow (input 1) over the original source (input 0)",
      },
      {
        id: "output",
        opType: "nullTOP",
        label: "OUT",
        purpose: "Final glow-enhanced output",
      },
    ],
    connections: [
      {
        from: "source",
        to: "level",
        inputIndex: 0,
        note: "source → levelTOP input 0: original image enters high-pass chain",
      },
      {
        from: "level",
        to: "blur",
        inputIndex: 0,
        note: "levelTOP → blurTOP input 0: isolated highlights get blurred",
      },
      {
        from: "source",
        to: "composite",
        inputIndex: 0,
        note:
          "source → compositeTOP input 0: original image is the base layer " +
          "(fan-out — source drives TWO consumers)",
      },
      {
        from: "blur",
        to: "composite",
        inputIndex: 1,
        note: "blurTOP → compositeTOP input 1: blurred glow overlaid on base layer",
      },
      {
        from: "composite",
        to: "output",
        inputIndex: 0,
        note: "compositeTOP → nullTOP input 0: final blended output",
      },
    ],
    parameters: [
      {
        opId: "level",
        paramName: "blacklevel",
        value: 0.6,
        note: "Crush pixels below 60% luminance — only bright areas contribute to glow",
      },
      {
        opId: "level",
        paramName: "luminance",
        value: 1,
        note: "Operate on luminance not individual RGB channels for natural thresholding",
      },
      {
        opId: "blur",
        paramName: "filtertype",
        value: "gaussian",
        note: "Gaussian blur for a smooth, natural-looking glow",
      },
      {
        opId: "blur",
        paramName: "size",
        value: 3,
        note: "Blur radius in pixels — higher = wider glow spread",
      },
      {
        opId: "composite",
        paramName: "operand",
        value: "add",
        note: "Additive blend: bright glow adds to original without darkening",
      },
    ],
    pythonBuilder: `# ── glow-bloom ──────────────────────────────────────────────
# Builds: source → levelTOP → blurTOP → compositeTOP (blend with original) → nullTOP
# Fan-out: source connects to BOTH levelTOP(input 0) AND compositeTOP(input 0).

def build_glow_bloom(parent, source_path=''):
    parent = op(parent)

    source = parent.create(moviefileinTOP, 'source')
    if source_path:
        source.par.file = source_path

    level = parent.create(levelTOP, 'level')
    level.inputConnectors[0].connect(source)
    level.par.blacklevel = 0.6
    level.par.luminance = True

    blur = parent.create(blurTOP, 'blur')
    blur.inputConnectors[0].connect(level)
    blur.par.filtertype = 'gaussian'
    blur.par.size = 3

    composite = parent.create(compositeTOP, 'composite')
    # input 0 = original source, input 1 = blurred glow (fan-out from source)
    composite.inputConnectors[0].connect(source)
    composite.inputConnectors[1].connect(blur)
    composite.par.operand = 'add'

    output = parent.create(nullTOP, 'OUT')
    output.inputConnectors[0].connect(composite)

    source.nodeX = -600; source.nodeY = 0
    level.nodeX = -600; level.nodeY = -150
    blur.nodeX = -300; blur.nodeY = -150
    composite.nodeX = 0; composite.nodeY = 0
    output.nodeX = 300; output.nodeY = 0

    return output

build_glow_bloom('/project1')
`,
  },

  // ════════════════════════════════════════════════════════════════════════════
  // TEMPLATE 5: glsl-shader-pipeline
  // ════════════════════════════════════════════════════════════════════════════
  {
    name: "glsl-shader-pipeline",
    description:
      "GLSL shader with multi-input uniforms: constantTOP provides a time uniform " +
      "(input 0, increment each frame), noiseTOP provides a procedural texture " +
      "(input 1), and glslTOP applies a custom fragment shader combining both.",
    tags: ["glsl", "shader", "GPU", "procedural", "feedback"],
    complexity: "medium",
    operators: [
      {
        id: "time_uniform",
        opType: "constantTOP",
        label: "Time Uniform",
        purpose:
          "Provides a time-varying RGBA float uniform. Incremented each frame " +
          "via a parameter expression for use as u_Time in the GLSL shader.",
      },
      {
        id: "texture_input",
        opType: "noiseTOP",
        label: "Procedural Texture",
        purpose: "Generates a procedural noise texture used as a shader input sampler",
      },
      {
        id: "glsl",
        opType: "glslTOP",
        label: "GLSL Fragment Shader",
        purpose:
          "Runs a custom fragment shader with two inputs: time uniform (input 0) " +
          "and texture sampler (input 1). Accesses via uInput1 and sTD2DInputs[1].",
      },
      {
        id: "output",
        opType: "nullTOP",
        label: "OUT",
        purpose: "Final shader output for display",
      },
    ],
    connections: [
      {
        from: "time_uniform",
        to: "glsl",
        inputIndex: 0,
        note:
          "constantTOP → glslTOP input 0: time uniform (RGBA floats) accessible " +
          "as uInput1 in the shader",
      },
      {
        from: "texture_input",
        to: "glsl",
        inputIndex: 1,
        note:
          "noiseTOP → glslTOP input 1: procedural texture accessible as sTD2DInputs[1] " +
          "in the shader",
      },
      {
        from: "glsl",
        to: "output",
        inputIndex: 0,
        note: "glslTOP → nullTOP input 0: rendered shader output",
      },
    ],
    parameters: [
      {
        opId: "time_uniform",
        paramName: "format",
        value: "rgba32float",
        note: "RGBA 32-bit float for precise time and custom uniform channels",
      },
      {
        opId: "time_uniform",
        paramName: "resolution",
        value: [1, 1],
        note: "Single pixel is enough — shader reads the value, not the size",
      },
      {
        opId: "texture_input",
        paramName: "type",
        value: "simplex",
        note: "Simplex noise gives smooth, organic patterns",
      },
      {
        opId: "texture_input",
        paramName: "resolution",
        value: [512, 512],
        note: "Standard texture resolution for shader sampling",
      },
      {
        opId: "glsl",
        paramName: "refreshpulse",
        value: 1,
        note: "Force shader recompile when parameters change",
      },
      {
        opId: "glsl",
        paramName: "resx",
        value: 512,
        note: "Output resolution matches input texture",
      },
      {
        opId: "glsl",
        paramName: "resy",
        value: 512,
        note: "Output resolution matches input texture",
      },
    ],
    pythonBuilder: `# ── glsl-shader-pipeline ───────────────────────────────────
# Builds: constantTOP(time) → glslTOP(input 0) + noiseTOP → glslTOP(input 1) → nullTOP

def build_glsl_shader(parent):
    parent = op(parent)

    time_uniform = parent.create(constantTOP, 'time_uniform')
    time_uniform.par.format = 'rgba32float'
    time_uniform.par.resolutionw = 1
    time_uniform.par.resolutionh = 1
    # Animate time by incrementing red channel each frame
    time_uniform.par.value0r.expr = 'absTime.frame'

    texture_input = parent.create(noiseTOP, 'texture_input')
    texture_input.par.type = 'simplex'
    texture_input.par.resolutionw = 512
    texture_input.par.resolutionh = 512

    glsl = parent.create(glslTOP, 'glsl')
    glsl.inputConnectors[0].connect(time_uniform)
    glsl.inputConnectors[1].connect(texture_input)
    glsl.par.refreshpulse = 1
    glsl.par.resx = 512
    glsl.par.resy = 512

    output = parent.create(nullTOP, 'OUT')
    output.inputConnectors[0].connect(glsl)

    time_uniform.nodeX = -600; time_uniform.nodeY = -150
    texture_input.nodeX = -600; texture_input.nodeY = 150
    glsl.nodeX = 0; glsl.nodeY = 0
    output.nodeX = 300; output.nodeY = 0

    return output

build_glsl_shader('/project1')
`,
  },

  // ════════════════════════════════════════════════════════════════════════════
  // TEMPLATE 6: chroma-key-composite
  // ════════════════════════════════════════════════════════════════════════════
  {
    name: "chroma-key-composite",
    description:
      "Chroma-key compositing pipeline: foreground source → chromakeyTOP removes " +
      "a color (green/blue screen), then overTOP composites the keyed foreground " +
      "(input 1) over a background source (input 0). Background is the base layer.",
    tags: ["chromakey", "composite", "keying", "greenscreen", "bluescreen", "over"],
    complexity: "medium",
    operators: [
      {
        id: "fg_source",
        opType: "moviefileinTOP",
        label: "Foreground (Greenscreen)",
        purpose: "Foreground video footage shot against a green or blue screen",
      },
      {
        id: "bg_source",
        opType: "rampTOP",
        label: "Background",
        purpose: "Background image/video that replaces the keyed-out color",
      },
      {
        id: "chromakey",
        opType: "chromakeyTOP",
        label: "Chroma Key",
        purpose: "Removes the specified chroma color (green/blue) from the foreground",
      },
      {
        id: "over",
        opType: "overTOP",
        label: "Over Composite",
        purpose:
          "Composites the keyed foreground (input 1) over the background (input 0) " +
          "using alpha from the chromakey",
      },
      {
        id: "output",
        opType: "nullTOP",
        label: "OUT",
        purpose: "Final composited output",
      },
    ],
    connections: [
      {
        from: "fg_source",
        to: "chromakey",
        inputIndex: 0,
        note: "foreground → chromakeyTOP input 0: video to be keyed",
      },
      {
        from: "bg_source",
        to: "over",
        inputIndex: 0,
        note: "background → overTOP input 0: base/background layer",
      },
      {
        from: "chromakey",
        to: "over",
        inputIndex: 1,
        note:
          "chromakeyTOP → overTOP input 1: keyed foreground overlaid on background. " +
          "Alpha channel from chromakey controls transparency.",
      },
      {
        from: "over",
        to: "output",
        inputIndex: 0,
        note: "overTOP → nullTOP input 0: final composite",
      },
    ],
    parameters: [
      {
        opId: "chromakey",
        paramName: "keycolor",
        value: [0.0, 1.0, 0.0],
        note: "Key out pure green (RGB 0,1,0) — adjust for actual screen color",
      },
      {
        opId: "chromakey",
        paramName: "threshold",
        value: [0.4, 0.4, 0.4],
        note: "Tolerance per channel — higher accepts more variation in screen color",
      },
      {
        opId: "chromakey",
        paramName: "spillthreshold",
        value: 0.2,
        note: "Desaturates green spill on edges for cleaner matte edges",
      },
      {
        opId: "over",
        paramName: "outputresolution",
        value: "input1",
        note: "Use foreground resolution (input 1) as output resolution",
      },
    ],
    pythonBuilder: `# ── chroma-key-composite ──────────────────────────────────
# Builds: fg → chromakeyTOP, bg → overTOP(input 0), chromakey → overTOP(input 1) → nullTOP

def build_chromakey(parent, fg_path='', bg_path=''):
    parent = op(parent)

    fg_source = parent.create(moviefileinTOP, 'fg_source')
    if fg_path:
        fg_source.par.file = fg_path

    bg_source = parent.create(rampTOP, 'bg_source')
    bg_source.par.phaser.expr = 'absTime.frame * 0.01'

    chromakey = parent.create(chromakeyTOP, 'chromakey')
    chromakey.inputConnectors[0].connect(fg_source)
    chromakey.par.keycolorr = 0.0
    chromakey.par.keycolorg = 1.0
    chromakey.par.keycolorb = 0.0
    chromakey.par.thresholdr = 0.4
    chromakey.par.thresholdg = 0.4
    chromakey.par.thresholdb = 0.4
    chromakey.par.spillthreshold = 0.2

    over = parent.create(overTOP, 'over')
    # input 0 = background (base), input 1 = keyed foreground
    over.inputConnectors[0].connect(bg_source)
    over.inputConnectors[1].connect(chromakey)
    over.par.outputresolution = 'input1'

    output = parent.create(nullTOP, 'OUT')
    output.inputConnectors[0].connect(over)

    bg_source.nodeX = -600; bg_source.nodeY = -150
    fg_source.nodeX = -600; fg_source.nodeY = 150
    chromakey.nodeX = -300; chromakey.nodeY = 150
    over.nodeX = 0; over.nodeY = 0
    output.nodeX = 300; output.nodeY = 0

    return output

build_chromakey('/project1')
`,
  },

  // ════════════════════════════════════════════════════════════════════════════
  // TEMPLATE 7: kaleidoscope
  // ════════════════════════════════════════════════════════════════════════════
  {
    name: "kaleidoscope",
    description:
      "Kaleidoscope effect chain: noiseTOP generates a source pattern, " +
      "transformTOP rotates/scales the input, and kaleidoscopeTOP applies " +
      "radial mirroring for the classic kaleidoscopic look.",
    tags: ["effects", "kaleidoscope", "mirror", "transform", "geometric"],
    complexity: "simple",
    operators: [
      {
        id: "source",
        opType: "noiseTOP",
        label: "Source Pattern",
        purpose: "Generates a procedural noise texture as the kaleidoscope seed",
      },
      {
        id: "transform",
        opType: "transformTOP",
        label: "Rotate & Scale",
        purpose: "Animates rotation and scale to create dynamic kaleidoscope motion",
      },
      {
        id: "kaleido",
        opType: "kaleidoscopeTOP",
        label: "Kaleidoscope",
        purpose: "Applies radial segment mirroring with configurable segment count",
      },
      {
        id: "output",
        opType: "nullTOP",
        label: "OUT",
        purpose: "Final kaleidoscopic output",
      },
    ],
    connections: [
      {
        from: "source",
        to: "transform",
        inputIndex: 0,
        note: "noiseTOP → transformTOP input 0: source pattern enters the transform",
      },
      {
        from: "transform",
        to: "kaleido",
        inputIndex: 0,
        note: "transformTOP → kaleidoscopeTOP input 0: transformed image enters the kaleidoscope",
      },
      {
        from: "kaleido",
        to: "output",
        inputIndex: 0,
        note: "kaleidoscopeTOP → nullTOP input 0: final mirrored output",
      },
    ],
    parameters: [
      {
        opId: "source",
        paramName: "type",
        value: "simplex",
        note: "Simplex noise produces smooth, organic patterns for kaleidoscope",
      },
      {
        opId: "source",
        paramName: "resolution",
        value: [512, 512],
        note: "Square resolution ensures symmetric kaleidoscope segments",
      },
      {
        opId: "transform",
        paramName: "rotate",
        value: 1.5,
        note: "Animated rotation per frame — animate with expression for continuous spin",
      },
      {
        opId: "transform",
        paramName: "scale",
        value: [1.01, 1.01],
        note: "Subtle zoom-in per frame creates hypnotic effect",
      },
      {
        opId: "kaleido",
        paramName: "segments",
        value: 8,
        note: "8 radial segments — powers of two give clean symmetry",
      },
    ],
    pythonBuilder: `# ── kaleidoscope ────────────────────────────────────────────
# Builds: noiseTOP → transformTOP → kaleidoscopeTOP → nullTOP

def build_kaleidoscope(parent):
    parent = op(parent)

    source = parent.create(noiseTOP, 'source')
    source.par.type = 'simplex'
    source.par.resolutionw = 512
    source.par.resolutionh = 512

    transform = parent.create(transformTOP, 'transform')
    transform.inputConnectors[0].connect(source)
    transform.par.rotate.expr = 'absTime.frame * 1.5'
    transform.par.scale1 = 1.01
    transform.par.scale2 = 1.01

    kaleido = parent.create(kaleidoscopeTOP, 'kaleido')
    kaleido.inputConnectors[0].connect(transform)
    kaleido.par.segments = 8

    output = parent.create(nullTOP, 'OUT')
    output.inputConnectors[0].connect(kaleido)

    source.nodeX = -600; source.nodeY = 0
    transform.nodeX = -300; transform.nodeY = 0
    kaleido.nodeX = 0; kaleido.nodeY = 0
    output.nodeX = 300; output.nodeY = 0

    return output

build_kaleidoscope('/project1')
`,
  },

  // ════════════════════════════════════════════════════════════════════════════
  // TEMPLATE 8: edge-detect
  // ════════════════════════════════════════════════════════════════════════════
  {
    name: "edge-detect",
    description:
      "Edge detection with composite blending: source TOP → edgeTOP extracts edges, " +
      "blurTOP softens the edge lines, and compositeTOP blends the softened edges " +
      "(input 1) over the original source (input 0) for an illustrative effect. " +
      "Fan-out: source drives BOTH edgeTOP (input 0) AND compositeTOP (input 0).",
    tags: ["effects", "edge", "detection", "composite", "blur", "sobel"],
    complexity: "medium",
    operators: [
      {
        id: "source",
        opType: "noiseTOP",
        label: "Source",
        purpose: "Input texture for edge detection",
      },
      {
        id: "edge",
        opType: "edgeTOP",
        label: "Edge Detect",
        purpose: "Sobel-based edge detection — outputs a grayscale edge map",
      },
      {
        id: "blur",
        opType: "blurTOP",
        label: "Soften Edges",
        purpose: "Softens the raw edge map so the composite blend looks painterly",
      },
      {
        id: "composite",
        opType: "compositeTOP",
        label: "Edge Blend",
        purpose:
          "Composites softened edges (input 1) additively over original source (input 0)",
      },
      {
        id: "output",
        opType: "nullTOP",
        label: "OUT",
        purpose: "Final edge-enhanced output",
      },
    ],
    connections: [
      {
        from: "source",
        to: "edge",
        inputIndex: 0,
        note: "source → edgeTOP input 0: original image enters edge detection",
      },
      {
        from: "edge",
        to: "blur",
        inputIndex: 0,
        note: "edgeTOP → blurTOP input 0: raw edges get softened",
      },
      {
        from: "source",
        to: "composite",
        inputIndex: 0,
        note:
          "source → compositeTOP input 0: original image as base layer " +
          "(fan-out — source drives TWO consumers)",
      },
      {
        from: "blur",
        to: "composite",
        inputIndex: 1,
        note: "blurTOP → compositeTOP input 1: softened edges overlaid",
      },
      {
        from: "composite",
        to: "output",
        inputIndex: 0,
        note: "compositeTOP → nullTOP input 0: final edge-enhanced result",
      },
    ],
    parameters: [
      {
        opId: "edge",
        paramName: "type",
        value: "sobel",
        note: "Sobel edge detection gives clean, directional edges",
      },
      {
        opId: "edge",
        paramName: "strength",
        value: 0.5,
        note: "50% edge strength — moderate sensitivity",
      },
      {
        opId: "blur",
        paramName: "filtertype",
        value: "gaussian",
        note: "Gaussian blur for even edge softening",
      },
      {
        opId: "blur",
        paramName: "size",
        value: 1,
        note: "1-pixel blur — just enough to soften harsh edges",
      },
      {
        opId: "composite",
        paramName: "operand",
        value: "add",
        note: "Additive blend so edges brighten the source without darkening",
      },
      {
        opId: "composite",
        paramName: "scale2",
        value: 0.5,
        note: "Edges at 50% opacity for a subtle illustrative effect",
      },
    ],
    pythonBuilder: `# ── edge-detect ─────────────────────────────────────────────
# Builds: source → edgeTOP → blurTOP → compositeTOP (blend with original) → nullTOP
# Fan-out: source connects to BOTH edgeTOP(input 0) AND compositeTOP(input 0).

def build_edge_detect(parent):
    parent = op(parent)

    source = parent.create(noiseTOP, 'source')
    source.par.type = 'simplex'
    source.par.resolutionw = 512
    source.par.resolutionh = 512

    edge = parent.create(edgeTOP, 'edge')
    edge.inputConnectors[0].connect(source)
    edge.par.type = 'sobel'
    edge.par.strength = 0.5

    blur = parent.create(blurTOP, 'blur')
    blur.inputConnectors[0].connect(edge)
    blur.par.filtertype = 'gaussian'
    blur.par.size = 1

    composite = parent.create(compositeTOP, 'composite')
    # input 0 = original source, input 1 = softened edges (fan-out from source)
    composite.inputConnectors[0].connect(source)
    composite.inputConnectors[1].connect(blur)
    composite.par.operand = 'add'
    composite.par.scale2 = 0.5

    output = parent.create(nullTOP, 'OUT')
    output.inputConnectors[0].connect(composite)

    source.nodeX = -600; source.nodeY = 0
    edge.nodeX = -600; edge.nodeY = -150
    blur.nodeX = -300; blur.nodeY = -150
    composite.nodeX = 0; composite.nodeY = 0
    output.nodeX = 300; output.nodeY = 0

    return output

build_edge_detect('/project1')
`,
  },
];

// ─── 200+ Natural Language Type Synonyms ────────────────────────────────────

/**
 * TYPE_SYNONYMS maps natural-language words and phrases to canonical
 * TouchDesigner operator types.  Used by resolveOperatorType() to convert
 * conversational prompts into specific operators.
 *
 * Coverage: TOP (textures/images), CHOP (signals/audio), SOP (geometry),
 * DAT (data/tables), POP (particles/GPU), COMP (components), MAT (materials).
 */
export const TYPE_SYNONYMS: Record<string, string[]> = {
  // ── TOP: Texture Operators ────────────────────────────────────────────────
  "videodeviceinTOP": [
    "webcam", "camera", "cam", "live camera", "video input", "capture",
    "webcam feed", "live feed", "camera input", "device input",
    "usb camera", "laptop camera", "built-in camera", "webcam input",
  ],
  "noiseTOP": [
    "noise", "static", "grain", "random texture", "procedural noise",
    "noise texture", "perlin", "simplex", "noise generator",
    "random pattern", "static texture", "grain texture", "tv static",
    "white noise", "noise map", "texture noise",
  ],
  "compositeTOP": [
    "merge", "combine", "mix", "blend", "composite", "layer",
    "overlay", "add together", "multiply", "screen blend",
    "alpha blend", "image blend", "mix images", "layering",
    "compositing", "combine images", "mix textures", "blend layers",
  ],
  "blurTOP": [
    "blur", "smooth", "soften", "gaussian blur", "defocus",
    "soft focus", "blur filter", "smoothing", "soft blur",
    "out of focus", "blurry", "motion blur top", "radial blur",
  ],
  "levelTOP": [
    "level", "brightness", "contrast", "levels", "exposure",
    "gamma", "color correct", "brightness contrast", "black level",
    "white level", "gain adjust", "color adjustment",
  ],
  "transformTOP": [
    "transform", "rotate", "scale", "translate", "move",
    "warp", "skew", "flip", "mirror", "resize",
    "2d transform", "position", "rotation", "scaling", "offset",
  ],
  "feedbackTOP": [
    "feedback", "feedback loop", "video feedback", "temporal feedback",
    "frame accumulation", "feedback top", "accumulation buffer",
    "recursive feedback", "composite feedback",
  ],
  "edgeTOP": [
    "edge detect", "edge detection", "sobel", "find edges",
    "edge filter", "outline", "contour detect", "laplacian",
    "edge map", "edge highlight", "image edges",
  ],
  "chromakeyTOP": [
    "chroma key", "green screen", "blue screen", "keyer",
    "color key", "chromakey", "remove green", "remove blue",
    "key out", "chroma removal", "greenscreen key",
  ],
  "overTOP": [
    "over", "over composite", "alpha over", "front over back",
    "layer over", "place on top", "composite over", "foreground over",
  ],
  "kaleidoscopeTOP": [
    "kaleidoscope", "kaleido", "mirror effect", "radial mirror",
    "kaleidoscopic", "mirror segments", "segment mirror", "radial repeat",
  ],
  "constantTOP": [
    "constant", "solid color", "uniform", "color fill",
    "solid fill", "background color", "flat color", "uniform value",
    "time uniform", "constant value", "solid background",
  ],
  "glslTOP": [
    "glsl", "shader", "fragment shader", "glsl shader",
    "custom shader", "gpu shader", "compute shader top",
    "glsl fragment", "shader effect", "pixel shader",
  ],
  "moviefileinTOP": [
    "movie", "video", "clip", "footage", "film",
    "video file", "movie file", "media file", "mp4",
    "video input", "movie in", "video source", "footage source",
    "import video", "load movie", "play video",
  ],
  "rampTOP": [
    "ramp", "gradient", "color ramp", "gradient fill",
    "background gradient", "gradient background", "gradient ramp",
  ],
  "thresholdTOP": [
    "threshold", "binary", "threshold filter", "cutoff",
    "posterize", "binary image", "black white", "bw filter",
  ],
  "displaceTOP": [
    "displace", "displacement", "warp with map", "displacement map",
    "distort", "offset map", "uv warp", "pixel displace",
  ],
  "lookupTOP": [
    "lookup", "color lookup", "lut", "color grade",
    "lookup table", "color correction", "grade", "color map",
    "palette swap", "color transform",
  ],
  "textTOP": [
    "text", "title", "type", "font", "text overlay",
    "label", "text generator", "typography", "text render",
  ],
  "cropTOP": [
    "crop", "trim", "cut", "region of interest", "roi",
    "crop image", "image crop", "trim edges",
  ],
  "tileTOP": [
    "tile", "repeat", "mosaic", "tile pattern", "tiling",
    "repeat texture", "wrap texture",
  ],
  "resolutionTOP": [
    "resolution", "resize", "output resolution", "change resolution",
    "resample", "downsample", "scale resolution",
  ],
  "nullTOP": [
    "null", "output", "out", "final output", "render output",
    "display output", "end of chain", "terminal node",
  ],

  // ── CHOP: Channel Operators ───────────────────────────────────────────────
  "audiodeviceinCHOP": [
    "mic", "microphone", "audio input", "live audio",
    "sound input", "audio device", "mic input", "microphone input",
    "audio capture", "live mic", "line in", "audio in",
  ],
  "audiofileinCHOP": [
    "audio file", "sound file", "wav", "mp3", "audio clip",
    "music file", "song", "track", "audio source", "load audio",
    "audio playback", "sound", "audio stream", "background music",
  ],
  "audiospectrumCHOP": [
    "spectrum", "fft", "frequency", "spectral", "audio spectrum",
    "frequency analysis", "spectrum analyzer", "frequency bins",
    "fft analysis", "audio fft", "spectral analysis", "fourier",
    "frequency visualization", "audio visualizer",
  ],
  "mathCHOP": [
    "math", "arithmetic", "add", "multiply", "gain",
    "offset", "scale channels", "channel math", "signal math",
    "compute", "calculate", "math operation",
  ],
  "mergeCHOP": [
    "merge chop", "combine channels", "merge channels", "join channels",
    "channel merge", "multi merge",
  ],
  "noiseCHOP": [
    "noise chop", "signal noise", "random signal", "noise signal",
    "chop noise", "noisy signal",
  ],
  "lfoCHOP": [
    "lfo", "oscillator", "low frequency", "wave", "sine wave",
    "sawtooth", "square wave", "triangle wave", "osc",
    "waveform", "periodic", "lfo wave",
  ],
  "constantCHOP": [
    "constant chop", "fixed value", "constant value", "dc offset",
    "dc signal", "static value",
  ],
  "lagCHOP": [
    "lag", "smooth signal", "filter signal", "slew",
    "low pass", "signal smoothing", "damping", "smooth",
    "ease", "interpolate signal",
  ],
  "filterCHOP": [
    "filter", "bandpass", "highpass", "lowpass", "eq",
    "equalizer", "audio filter", "filter chop",
  ],
  "oscCHOP": [
    "oscillator", "tone", "synthesizer", "synth", "wave",
    "audio oscillator", "sound generator", "tone generator",
    "frequency generator",
  ],
  "countCHOP": [
    "count", "counter", "step", "increment", "tick",
    "frame count", "incrementor",
  ],
  "selectCHOP": [
    "select", "choose", "pick", "channel select",
    "select channel", "channel picker",
  ],
  "choptoTOP": [
    "chop to top", "convert to texture", "signal to image",
    "chop to texture", "channel to pixel", "audio to texture",
    "signal visualization", "waveform renderer",
  ],
  "nullCHOP": [
    "null chop", "chop output", "chop terminal", "channel output",
  ],

  // ── SOP: Surface Operators ────────────────────────────────────────────────
  "sphereSOP": [
    "sphere", "ball", "globe", "sphere geometry", "3d sphere",
    "sphere shape", "round shape",
  ],
  "boxSOP": [
    "box", "cube", "rectangular", "box shape", "3d box",
    "cube shape", "cuboid",
  ],
  "gridSOP": [
    "grid", "plane", "flat surface", "terrain",
    "grid surface", "plane geometry", "flat grid",
  ],
  "circleSOP": [
    "circle", "ring", "disc", "2d circle", "circular",
    "round shape sop", "circle geometry",
  ],
  "tubeSOP": [
    "tube", "cylinder", "pipe", "hollow cylinder",
    "cylindrical", "barrel",
  ],
  "torusSOP": [
    "torus", "doughnut", "donut", "ring shape",
    "torus shape", "torus geometry",
  ],
  "textSOP": [
    "text sop", "3d text", "text geometry", "extruded text",
    "3d type", "geometric text",
  ],
  "transformSOP": [
    "transform sop", "move geometry", "rotate sop", "scale sop",
    "translate sop", "3d transform",
  ],
  "noiseSOP": [
    "noise sop", "deform", "displace sop", "warp geometry",
    "deformation", "noise deformation",
  ],
  "mergeSOP": [
    "merge sop", "combine geometry", "join geometry", "sop merge",
  ],
  "nullSOP": [
    "null sop", "sop output", "geometry output", "sop terminal",
  ],

  // ── DAT: Data Operators ───────────────────────────────────────────────────
  "textDAT": [
    "text dat", "text file", "notepad", "snippet",
    "code snippet", "text block", "dat text",
  ],
  "tableDAT": [
    "table", "spreadsheet", "csv", "data table",
    "grid data", "tabular", "excel", "dat table",
    "rows columns", "data grid",
  ],
  "scriptDAT": [
    "script", "python script", "td script", "code",
    "dat script", "script dat", "python dat",
  ],
  "executeDAT": [
    "execute", "run script", "trigger script", "python execute",
    "callback", "event script", "frame script",
  ],
  "selectDAT": [
    "select dat", "query dat", "dat select", "pick dat",
  ],
  "mergeDAT": [
    "merge dat", "join dat", "combine text", "dat merge",
  ],
  "nullDAT": [
    "null dat", "dat output", "text output", "dat terminal",
  ],

  // ── POP: Particle Operators ───────────────────────────────────────────────
  "particlePOP": [
    "particle", "particles", "sim", "simulation",
    "particle system", "particle sim", "pop sim", "pop solver",
    "particle solver", "particle simulation", "point simulation",
    "particle emitter", "particle physics", "particle engine",
    "particle network", "pop network",
  ],
  "spherePOP": [
    "sphere pop", "pop sphere", "particle sphere", "birth sphere",
    "spherical source", "sphere emitter", "sphere birth",
    "round emitter",
  ],
  "gridPOP": [
    "grid pop", "pop grid", "particle grid", "grid emitter",
    "grid source", "flat emitter",
  ],
  "noisePOP": [
    "noise pop", "pop noise", "turbulence", "curl noise",
    "random force", "particle noise", "pop turbulence",
    "noise force", "chaotic force", "random motion",
    "wiggle particles", "jitter particles",
  ],
  "forcePOP": [
    "force", "gravity", "attract", "force pop",
    "gravity force", "attractor", "field force", "pop force",
    "directional force", "wind force", "push force",
  ],
  "dragPOP": [
    "drag", "damping", "air resistance", "friction",
    "slow down", "velocity damping", "drag force",
  ],
  "trailPOP": [
    "trail", "trails", "particle trail", "pop trail",
    "motion trail", "trace", "streak", "afterimage",
    "path trace", "trail geometry",
  ],
  "renderPOP": [
    "render pop", "pop render", "render particles", "pop to top",
    "particle renderer", "point render", "particle image",
  ],
  "glslPOP": [
    "glsl pop", "pop glsl", "gpu particles", "compute shader pop",
    "glsl compute", "gpu pop", "particle shader",
  ],
  "lookupPOP": [
    "lookup pop", "pop lookup", "particle lookup", "uv sample",
    "particle texture", "texture particles",
  ],
  "colorPOP": [
    "color pop", "pop color", "particle color", "point color",
    "color particles", "set particle color",
  ],
  "spritePOP": [
    "sprite", "sprite pop", "billboard", "pop sprite",
    "textured particle", "particle sprite", "sprite particle",
  ],
  "fieldPOP": [
    "field", "field pop", "pop field", "force field",
    "field force", "proximity field", "volume field",
    "spherical field", "box field", "tube field",
  ],
  "transformPOP": [
    "transform pop", "pop transform", "move particles",
    "rotate pop", "scale pop", "particle transform",
  ],
  "attributePOP": [
    "attribute", "pop attribute", "set attribute", "custom attribute",
    "particle attribute", "attribute set",
  ],
  "mergePOP": [
    "merge pop", "pop merge", "combine particles", "join particles",
    "particle merge",
  ],
  "nullPOP": [
    "null pop", "pop terminal", "pop output", "feedback target",
    "pop null", "particle null",
  ],
  "sortPOP": [
    "sort pop", "pop sort", "order particles", "particle sort",
  ],
  "selectPOP": [
    "select pop", "pop select", "filter particles", "particle select",
    "particle filter",
  ],
  "deletePOP": [
    "delete pop", "pop delete", "kill particles", "remove particles",
    "cull particles", "particle death",
  ],
  "limitPOP": [
    "limit", "limit pop", "pop limit", "restrict particles",
    "max particles", "cap particles",
  ],
  "switchPOP": [
    "switch pop", "pop switch", "switch particles", "particle switch",
  ],
  "feedbackPOP": [
    "feedback pop", "pop feedback", "particle feedback", "pop loop",
    "particle loop", "pop solver loop",
  ],
  "neighborPOP": [
    "neighbor", "neighbor pop", "pop neighbor", "proximity",
    "nearby particles", "particle neighbor", "close particles",
    "interaction", "boids", "flocking",
  ],
  "patternPOP": [
    "pattern pop", "pop pattern", "particle pattern", "pop template",
  ],
  "boxPOP": [
    "box pop", "pop box", "box emitter", "cuboid emitter",
  ],
  "circlePOP": [
    "circle pop", "pop circle", "circle emitter", "ring emitter",
  ],
  "tubePOP": [
    "tube pop", "pop tube", "cylinder emitter", "tube emitter",
  ],
  "torusPOP": [
    "torus pop", "pop torus", "donut emitter", "torus emitter",
  ],
  "linePOP": [
    "line pop", "pop line", "line emitter", "edge emitter",
  ],
  "pointPOP": [
    "point pop", "pop point", "single point", "point emitter",
    "single particle",
  ],

  // ── COMP: Component Operators ─────────────────────────────────────────────
  "containerCOMP": [
    "container", "comp", "component", "sub network",
    "group", "folder", "subnet", "subcomponent",
    "network box", "container comp",
  ],
  "baseCOMP": [
    "base", "base comp", "root", "panel", "panel comp",
    "ui container", "component base",
  ],
  "geometryCOMP": [
    "geometry comp", "geo comp", "3d container", "scene container",
    "geometry container", "3d world",
  ],
  "cameraCOMP": [
    "camera", "camera comp", "3d camera", "view camera",
    "render camera", "cam comp",
  ],
  "lightCOMP": [
    "light", "light comp", "light source", "3d light",
    "point light", "spot light", "directional light", "render light",
  ],
  "panelCOMP": [
    "panel", "ui panel", "control panel", "interface",
    "widget panel", "dashboard", "panel comp",
  ],

  // ── MAT: Material Operators ───────────────────────────────────────────────
  "phongMAT": [
    "phong", "material", "shader material", "3d material",
    "phong material", "lighting material", "shiny material",
    "surface material", "material shader",
  ],
  "constantMAT": [
    "constant material", "flat material", "unlit material",
    "solid material", "emissive material",
  ],
  "glslMAT": [
    "glsl material", "custom material", "shader material mat",
    "glsl mat", "custom shader material",
  ],
  "pbrMAT": [
    "pbr", "physically based", "pbr material",
    "physically based rendering", "realistic material",
    "metalness", "roughness material",
  ],
};

// ─── Family Hints ───────────────────────────────────────────────────────────

/**
 * FAMILY_HINTS maps trigger words to TouchDesigner operator families.
 * When a prompt contains these words, getBestFamily() infers which
 * TD family (TOP, CHOP, SOP, DAT, POP, COMP, MAT) is likely intended.
 *
 * Higher-specificity words (e.g., "particle" → POP) take priority over
 * general words (e.g., "compute" → ambiguous).
 */
export interface FamilyHintEntry {
  family: "TOP" | "CHOP" | "SOP" | "DAT" | "POP" | "COMP" | "MAT";
  /** Higher = more specific; used for tie-breaking */
  specificity: number;
  /** Words that suggest this family */
  aliases: string[];
}

export const FAMILY_HINTS: FamilyHintEntry[] = [
  {
    family: "TOP",
    specificity: 10,
    aliases: [
      "TOP", "texture", "image", "video", "post fx", "postfx",
      "blur", "feedback top", "composite", "glsl top", "kaleidoscope",
      "chroma key", "green screen", "glow", "bloom", "edge detect",
      "transform top", "level top", "crop", "tile", "ramp",
      "movie", "footage", "clip", "webcam", "camera",
      "constant top", "noise top", "text top", "null top",
      "render top", "lookup top", "displace", "threshold",
      "resolution top", "mono", "rgb key", "hsv",
    ],
  },
  {
    family: "CHOP",
    specificity: 10,
    aliases: [
      "CHOP", "audio", "sound", "signal", "channel",
      "waveform", "lfo", "oscillator", "frequency", "spectrum",
      "fft", "filter", "mixer", "volume", "mic",
      "microphone", "music", "beat", "audio reactive",
      "sound reactive", "audio analysis", "envelope",
      "audio device", "audio file", "wav", "mp3",
      "lag", "slew", "dc offset", "osc", "count",
      "timer", "speed chop", "merge chop", "math chop",
      "noise chop", "constant chop", "null chop",
      "chop to top", "chop to pop",
    ],
  },
  {
    family: "SOP",
    specificity: 10,
    aliases: [
      "SOP", "geometry", "mesh", "surface", "curve",
      "3d model", "polygon", "vertex", "shape",
      "sphere sop", "box sop", "grid sop", "tube sop",
      "torus sop", "circle sop", "text sop", "transform sop",
      "noise sop", "deform", "extrude", "subdivide",
      "boolean sop", "merge sop", "null sop",
      "sop to pop", "line sop", "point sop",
    ],
  },
  {
    family: "DAT",
    specificity: 10,
    aliases: [
      "DAT", "table", "text dat", "script", "python dat",
      "execute dat", "csv", "spreadsheet", "data table",
      "data grid", "rows columns", "database", "select dat",
      "merge dat", "null dat", "callback", "event script",
      "frame script", "web dat", "json dat", "xml dat",
    ],
  },
  {
    family: "POP",
    specificity: 10,
    aliases: [
      "POP", "particle", "particles", "simulation", "pop sim",
      "pop solver", "particle system", "point simulation",
      "emitter", "birth", "force pop", "noise pop",
      "trail pop", "render pop", "glsl pop", "compute pop",
      "gpu particles", "feedback pop", "sphere pop", "grid pop",
      "sprinkle", "copy pop", "field pop", "attribute pop",
      "sort pop", "select pop", "merge pop", "null pop",
      "boids", "flocking", "neighbor pop", "curl noise pop",
      "color pop", "sprite pop", "drag pop", "turbulence pop",
      "chop to pop", "sop to pop", "top to pop",
    ],
  },
  {
    family: "COMP",
    specificity: 10,
    aliases: [
      "COMP", "container", "component", "sub network",
      "panel", "camera comp", "light comp", "geometry comp",
      "base comp", "3d scene", "layout", "control panel",
      "ui panel", "widget", "dashboard",
    ],
  },
  {
    family: "MAT",
    specificity: 10,
    aliases: [
      "MAT", "material", "shader", "phong", "pbr",
      "constant material", "glsl mat", "lighting material",
      "surface shader", "physically based", "roughness",
      "metalness", "specular", "diffuse", "emissive",
    ],
  },
];

// ─── Fuzzy Resolution Utilities ─────────────────────────────────────────────

/**
 * Normalize a prompt for matching: lowercase, collapse whitespace,
 * strip punctuation.  Preserves word boundaries for alias matching.
 */
function normalizePrompt(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(/[.,!?;:"'()[\]{}\\/\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Count occurrences of a word in a normalized prompt.
 * Matches whole-word boundaries only (e.g., "top" won't match "stop").
 */
function wordCount(normalizedPrompt: string, word: string): number {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`\\b${escaped}\\b`, "gi");
  const matches = normalizedPrompt.match(regex);
  return matches ? matches.length : 0;
}

/**
 * Resolve a natural-language phrase to the best-matching TouchDesigner
 * operator type, using the TYPE_SYNONYMS dictionary.
 *
 * Strategy: score each operator type by how many of its synonyms appear
 * in the prompt.  Multi-word synonyms get a bonus so "green screen"
 * beats a lone "green" match.  Returns the top scoring operator type,
 * or the empty string if nothing matches.
 *
 * @param prompt  Natural-language description (e.g., "add a blur effect to my webcam")
 * @returns  Canonical operator type (e.g., "blurTOP") or "" if no match
 */
export function resolveOperatorType(prompt: string): string {
  const norm = normalizePrompt(prompt);
  if (!norm) return "";

  const scores: Array<{ opType: string; score: number }> = [];

  for (const [opType, aliases] of Object.entries(TYPE_SYNONYMS)) {
    let score = 0;
    for (const alias of aliases) {
      const aliasNorm = alias.toLowerCase();
      const hits = wordCount(norm, aliasNorm);
      if (hits > 0) {
        // Multi-word aliases are more specific → bonus multiplier
        const wordBonus = aliasNorm.includes(" ") ? 3 : 1;
        score += hits * wordBonus;
      }
    }
    if (score > 0) {
      scores.push({ opType, score });
    }
  }

  scores.sort((a, b) => b.score - a.score);

  return scores.length > 0 ? scores[0].opType : "";
}

/**
 * Resolve ALL matching operator types from a prompt, ranked by score.
 * Useful when the prompt mentions multiple effects/operators.
 *
 * @param prompt  Natural-language description
 * @param topN    Maximum number of results (default 5)
 * @returns  Ranked list of operator types with match scores
 */
export function resolveAllOperatorTypes(
  prompt: string,
  topN: number = 5,
): Array<{ opType: string; score: number }> {
  const norm = normalizePrompt(prompt);
  if (!norm) return [];

  const scores: Array<{ opType: string; score: number }> = [];

  for (const [opType, aliases] of Object.entries(TYPE_SYNONYMS)) {
    let score = 0;
    for (const alias of aliases) {
      const aliasNorm = alias.toLowerCase();
      const hits = wordCount(norm, aliasNorm);
      if (hits > 0) {
        const wordBonus = aliasNorm.includes(" ") ? 3 : 1;
        score += hits * wordBonus;
      }
    }
    if (score > 0) {
      scores.push({ opType, score });
    }
  }

  scores.sort((a, b) => b.score - a.score);

  return scores.slice(0, Math.max(1, topN));
}

/**
 * Infer the most likely TouchDesigner operator family from a prompt.
 *
 * Uses FAMILY_HINTS: scores each family by how many of its trigger words
 * appear in the prompt.  Ties are broken by specificity.
 *
 * @param prompt  Natural-language description (e.g., "create a particle system with noise")
 * @returns  Family name ("TOP", "CHOP", "POP", etc.) or "unknown" if nothing matches
 */
export function getBestFamily(prompt: string): string {
  const norm = normalizePrompt(prompt);
  if (!norm) return "unknown";

  const scores: Array<{ family: string; score: number; specificity: number }> = [];

  for (const hint of FAMILY_HINTS) {
    let score = 0;
    for (const alias of hint.aliases) {
      const aliasNorm = alias.toLowerCase();
      const hits = wordCount(norm, aliasNorm);
      if (hits > 0) {
        const wordBonus = aliasNorm.includes(" ") ? 3 : 1;
        score += hits * wordBonus;
      }
    }
    if (score > 0) {
      scores.push({ family: hint.family, score, specificity: hint.specificity });
    }
  }

  if (scores.length === 0) return "unknown";

  // Sort by score desc, then specificity desc (more specific better)
  scores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.specificity - a.specificity;
  });

  return scores[0].family;
}

/**
 * Get all matching families ranked by confidence, not just the top one.
 * Useful for prompts that span multiple domains.
 *
 * @param prompt  Natural-language description
 * @returns  Ranked list of families with match scores
 */
export function getAllFamilies(
  prompt: string,
): Array<{ family: string; score: number; specificity: number }> {
  const norm = normalizePrompt(prompt);
  if (!norm) return [];

  const scores: Array<{ family: string; score: number; specificity: number }> = [];

  for (const hint of FAMILY_HINTS) {
    let score = 0;
    for (const alias of hint.aliases) {
      const aliasNorm = alias.toLowerCase();
      const hits = wordCount(norm, aliasNorm);
      if (hits > 0) {
        const wordBonus = aliasNorm.includes(" ") ? 3 : 1;
        score += hits * wordBonus;
      }
    }
    if (score > 0) {
      scores.push({ family: hint.family, score, specificity: hint.specificity });
    }
  }

  scores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.specificity - a.specificity;
  });

  return scores;
}

// ─── 30 POP Chain Templates (Improvement #3) ─────────────────────────────────

/**
 * Load POP chain templates from the external JSON file.
 * These are 30 verified POP system configurations from the tutorials.
 */
function loadPopChainTemplates(): NetworkTemplate[] {
  try {
    const { resolve } = require("node:path") as typeof import("node:path");
    const fs = require("node:fs") as typeof import("node:fs");
    const candidates = [
      resolve(__dirname ?? ".", "../data/templates/pop-chains.json"),
      resolve(__dirname ?? ".", "../../data/templates/pop-chains.json"),
      resolve(process.cwd(), "data/templates/pop-chains.json"),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
        return (raw.templates || []).map((t: any) => ({
          name: t.name,
          description: t.description,
          tags: t.tags || [],
          complexity: t.complexity || "medium",
          operators: (t.chain || []).map((opType: string, i: number) => ({
            id: `pop_${i}`,
            opType,
            label: opType.replace(/POP$/, ""),
            purpose: `${opType} in POP chain`,
          })),
          connections: (t.connections || []).map((c: any) => ({
            from: `pop_${c.from}`,
            to: `pop_${c.to}`,
            inputIndex: c.input ?? c.inputIndex ?? 0,
            note: `Connection from chain[${c.from}] to chain[${c.to}]`,
          })),
          parameters: Object.entries(t.parameters || {}).flatMap(([opType, pars]: [string, any]) => {
            const idx = (t.chain || []).indexOf(opType);
            if (idx === -1) return [];
            return Object.entries(pars).map(([paramName, value]) => ({
              opId: `pop_${idx}`,
              paramName,
              value,
              note: `${opType}.${paramName}`,
            }));
          }),
          pythonBuilder: `# ── ${t.name} ──\n# Chain: ${(t.chain || []).join(' → ')}\n# ${t.description}\n\ndef build_${t.name.replace(/-/g, '_')}(parent):\n    p = op(parent)\n${(t.chain || []).map((opType: string, i: number) => {
            const pars = (t.parameters || {})[opType] || {};
            const parLines = Object.entries(pars).map(([k, v]) => {
              const pyVal = typeof v === "string" ? `'${v}'` : JSON.stringify(v);
              return `    ${opType.replace(/POP$/, "").toLowerCase()}${i}.par.${k} = ${pyVal}`;
            }).join("\n");
            const createLine = `    ${opType.replace(/POP$/, "").toLowerCase()}${i} = p.create(${opType}, '${opType.replace(/POP$/, "")}${i}')`;
            const connectLine = i > 0 && (t.connections || []).some((c: any) => c.to === i)
              ? `    ${opType.replace(/POP$/, "").toLowerCase()}${i}.inputConnectors[0].connect(${opType.replace(/POP$/, "").toLowerCase()}${(t.connections || []).find((c: any) => c.to === i)?.from ?? i - 1})`
              : "";
            return [createLine, parLines, connectLine].filter(Boolean).join("\n");
          }).join("\n\n")}\n    lastOp = '${(t.chain || [])[t.chain?.length - 1] || "nullPOP"}'.replace(/POP$/, '').toLowerCase() + String((t.chain || []).length - 1)\n    return eval(lastOp)\n\nbuild_${t.name.replace(/-/g, '_')}('/project1')\n`,
        }));
      }
    }
  } catch { /* JSON not found or invalid */ }
  return [];
}

/**
 * All network templates: built-in + POP chain templates.
 */
export const ALL_NETWORK_TEMPLATES: NetworkTemplate[] = [
  ...NETWORK_TEMPLATES,
  ...loadPopChainTemplates(),
];

// ─── Template Lookup ────────────────────────────────────────────────────────

/**
 * Find a network template by name (exact match).
 */
export function getTemplateByName(name: string): NetworkTemplate | undefined {
  return NETWORK_TEMPLATES.find((t) => t.name === name);
}

/**
 * Search templates by tag or description substring.
 * Returns templates ranked by: exact tag match > tag starts-with >
 * description includes > name includes.
 */
export function searchTemplates(query: string): NetworkTemplate[] {
  const q = query.toLowerCase().trim();
  if (!q) return [...NETWORK_TEMPLATES];

  const scored = NETWORK_TEMPLATES.map((t) => {
    let score = 0;
    // Exact tag match
    if (t.tags.some((tag) => tag.toLowerCase() === q)) score += 100;
    // Tag prefix match
    if (t.tags.some((tag) => tag.toLowerCase().startsWith(q))) score += 50;
    // Description includes
    if (t.description.toLowerCase().includes(q)) score += 30;
    // Name includes
    if (t.name.toLowerCase().includes(q)) score += 20;
    // Tag includes
    if (t.tags.some((tag) => tag.toLowerCase().includes(q))) score += 10;
    return { template: t, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.template);
}

/**
 * List all available template names.
 */
export function listTemplateNames(): string[] {
  return NETWORK_TEMPLATES.map((t) => t.name);
}

/**
 * List all unique tags across all templates.
 */
export function listAllTags(): string[] {
  const tagSet = new Set<string>();
  for (const t of NETWORK_TEMPLATES) {
    for (const tag of t.tags) {
      tagSet.add(tag);
    }
  }
  return [...tagSet].sort();
}

// ─── Combined Resolution ────────────────────────────────────────────────────

/**
 * Fully resolve a natural-language prompt: returns the best operator type,
 * best family, and any matching templates.
 *
 * This is the convenience entry point for the MCP server.
 */
export interface PromptResolution {
  /** Original prompt */
  prompt: string;
  /** Best matching operator type (from TYPE_SYNONYMS) */
  operatorType: string;
  /** All matching operator types ranked by score */
  allOperatorTypes: Array<{ opType: string; score: number }>;
  /** Best matching family (from FAMILY_HINTS) */
  family: string;
  /** All matching families ranked by score */
  allFamilies: Array<{ family: string; score: number }>;
  /** Matching network templates */
  matchingTemplates: NetworkTemplate[];
}

export function resolvePrompt(prompt: string): PromptResolution {
  return {
    prompt,
    operatorType: resolveOperatorType(prompt),
    allOperatorTypes: resolveAllOperatorTypes(prompt, 10),
    family: getBestFamily(prompt),
    allFamilies: getAllFamilies(prompt).map((f) => ({
      family: f.family,
      score: f.score,
    })),
    matchingTemplates: searchTemplates(prompt),
  };
}
