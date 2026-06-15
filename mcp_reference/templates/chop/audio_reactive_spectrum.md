# Audio Reactive (Spectrum)
## Operators needed
- type: audioinCHOP → name: audio1
- type: spectrumCHOP → name: spec1
- type: mathCHOP → name: math1
## Connections
- audio1 out → spec1 in
- spec1 out → math1 in
## Parameters
- spec1.length = 1024
- math1.op = add
- math1.val0 = 0.1
## Description
Captures live audio, computes spectrum, and applies math. Foundation for audio-reactive visual effects.
