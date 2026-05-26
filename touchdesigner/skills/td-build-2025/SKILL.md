---
name: td-build-2025
description: "Use when working with TouchDesigner build 2025.32820+ (May 2026). Documents new operators: Trace POP, Triangulate POP, Layer Mix TOP, Render Simple TOP, NVIDIA RTX Video, DMX POPs, color management overhaul, and unified pattern matching."
version: 1.0.0
author: Tolch
license: MIT
metadata:
  hermes:
    tags: [touchdesigner, build-2025, new-operators, pops, tops]
    related_skills: [td-core-discipline, td-pops-advanced]
---

# TD Build 2025.32820 — What's New

Updated for TD build 2025.32820 (May 2026). When the user is on this build (check via `td_execute` with `op.host.buildex`), prefer the newer operators over older workarounds.

## New POPs — Tracing, Triangulation & I/O

### Trace POP
Replaces the 2D-input mode of **Polygonize POP**. If the user feeds a 2D TOP into Polygonize POP, switch to Trace POP instead. Polygonize POP is now 3D-only.

**Input**: 2D TOP (grayscale/silhouette)
**Output**: Contour lines as POP points/prims
**Typical chain**: `TOP → Trace POP → Triangulate POP → SOP (Polyreduce)`

### Triangulate POP
Turns closed line strips (e.g. from Trace POP) into solid triangles.
- **Convex mode**: fast, simple shapes
- **Concave mode**: handles complex silhouettes (slower)

### Alembic Out POP / File Out POP / Point File In POP
Full POP-side import/export pipeline:
- `alembicOutPOP`: export POP data to Alembic
- `fileOutPOP`: write POP data to disk (various formats)
- `pointFileInPOP`: load point data from file

### DMX Fixture POP + DMX Out POP
Paired with **Pan Tilt CHOP** and **DMX Map DAT**, this is the new lighting/rig workflow.
- **DMX Fixture POP**: each input point becomes one fixture instance
- **DMX Out POP**: sends Art-Net / sACN / KiNET / FTDI
- **Pan Tilt CHOP**: converts direction vectors to pan/tilt angles

**Typical chain**: `POP geometry → DMX Fixture POP → DMX Out POP → [network]`

## New TOPs — Compositing & Rendering

### Layer Mix TOP
Replaces stacks of Composite TOPs. Per-layer blend mode, opacity, and adjustments.
- Add/remove/reorder layers without rewiring
- Each layer has independent blend mode + opacity
- Faster than 10 stacked Composite TOPs

### Render Simple TOP
Render geometry without a Camera or Light COMP.
- Uses automatic camera placement
- Good for quick previews / thumbnails
- Switch to `renderTOP` when you need camera control, lights, or quality settings

### NVIDIA RTX Video TOP
AI super-resolution + SDR-to-HDR upconversion.
- Requires RTX GPU + NVIDIA SDK
- Great for upscaling low-res video sources in real-time

### ST2110 In/Out TOP + ST2110 Device CHOP
Broadcast media-over-IP (SMPTE ST 2110 standard).
- Professional broadcast infrastructure
- Requires 10GbE network

### ZED Select TOP
Picks a specific stream from the central **ZED TOP**. The ZED workflow is restructured: all ZED ops now reference one ZED TOP, not standalone.

## Render TOP Additions (TD 2025.32820)
- **`renderpulse`**: render once on demand (single-frame)
- **`bgcolor`**: background color — no Constant TOP needed behind
- **UV Unwrap POP input**: accepts UV Unwrap POP for texture mapping

## 3D Textures & 2D Arrays
Most TOPs (Constant, Noise, Blur, Composite, Edge, Displace, Feedback, ~35 more) now natively output to **3D textures and 2D arrays**. Pick the texture type directly in the operator's parameters.

## Movie File In/Out TOP Updates

### Movie File In TOP
- **Negative index**: count from end of play list
- **Pre-download**: for remote files
- **.ktx (KTX2) format**: GPU texture format

### Movie File Out TOP
- **VVC** (Versatile Video Coding)
- **AV1** codec
- **AAC/Opus** audio codecs
- **Exif/stereo/spherical metadata** support

## Noise TOP — 4D Derivatives
Simplex/Perlin **4D with derivatives** — read the gradient directly instead of finite-differencing downstream.
Use `gradient=True` on the Output page.

## CHOP Additions
- `clockCHOP`: countdown mode
- `lagCHOP`: snap parameter
- `triggerCHOP` / `delayCHOP`: reset pulses
- `audioRenderCHOP`: simulation mode (absorption/transmission)
- `countCHOP`: up/down + multi-channel increment

## COMP Additions
- `windowCOMP`: output color space + "prevent display sleep" toggle
- `textCOMP`: colored emoji glyphs, placeholder text, drop shadows
- `geotextCOMP`: Face Camera + FOV-independent depth scaling
- `buttonCOMP`: text scaling/padding

## Color Management (TD 2025.32820)
Preferences > Color tab is the new home. Working color space options:
- sRGB Linear
- ACEScg
- DCI-P3 Linear
- Rec. 2020 Linear
- ACES 2065-1

Window pixel format:
- SDR 8-bit / 10-bit
- HDR 10-bit
- HDR 16-bit Float

**Always confirm with the user** before changing project color settings — it cascades through every TOP.

## Pattern Matching Unified
New bracket-based syntax:
- **Range**: `[0-10:2]` (start, end, step)
- **Sets**: `[0, 3, 7]`
- **Notation**: `[0-15:2:4]` ("take" — start:end:step:count)
- **Boolean**: `&` `|` `~` for set operations

Older `*` patterns still work; new code should use brackets.

## Python Additions
- `AbsTime.timecode` — SMPTE timecode string
- `SequenceBlock.summary` — block metadata
- `TOP.cudaMemory(pixelFormat=...)` — CUDA interop
- POP `point() / prim() / vert(delayed=True)` — non-blocking single-point reads

## Build-Aware Behavior
When planning a patch, check the build first:
```python
build = op.host.buildex
if build >= 2025.32820:
    # Use new operators
```

## Verification Checklist
- [ ] Check `op.host.buildex` before using build-specific operators
- [ ] Replace old Polygonize POP (2D mode) with Trace POP on build 2025.32820+
- [ ] Use Layer Mix TOP instead of Composite TOP stacks
- [ ] Use Render Simple TOP for quick previews (no camera needed)
- [ ] Set `gradient=True` on Noise TOP for derivative output
- [ ] Use bracket syntax for new pattern matching
- [ ] Confirm with user before changing color management settings
