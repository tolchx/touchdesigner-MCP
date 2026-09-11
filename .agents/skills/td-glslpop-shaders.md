# TD GLSL POP Shaders — Pattern Library

Reusable GLSL shader patterns for TouchDesigner POP operators. Copy-paste ready.

## When to Use
- User asks for specific GLSL effects (wave, noise, spiral, etc.)
- User needs shader code for glslPOP/glsladvancedPOP
- User asks about GLSL syntax for TouchDesigner

## Shader Patterns — POP Compute (glslPOP / glsladvancedPOP)

### Pattern 1: Sinusoidal Wave Displacement
```glsl
uniform float u_time;
void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    float wave = sin(pos.x * 3.0 + pos.z * 2.0 + u_time * 1.5) * 0.15;
    P[id] = pos + vec3(0.0, wave, 0.0);
}
```

### Pattern 2: Color by Distance
```glsl
// Requires glsladvancedPOP (writes to Cd)
uniform float u_time;
void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    float d = length(pos);
    P[id] = pos;
    Cd[id] = vec4(sin(d*2.0+u_time)*0.5+0.5, cos(d*1.5)*0.5+0.5, 1.0-d*0.3, 1.0);
}
```

### Pattern 3: Spiral Vortex
```glsl
uniform float u_time;
void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    float angle = atan(pos.z, pos.x) + u_time * 0.8;
    float rad = length(pos.xz);
    pos.x = cos(angle) * rad;
    pos.z = sin(angle) * rad;
    pos.y += sin(rad * 4.0 - u_time * 3.0) * 0.15;
    P[id] = pos;
}
```

### Pattern 4: Noise Turbulence (3-octave)
```glsl
uniform float u_time;
void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    float n1 = TDSimplexNoise(vec4(pos * 2.0, u_time * 0.5));
    float n2 = TDSimplexNoise(vec4(pos * 4.0 + 100.0, u_time * 0.3));
    float n3 = TDSimplexNoise(vec4(pos * 8.0 + 200.0, u_time * 0.2));
    P[id] = pos + vec3(n1, n2, n3) * 0.2;
}
```

### Pattern 5: Fractal Brownian Motion (6-octave)
```glsl
float fbm(vec3 p) {
    float f = 0.0, amp = 0.5;
    for (int i = 0; i < 6; i++) {
        f += amp * TDSimplexNoise(vec4(p, 0.0));
        p *= 2.1; amp *= 0.5;
    }
    return f;
}
void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    P[id] = pos + vec3(0.0, fbm(pos * 1.5) * 0.6, 0.0);
}
```

### Pattern 6: Curl Noise (Divergence-Free Flow)
```glsl
uniform float u_time;
vec3 curlNoise(vec3 p) {
    float e = 0.1;
    vec3 curl;
    float n1, n2;
    n1 = TDSimplexNoise(vec4(p+vec3(0,e,0), u_time*0.3));
    n2 = TDSimplexNoise(vec4(p-vec3(0,e,0), u_time*0.3));
    float a = (n1-n2)/(2.0*e);
    n1 = TDSimplexNoise(vec4(p+vec3(0,0,e), u_time*0.3));
    n2 = TDSimplexNoise(vec4(p-vec3(0,0,e), u_time*0.3));
    curl.x = a - (n1-n2)/(2.0*e);
    // ... (complete curl computation for y and z)
    return curl;
}
void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    P[id] = pos + curlNoise(pos * 1.5) * 0.15;
}
```

### Pattern 7: Voronoi Displacement
```glsl
uniform float u_time;
vec2 hash2(vec2 p) {
    p = vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)));
    return -1.0 + 2.0*fract(sin(p)*43758.5453123);
}
float voronoi(vec2 p) {
    vec2 n = floor(p), f = fract(p);
    float md = 8.0;
    for (int j=-1; j<=1; j++) for (int i=-1; i<=1; i++) {
        vec2 g = vec2(float(i),float(j));
        vec2 o = 0.5+0.5*sin(u_time*0.5+6.2831*hash2(n+g));
        md = min(md, dot(g+o-f, g+o-f));
    }
    return md;
}
void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    P[id] = pos + vec3(0.0, voronoi(pos.xz*2.0)*0.5-0.25, 0.0);
}
```

