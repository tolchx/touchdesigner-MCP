import json

R = "/project1/glsl_test_1"

# Set shader code
code = op(R + "/shader_code")
code.text = """uniform float u_time;

float fbm(vec3 p) {
    float value = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for(int i = 0; i < 4; i++) {
        value += amp * TDSimplexNoise(p * freq);
        freq *= 2.0;
        amp *= 0.5;
    }
    return value;
}

void main() {
    const uint id = TDIndex();
    if(id >= TDNumElements()) return;

    vec3 p = TDIn_P(0, id);

    // Multi-octave noise displacement (FBM)
    float noise1 = TDSimplexNoise(vec4(p * 0.4, u_time * 0.2));
    float noise2 = TDSimplexNoise(vec4(p * 0.8 + 100.0, u_time * 0.35));
    float noise3 = TDSimplexNoise(vec4(p * 1.6 + 200.0, u_time * 0.5));
    float noise4 = TDSimplexNoise(vec4(p * 3.2 + 300.0, u_time * 0.65));
    float displacement = noise1 * 0.3 + noise2 * 0.15 + noise3 * 0.075 + noise4 * 0.037;

    // Vortex twist around Y axis based on height + time
    float heightAngle = p.y * 1.5 + fbm(p * 0.3) + u_time * 0.4;
    float c = cos(heightAngle);
    float s = sin(heightAngle);
    vec3 twisted;
    twisted.x = p.x * c - p.z * s;
    twisted.y = p.y + displacement * 0.3;
    twisted.z = p.x * s + p.z * c;

    // Ripple detail
    float ripple = sin(p.x * 4.0 + p.z * 3.0 + u_time * 2.0) * 0.04;

    // Final: twist + displacement along normal
    vec3 dir = normalize(p + 0.001);
    vec3 result = twisted + dir * (displacement * 0.6 + ripple);

    P[id] = result;
}"""
print("Shader code set, length:", len(code.text))

# Configure GLSL POP
glsl = op(R + "/glsl_vortex")
glsl.par.computedat = "shader_code"
glsl.par.outputattrs = "P"
glsl.par.numelems = 500
print("Params set: computedat=", glsl.par.computedat.eval(), ", outputattrs=", glsl.par.outputattrs.eval(), ", numelems=", glsl.par.numelems.eval())

# Configure circlePOP source
src = op(R + "/src_circle")
src.par.radius = 0.8
print("Source params set")

# Connect src -> GLSL
src.outputConnectors[0].connect(glsl)
print("Connection made")
