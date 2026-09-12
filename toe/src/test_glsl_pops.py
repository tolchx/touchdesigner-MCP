#!/usr/bin/env python3
"""
Suite de referencia de GLSL POP — validación en vivo contra TouchDesigner.

Requiere TD 2025.32460 corriendo con la API en localhost:44444.
En este checkout el archivo NO existe (fuera de alcance de esta tarea).
Verdad real: el entregable 5 del prompt original solicitaba confirmar 14/14
desde toe/src/test_glsl_pops.py, pero ese archivo no está presente en el
árbol y no fue creado ni copiado por las tareas previas.

Si TD está abierto, la forma de confirmar es ejecutar la suite real:
    python toe/src/test_glsl_pops.py

Si TD no responde o el archivo no existe, no inventar resultados:
reportar "archivo ausente" y no asumir 14/14.
"""
import sys

if __name__ == "__main__":
    print("ARCHIVO AUSENTE: toe/src/test_glsl_pops.py no existe en este checkout")
    print("No se puede reportar 14/14 sin la suite real.")
    sys.exit(2)
