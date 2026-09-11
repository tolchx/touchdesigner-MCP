// Vertex: Pixel passthrough shader (glslTOP pixeldat)
// Variable: PS_PASSTHROUGH
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// Pixel shader: passthrough (used with all vertex shaders)
out vec4 fragColor;
void main() {
    fragColor = TDOutputSwizzle(texture(sTD2DInputs[0], vUV.st));
}
