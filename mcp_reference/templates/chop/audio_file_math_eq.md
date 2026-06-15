# Audio File → Math → BandEQ
## Operators needed
- type: audiofileinCHOP → name: audio1
- type: mathCHOP → name: math1
- type: bandeqCHOP → name: eq1
## Connections
- audio1 out → math1 in
- math1 out → eq1 in
## Parameters
- audio1.file = "path/to/audio.wav"
- math1.op = multiply
- math1.val0 = 1.0
- eq1.band0freq = 100
- eq1.band1freq = 1000
## Description
Loads an audio file, applies math gain, and splits into frequency bands. Core audio analysis pipeline.
