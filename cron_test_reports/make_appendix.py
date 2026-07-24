cd /c/Users/Tolch/Documents/AI_Code/Touchdesigner_MCP/Main/cron_test_reports

python -c "
import json

with open('shader_9.glsl') as f:
    code = f.read()

# Escape for markdown code block
lines = []
lines.append('')
lines.append('## Test #9 — 2026-06-21 02:00')
lines.append('- **Shader:** Curl Noise Fluid Deformation — divergence-free curl noise vector field (gradient of simplex noise potential) with 4-octave FBM, fine-scale micro-turbulence layer, radial breathing envelope, vertical height stratification, per-point index-based jitter, and tangential swirl rotation proportional to curl magnitude')
lines.append('- **Fuente:** web_search (curl noise for TouchDesigner instances — adapted from mir-lab/touchdesigner-instancing-examples, divergence-free vector field concept distinct from scalar noise displacement)')
lines.append('- **POP source:** circlePOP (radx=1.0, rady=1.0, divs=60)')
lines.append('- **Numelems:** 500')
lines.append('- **Errores encontrados:** Ninguno — compiled successfully first try (path absoluto R+\"/shader_code\", seteo inmediato de computedat antes del primer cook)')
lines.append('- **Fixes aplicados:** Error injection test confirmó que GLSL POP lee de `/project1/glsl_test_9/shader_code` (info mostraba \"ERROR: /project1/glsl_test_9/shader_code:1\") — restauración exitosa con \"Compiled Successfully\"')
lines.append('- **Estado:** ✅ Funcional — sin errores de compilación')
lines.append('- **Código GLSL:**')
lines.append('```glsl')
lines.append(code.rstrip())
lines.append('```')

with open('appendix_9.md', 'w') as f:
    f.write('\n'.join(lines))

print('Appendix written')
"
