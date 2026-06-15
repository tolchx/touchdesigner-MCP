# MovieIn → Color Grade
## Operators needed
- type: movieinTOP → name: movie1
- type: levelTOP → name: grade1
- type: blurTOP → name: blur1
## Connections
- movie1 out → grade1 in
- grade1 out → blur1 in
## Parameters
- movie1.file = "path/to/video.mp4"
- grade1.pre = { "r": 0.0, "g": 0.0, "b": 0.0, "a": 0.0 }
- grade1.post = { "r": 1.1, "g": 0.9, "b": 0.8, "a": 1.0 }
- blur1.radius = 0
## Description
Plays a video file through color grading and optional blur. Standard pipeline for cinematic video processing.
