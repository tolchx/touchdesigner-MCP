# Feedback Loop
## Operators needed
- type: noiseTOP → name: noise1
- type: feedbackTOP → name: feedback1
- type: compositeTOP → name: comp1
## Connections
- noise1 out → feedback1 in
- feedback1 out → comp1 in
- comp1 out → feedback1 feedback
## Parameters
- noise1.amp = 0.3
- feedback1.accum = 0.95
- feedback1.delay = 0.1
- comp1.operation = add
## Description
Creates a self-feeding feedback loop with noise as seed. Produces evolving organic patterns that change over time.
