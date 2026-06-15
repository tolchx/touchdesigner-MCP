# MovieIn → Glitch
## Operators needed
- type: movieinTOP → name: movie1
- type: levelTOP → name: level1
- type: displaceTOP → name: disp1
## Connections
- movie1 out → level1 in
- level1 out → disp1 in
## Parameters
- movie1.file = "path/to/video.mp4"
- level1.post = { "r": 0.9, "g": 0.5, "b": 1.2, "a": 1.0 }
- disp1.amp = 0.03
## Description
Processes a video through color channel manipulation and displacement for glitch aesthetics.
