# MIDI In → CHOP
## Operators needed
- type: midiinCHOP → name: midi1
- type: nullCHOP → name: null1
## Connections
- midi1 out → null1 in
## Parameters
- midi1.port = 0
## Description
Receives MIDI input and routes to a null for monitoring. Foundation for MIDI-controlled parameter modulation.
