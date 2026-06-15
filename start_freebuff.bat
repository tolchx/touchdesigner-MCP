@echo off
TITLE FreeBuff Workspace
echo Verificando directorio de trabajo...

:: Crear el directorio si no existe
if not exist "C:\Users\Tolch\Documents\AI_Code\Touchdesigner_MCP\Main" (
    mkdir "C:\Users\Tolch\Documents\AI_Code\Touchdesigner_MCP\Main"
)

:: Cambiar al directorio
cd /d "C:\Users\Tolch\Documents\AI_Code\Touchdesigner_MCP\Main"

echo Iniciando FreeBuff en %CD%...
echo ===================================================

:: Ejecutar freebuff
call freebuff

echo ===================================================
pause
