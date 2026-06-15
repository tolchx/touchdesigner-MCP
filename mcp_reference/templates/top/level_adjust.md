# Level Adjust
## Operators needed
- type: movieinTOP → name: source1
- type: levelTOP → name: level1
## Connections
- source1 out → level1 in
## Parameters
- level1.pre = { "r": 0.0, "g": 0.0, "b": 0.0, "a": 0.0 }
- level1.post = { "r": 1.0, "g": 1.0, "b": 1.0, "a": 1.0 }
- level1.gamma = { "r": 1.0, "g": 1.0, "b": 1.0, "a": 1.0 }
## Description
Adjusts color levels (pre/post/gamma) of an input source. Essential for color grading and contrast correction.
