# Feedback CHOP
## Operators needed
- type: noiseCHOP → name: noise1
- type: lagCHOP → name: lag1
## Connections
- noise1 out → lag1 in
- lag1 out → (loop back to lag1 in via feedback)
## Parameters
- noise1.amp = 0.1
- lag1.filter = 0.95
## Description
Feeds a signal through a lag with accumulation for feedback-style effects. Creates decaying echoes and trails.