### Pattern 8: Lorenz Attractor
```glsl
uniform float u_time;
void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    vec3 lorenz = pos * 5.0;
    float sigma=10.0, rho=28.0, beta=8.0/3.0, dt=0.005;
    float dx = sigma*(lorenz.y-lorenz.x);
    float dy = lorenz.x*(rho-lorenz.z)-lorenz.y;
    float dz = lorenz.x*lorenz.y-beta*lorenz.z;
    vec3 target = lorenz + vec3(dx,dy,dz)*dt;
    P[id] = mix(lorenz, target, 0.3) / 5.0;
}
```

### Pattern 9: Phyllotaxis Spiral
```glsl
uniform float u_time;
void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    float n = float(id);
    float phi = n * 2.39996323 + u_time * 0.5; // golden angle
    float r = sqrt(n) * 0.08;
    vec3 target = vec3(cos(phi)*r, sin(phi)*r, 0.0);
    P[id] = mix(pos, target * (1.0+sin(u_time*0.3)*0.3), 0.15);
}
```

### Pattern 10: Quaternion Rotation
```glsl
uniform float u_time;
vec3 rotateAxis(vec3 p, vec3 axis, float angle) {
    float c=cos(angle), s=sin(angle);
    return p*c + cross(axis,p)*s + axis*dot(axis,p)*(1.0-c);
}
void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    vec3 axis = normalize(vec3(sin(u_time*0.3), cos(u_time*0.5), sin(u_time*0.7)));
    P[id] = rotateAxis(pos, axis, u_time*0.8);
}
```

## Shader Patterns — TOP Pixel (glslTOP)

### Pattern 11: Box Blur
```glsl
out vec4 fragColor;
void main() {
    vec2 texel = 1.0 / uTDOutputInfo.res;
    vec4 sum = vec4(0.0);
    for (int x=-1; x<=1; x++) for (int y=-1; y<=1; y++) {
        sum += texture(sTD2DInputs[0], vUV.st + vec2(float(x),float(y))*texel);
    }
    fragColor = TDOutputSwizzle(sum / 9.0);
}
```

### Pattern 12: Edge Detect (Sobel)
```glsl
out vec4 fragColor;
void main() {
    vec2 texel = 1.0 / uTDOutputInfo.res;
    vec2 uv = vUV.st;
    vec4 tl=texture(sTD2DInputs[0],uv+vec2(-texel.x,-texel.y));
    vec4 tr=texture(sTD2DInputs[0],uv+vec2(texel.x,-texel.y));
    vec4 bl=texture(sTD2DInputs[0],uv+vec2(-texel.x,texel.y));
    vec4 br=texture(sTD2DInputs[0],uv+vec2(texel.x,texel.y));
    vec3 sx = -tl.rgb-tr.rgb-bl.rgb*2.0+tr.rgb+br.rgb*2.0+br.rgb;
    vec3 sy = -tl.rgb-tl.rgb*2.0-tr.rgb+bl.rgb*2.0+br.rgb+br.rgb;
    float edge = length(sx)+length(sy);
    fragColor = TDOutputSwizzle(vec4(vec3(edge),1.0));
}
```

## Multi-Pass Pattern (uTDPass)
```glsl
out vec4 fragColor;
void main() {
    vec4 color = texture(sTD2DInputs[0], vUV.st);
    if (uTDPass == 0) {
        // Pass 0: edge detect
    } else if (uTDPass == 1) {
        // Pass 1: blur
    } else {
        // Pass 2: composite
    }
    fragColor = TDOutputSwizzle(color);
}
```

## TD Built-in Functions
- `TDIndex()` — current thread/point ID
- `TDNumElements()` — total point count
- `TDIn_P(0, id)` — read position from input 0
- `TDSimplexNoise(vec4(pos, time))` — 3D+time simplex noise
- `TDOutputSwizzle(vec4)` — correct output swizzle for glslTOP
- `uTDPass` — current pass index (glslTOP multi-pass)
- `uTDOutputInfo.res` — output resolution (glslTOP)
- `sTD2DInputs[0]` — input texture (glslTOP)
