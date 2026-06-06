# TouchDesigner MCP — Guía de grabación de video demostración

## Propósito

Este video demostrará las capacidades del servidor MCP de TouchDesigner: cómo un AI assistant (Claude, Cursor, Windsurf, etc.) puede controlar TouchDesigner en tiempo real para crear, conectar y modificar redes visuales.

**Duración objetivo:** 3-5 minutos

---

## Escena 1: Instalación y configuración (30-45s)

### Qué mostrar
1. Abrir terminal y clonar el repositorio
2. `npm install` y compilación (`npx tsc`)
3. Abrir TouchDesigner con el servidor API corriendo
4. Configurar variables de entorno (.env o inline)
5. Iniciar el servidor MCP

### Tips de grabación
- Usar splitscreen o PIP: izquierda = terminal, derecha = TouchDesigner
- Mostrar que el servidor arranca sin errores
- Resaltar las variables `TDAPI_HOST` y `TDAPI_PORT`

### Script sugerido (voz)
> "Hoy te voy a mostrar cómo conectar TouchDesigner con cualquier AI assistant usando el protocolo MCP. Primero, clonamos el repo, instalamos dependencias, y compilamos. Luego abrimos TouchDesigner con el servidor HTTP API, configuramos la IP y el puerto, e iniciamos el MCP server. Listo, ya estamos conectados."

---

## Escena 2: Creación de red visual desde lenguaje natural (60-90s)

### Qué mostrar
1. Mostrar el chat con el AI assistant (Claude Desktop)
2. Pedir: "Crea un NoiseTOP, conéctalo a un LevelTOP, luego a un CompositeTOP con un video de entrada"
3. El AI llama a `td_create_operator`, `td_connect_nodes`, etc.
4. Mostrar en TouchDesigner cómo aparecen y se conectan los nodos
5. Modificar parámetros: "Cambia el amplitude del Noise a 0.3"
6. Mostrar la respuesta visual en TouchDesigner

### Tips de grabación
- Posicionar la ventana de TouchDesigner y el chat lado a lado
- Usar `td_network_plan` para mostrar la creación automática de redes complejas
- Mostrar tanto éxito como cómo se ven los parámetros cambiados

### Script sugerido (voz)
> "Lo interesante empieza aquí. Le pido al AI que cree una red de ruido con un Level y un Composite. En tiempo real, el MCP server llama a TouchDesigner y los nodos aparecen y se conectan solos. Luego puedo afinar parámetros — 'cambia el amplitude a 0.3' — y TouchDesigner responde al instante."

---

## Escena 3: Búsqueda en base de conocimiento (30-45s)

### Qué mostrar
1. Preguntar al AI: "¿Qué operadores TOP de ruido existen?"
2. La tool `td_ops_query` devuelve resultados de la base local
3. Preguntar: "Dame ayuda sobre NoiseTOP"
4. La tool `td_get_param_help` muestra parámetros y descripciones

### Tips de grabación
- No requiere TouchDesigner conectado — mostrar que funciona offline
- Hacer scroll en los resultados para mostrar la riqueza de la base de datos

### Script sugerido (voz)
> "El servidor incluye una base de conocimiento completa de TouchDesigner. Aunque no tengas una conexión activa, puedes preguntar qué operadores existen, cómo se usan sus parámetros, y obtener ayuda detallada. Es como tener la documentación de TouchDesigner integrada en tu AI."

---

## Escena 4: Workflow avanzado — Feedback loop (45-60s)

### Qué mostrar
1. Usar `td_get_workflow` con "feedback"
2. Aplicar el workflow con `td_network_plan` + `apply=true`
3. Mostrar la red completa creada automáticamente
4. Ajustar el feedback amount

### Tips de grabación
- Elegir un workflow visualmente impactante (feedback trail o kaleidoscope)
- Mostrar todo el proceso de principio a fin sin cortes

### Script sugerido (voz)
> "Los workflows reutilizables son una de las características más potentes. Le pido al AI un workflow de feedback loop, y en segundos tengo una red completa y funcional en TouchDesigner. Luego puedo ajustar los parámetros con lenguaje natural para obtener el look exacto que quiero."

---

## Escena 5: Troubleshooting y monitoreo (30-45s)

### Qué mostrar
1. `td_healthcheck` para verificar el estado de la red
2. `td_get_errors` para encontrar errores en un operador
3. `td_watch` para monitorear FPS en tiempo real
4. Usar `td_history_undo` para deshacer un cambio

### Tips de grabación
- Crear un error intencional (conectar tipos incompatibles) y mostrarlo
- Mostrar cómo el AI lo detecta y sugiere una solución

### Script sugerido (voz)
> "Cuando algo sale mal, el MCP server tiene herramientas de debugging. Puedo pedir un healthcheck de la red, ver errores específicos de un operador, o monitorear el rendimiento en tiempo real. Y si me equivoqué, un simple 'undo' revierte el último cambio."

---

## Cierre (15-20s)

### Qué mostrar
1. Volver a la vista general
2. Mostrar enlaces (GitHub, npm, docs)

### Script sugerido (voz)
> "TouchDesigner MCP Server con más de 60 tools está disponible en GitHub y npm. Las docs interactivas están en GitHub Pages. ¡Pruébalo y construye redes alucinantes con AI!"

---

## Herramientas de grabación recomendadas

| Herramienta | Plataforma | Uso recomendado |
|------------|-----------|-----------------|
| **OBS Studio** | Win/Mac/Linux | Grabación profesional, gratis, splitscreen |
| **Screen Studio** | Mac | Grabación pulida con efectos automáticos |
| **Kap** | Mac | Gratis, liviano, bueno para clips rápidos |
| **ShareX** | Windows | Gratis, captura de región, GIF |
| **QuickTime Player** | Mac | Simple, built-in, graba pantalla |

## Post-producción recomendada

1. **DaVinci Resolve** (gratis) — edición profesional
2. **CapCut** (gratis) — edición rápida con subtítulos automáticos
3. **Descript** — edición basada en transcripción, ideal para tutoriales

## Mejores prácticas

- **Resolución**: 1920x1080 a 30fps mínimo
- **Layout**: TouchDesigner a la izquierda (60%), chat a la derecha (40%)
- **Subtítulos**: Incluir subtítulos en inglés para alcance global
- **Música**: Lo-fi o ambient, volumen muy bajo
- **Duración**: No más de 5 minutos
- **Call to action**: Incluir enlace al repo y npm al final

## Estructura del archivo final

Recomiendo exportar como:
- **MP4 H.264** para YouTube/Vimeo
- **WebM VP9** para incrustar en GitHub Pages
- Resolución: 1920x1080, 30fps, bitrate 8-12 Mbps

---

*TouchDesigner MCP v3 — Preparado por tolchx*
