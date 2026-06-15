# Explosion
## Operators needed
- type: sourcePOP → name: src1
- type: constantPOP → name: force1
- type: limitPOP → name: limit1
## Connections
- src1 out → force1 in
- force1 out → limit1 in
## Parameters
- src1.type = point
- src1.rate = 500
- src1.velocity = { "x": 0.0, "y": 0.0, "z": 0.0 }
- src1.spread = 1.0
- force1.accel = { "x": 0.0, "y": -0.5, "z": 0.0 }
- limit1.life = 2.0
## Description
Burst of particles with radial spread and gravity. Simulates explosions, confetti bursts, and dissipating effects.
