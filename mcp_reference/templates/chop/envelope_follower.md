# Envelope Follower
## Operators needed
- type: audioinCHOP → name: audio1
- type: envelopeCHOP → name: env1
## Connections
- audio1 out → env1 in
## Parameters
- env1.attack = 10
- env1.release = 100
## Description
Extracts amplitude envelope from audio input. Great for driving parameter changes in response to audio dynamics.
