---
name: "tdsw-pop-techniques"
description: "Reference architecture for TouchDesigner POPs (Point Operators) particle systems based on 20250823_TDSW project. Invoke when user wants to create POP-based effects like TOP-to-POP conversion, fields, custom attributes, or GPU particle networks."
---

# TDSW POPs Techniques Reference

This skill provides architectural guidance for building GPU-native Point Operator (POP) networks in TouchDesigner based on the `20250823_TDSW` showcase project.

## Key Concepts and Workflows

When the user asks to implement POP effects, use these established patterns:

### 1. Basic POP Operations
- **SOP to POP / Geometry Conversion:** Use nodes like `pointgen`, `sprinkle`, or standard primitive conversions to get geometry into the POP context.
- **Attributes (`POP:attribute`):** Unlike SOPs, POPs rely heavily on custom math. Create attributes like `pointscale` (float), `Rot` (vector `dir`), or `LineWidth`. 
- **Math & Noise (`POP:math`, `POP:noise`):** Chain these nodes and point them to specific attributes (e.g. configuring `noise` to only affect the `_P` position, `_Color`, or `LineWidth` attributes).

### 2. TOP to POP Conversion
- Use `POP:topto` to read texture pixel data (`res`) and convert it to points.
- Map the RGBA data to position (`P`) or custom attributes (like rotations).
- Follow up with `POP:copy` where input 0 is the base geometry (e.g., `rectangle1`) and input 1 is the template point cloud with the custom attributes (`attribute_Rot`).

### 3. Fields (`POP:field`)
Fields are used to create volumes of influence (e.g. spherical fields, scale fields, color fields).
- **Setup:** Route your points through a `POP:field`.
- **Application:** Use the field to blend, delete, or scale points. For example, a `mathmix` or `lookuptex` can use the field's intensity (0 to 1) to interpolate colors or drive a `noise_PointScale`.

### 4. GPU Particle Solvers (`POP:particle`)
- Native POP particle generation allows massive GPU point clouds.
- **Emit:** Feed a `sprinkle` node into `POP:particle`.
- **Feedback/Update Loop:** Particles update themselves via a state node. In the `.parm` of the particle generator, set `particlesupdatepop` to point to the end of your solver chain (e.g., `Particle_End`).
- Insert forces, math, and constraints between the generator and the `Particle_End` node.

## Best Practices
- Keep operations entirely in the POP domain to avoid GPU/CPU bottlenecks.
- Use `POP:copy` instead of traditional COMP instancing when subsequent POP deformation is needed on the copied geometry.
- For conditional logic, use `POP:delete` or math limits (`POP:limit`) rather than evaluating points individually.

**Note:** You can read the specific node connections in `c:/Users/Tolch/Documents/AI_Code/Touchdesigner_MCP/claude-touchdesigner/Toe_Expand/20250823_TDSW/POPs_Logic.md` for further details.