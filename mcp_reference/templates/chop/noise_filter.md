# Noise CHOP → Filter
## Operators needed
- type: noiseCHOP → name: noise1
- type: filterCHOP → name: filter1
## Connections
- noise1 out → filter1 in
## Parameters
- noise1.amp = 0.5
- filter1.type = lowpass
- filter1.cutoff = 0.1
## Description
Generates noise and applies a low-pass filter. Useful for smooth random modulation signals.
