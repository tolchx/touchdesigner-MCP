# Fountain Particles
## Operators needed
- type: sourcePOP → name: fountain1
- type: constantPOP → name: const1
## Connections
- fountain1 out → const1 in
## Parameters
- fountain1.type = point
- fountain1.rate = 100
- fountain1.velocity = { "x": 0.0, "y": 1.0, "z": 0.0 }
- fountain1.spread = 0.3
- const1.life = 3.0
## Description
Creates a particle fountain with constant force. Basic particle system for sprays, fire, and magic effects.
