# Complex System Patterns for MCP

## 1. Flocking/Boids System

**Chain:** Sphere POP → Random POP → Noise POP → Particle POP → Render POP

**Key Parameters:**
- Sphere POP: rate=500, radius=2
- Noise POP: amplitude=0.5, frequency=0.3, type=curl
- Particle POP: life=5, drag=0.1, gravity=0

**GLSL Pattern (Boids Forces):**
```glsl
// Neighbor detection + cohesion/alignment/separation
vec3 cohesion = vec3(0), alignment = vec3(0), separation = vec3(0);
for (int i = 0; i < numPoints; i++) {
    if (i == id) continue;
    float dist = distance(pos, TDIn_P(i));
    if (dist < neighborhoodRadius) {
        cohesion += TDIn_P(i);
        alignment += TDIn_Vel(i);
        if (dist < separationRadius)
            separation -= normalize(TDIn_P(i) - pos) / dist;
    }
}
```

## 2. Fluid Dynamics (Curl Noise)

**Chain:** Grid POP → Noise POP (curl) → Particle POP → Trail POP → Render POP

**Key Parameters:**
- Grid POP: rows=50, cols=50, size=10
- Noise POP: type=curl, amplitude=1.0, frequency=0.2, speed=0.5
- Particle POP: life=3, drag=0.05
- Trail POP: length=10

## 3. Fractal L-System

**Chain:** Table DAT (rules) → Script DAT → SOP to POP → Copy POP → Noise POP → Render POP

**Pattern:**
- Store L-system rules in Table DAT
- Script DAT generates geometry from rules
- SOP to POP converts to point cloud
- Copy POP instances geometry at each point

## 4. Audio-Reactive System

**Chain:** Audio CHOP → Math CHOP → CHOP to POP → Noise POP (amplitude driven) → Particle POP → Render POP

**Key Parameters:**
- Audio CHOP: channels=all
- Math CHOP: range=0-1, filter=sigma=2
- Noise POP: amplitude driven by CHOP channel

## 5. Interactive Camera System

**Chain:** Movie File In TOP → TOP to POP → Attribute POP (Cd from brightness) → Noise POP → Particle POP → Render POP → Point MAT

**Pattern:**
- Camera captures video frames
- TOP to POP converts pixels to points
- Brightness drives particle color/size
- Noise adds organic movement

## 6. Feedback Loop System

**Chain:** Feedback POP → Noise POP → Particle POP → Feedback POP (blend=0.95)

**Key:** Feedback POP creates frame-to-frame persistence. Blend < 1.0 ensures decay.

## 7. Multi-Camera Render

**Chain:**
```
Cam1 → Geo1 → Render1 → TOP1 ─┐
Cam2 → Geo2 → Render2 → TOP2 ─┼→ Composite TOP → Output
Cam3 → Geo3 → Render3 → TOP3 ─┘
```

## 8. Data Visualization

**Chain:** DAT (data source) → CHOP (signal extraction) → POP (visual mapping) → Render TOP

**Pattern:**
- Table DAT or Select DAT reads data
- CHOP converts to channels
- POP maps channels to visual attributes

## 9. Projection Mapping

**Chain:** Scene POP → Render TOP → Perform COMP → NDI/TOP Output

**Pattern:**
- Multiple geometry sources
- Render to separate TOPs
- Perform COMP handles windowing

## 10. Multi-Layer Particle System

**Chain:**
```
Layer 1: Sphere POP1 → Noise1 → Particle1 → Merge ←┐
Layer 2: Grid POP2 → Random2 → Particle2 → Merge   │
Layer 3: Box POP3 → Noise3 → Particle3 → Merge     ─┤
                                          ↓          │
                                      Render POP ←───┘
```

## Node Connection Rules (Critical)

1. POP → POP: Direct connection valid
2. TOP → POP: Requires TOP to POP bridge
3. SOP → POP: Requires SOP to POP bridge
4. CHOP → POP: Requires CHOP to POP bridge
5. POP → TOP: Requires POP to TOP bridge
6. COMP → POP: Use inPOP/outPOP inside COMP
7. POP and SOP: NEVER connect directly
8. Render POP needs Camera in Geometry COMP

## Parameter Quick Reference

| System | Key Params |
|--------|------------|
| Particles | rate, life, drag, gravity |
| Noise | amplitude, frequency, speed, type |
| Feedback | blend, target |
| Trail | length, method |
| Copy | target, numinstance |
| Render | camera, material |
| Attribute | attribute, value, operation |
| Delete | operation, expression |
