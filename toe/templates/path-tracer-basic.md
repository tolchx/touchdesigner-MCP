# Path Tracer Basic

## Pattern: Monte Carlo Path Tracing in POPs

## Operators
- Sphere POP (scene geometry)
- GLSL POP (ray generation from camera)
- GLSL POP (ray-sphere intersection)
- GLSL POP (shading + bounce)
- Feedback POP (accumulation buffer)
- Attribute POP (color accumulation)
- Render POP → Point MAT

## Pipeline
```
Camera → Ray Generate → Intersection → Shading → Accumulation → Render
                                              ↑
                                        Feedback (N bounces)
```

## Parameters
- Camera: position (0, 0, -5), lookAt (0, 0, 0)
- Max Bounces: 4
- Samples per frame: 16
- Accumulation frames: 100
- Scene: 3 spheres (diffuse, specular, emissive)

## GLSL Ray Generation
```glsl
uniform vec3 uCamPos, uCamLookAt, uCamUp;
uniform float uFov;

void main() {
    int id = gl_VertexID;
    vec3 pos = TDIn_P(id);

    // Generate ray direction from camera
    vec3 forward = normalize(uCamLookAt - uCamPos);
    vec3 right = normalize(cross(forward, uCamUp));
    vec3 up = cross(right, forward);

    float aspect = 16.0/9.0;
    float fovScale = tan(radians(uFov * 0.5));

    vec2 uv = vec2(
        (float(id % 1920) / 1920.0 - 0.5) * aspect,
        (float(id / 1920) / 1080.0 - 0.5)
    );

    vec3 dir = normalize(forward + uv.x * fovScale * right + uv.y * fovScale * up);

    // Store ray in attributes
    rayOriginAttr[id] = uCamPos;
    rayDirAttr[id] = dir;
    rayColorAttr[id] = vec3(1.0); // throughput
}
```

## GLSL Intersection + Shading
```glsl
uniform vec3 uSphereCenter;
uniform float uSphereRadius;
uniform vec3 uSphereColor;

void main() {
    int id = gl_VertexID;
    vec3 origin = rayOriginAttr[id];
    vec3 dir = rayDirAttr[id];

    // Ray-sphere intersection
    vec3 oc = origin - uSphereCenter;
    float b = 2.0 * dot(oc, dir);
    float c = dot(oc, oc) - uSphereRadius * uSphereRadius;
    float disc = b * b - 4.0 * c;

    vec3 color = rayColorAttr[id];

    if (disc > 0.0) {
        float t = (-b - sqrt(disc)) * 0.5;
        if (t > 0.001) {
            vec3 hitPoint = origin + dir * t;
            vec3 normal = normalize(hitPoint - uSphereCenter);

            // Diffuse shading
            float NdotL = max(dot(normal, normalize(vec3(1,1,1))), 0.0);
            color *= uSphereColor * NdotL;

            // Random bounce for path tracing
            vec3 newDir = randomHemisphere(normal, float(id) + absTime.x);
            rayOriginAttr[id] = hitPoint + normal * 0.001;
            rayDirAttr[id] = newDir;
            rayColorAttr[id] = color * 0.5; // Russian roulette
        }
    }

    Cd[id] = vec4(color, 1.0);
}
```

## Notes
- Progressive accumulation via Feedback POP (blend=1/N for N frames)
- Epsilon (0.001) prevents self-intersection
- Russian roulette terminates low-throughput rays
- Scene geometry via Sphere POP or SOP to POP
