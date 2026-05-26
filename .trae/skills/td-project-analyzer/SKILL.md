---
name: "td-project-analyzer"
description: "Automatiza el análisis exhaustivo de proyectos TouchDesigner (.toe), mapeo de nodos POP, y generación de documentación Markdown y templates. Invocalo para analizar un proyecto o actualizar docs."
---

# TouchDesigner Project Analyzer (td-project-analyzer)

Este skill permite realizar un escaneo profundo y automatizado sobre proyectos de TouchDesigner (`.toe`) que han sido expandidos previamente con `toeexpand` (en formato `.toe.dir`).

## ¿Qué hace este Skill?
1. **Mapeo de Nodos (Mermaid)**: Lee todos los archivos `.n` de una red y genera un diagrama de flujo de datos.
2. **Extracción de Parámetros**: Lee los archivos `.parm` para documentar configuraciones exactas.
3. **Análisis de Scripts**: Extrae el código fuente de los DATs (Python/GLSL) incrustados en la red.
4. **Validación y Cruce Teórico**: Compara los nodos encontrados con la teoría de TouchDesigner (especialmente POPs).
5. **Reportes y Templates**: Genera archivos estructurados listos para producción.

## Cuándo usarlo
- Cuando el usuario pide "analizar un archivo .toe" o "documentar el sistema de POPs de un proyecto".
- Cuando se necesite extraer el código de un proyecto antiguo para migrarlo.
- Para crear índices y estadísticas sobre el uso de ciertos operadores en un repositorio.

## Estructura de Salida
El script principal (`td_analyzer.py`) generará la siguiente estructura en el directorio objetivo:
- `/documentacion/` -> Archivos `.md` con el análisis y diagrama Mermaid de cada proyecto.
- `/componentes/` -> Scripts extraídos y configuraciones de parámetros (templates).
- `/recursos/` -> Dependencias encontradas.
- `/reportes/` -> `index.md` maestro y estadísticas globales.

## Cómo Ejecutarlo
Utiliza el script `td_analyzer.py` pasándole la ruta del directorio que contiene los proyectos expandidos:
```bash
python td_analyzer.py "C:\Ruta\Al\Directorio\Toe_Expand"
```
El script utilizará procesamiento en paralelo (`multiprocessing`) para analizar todas las carpetas a la vez.