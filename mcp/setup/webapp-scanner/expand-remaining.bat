@echo off
setlocal enabledelayedexpansion

REM ============================================================
REM TouchDesigner Batch Expander - Windows Batch
REM ============================================================
REM Busca archivos .toe/.tox en D:\TD y los expande con toeexpand.exe
REM Guarda los resultados en Toe_Expand (C:\...)
REM ============================================================

set "TOEXPAND=C:\Program Files\Derivative\TouchDesigner\bin\toeexpand.exe"
set "SOURCE=D:\TD"
set "DEST=C:\Users\Tolch\Documents\AI_Code\Touchdesigner_MCP\Main\old\mcp_td_v3\Toe_Expand"
set "LOG=%DEST%\..\expand-log.txt"

if not exist "%TOEXPAND%" (
    echo ERROR: No se encuentra toeexpand.exe en %TOEXPAND%
    pause
    exit /b 1
)

if not exist "%SOURCE%" (
    echo ERROR: No existe el directorio fuente %SOURCE%
    pause
    exit /b 1
)

if not exist "%DEST%" mkdir "%DEST%"

echo ============================================================
echo TouchDesigner Batch Expander
echo ============================================================
echo Fuente:  %SOURCE%
echo Destino: %DEST%
echo ============================================================
echo.

set /a TOTAL=0
set /a COMPLETED=0
set /a ERRORS=0
set /a SKIPPED=0

REM Collect all .toe and .tox files
echo Colectando archivos .toe/.tox de %SOURCE%...
echo.

set "FILELIST=%TEMP%\td-files.txt"
if exist "%FILELIST%" del "%FILELIST%"

REM Use dir /s to find all files recursively
dir "%SOURCE%\*.toe" /s /b >> "%FILELIST%" 2>nul
dir "%SOURCE%\*.tox" /s /b >> "%FILELIST%" 2>nul

REM Count files
for /f %%i in ('type "%FILELIST%" ^| find /c /v ""') do set TOTAL=%%i

echo Encontrados: %TOTAL% archivos
echo.
echo Procesando...

set /a COUNT=0

for /f "usebackq tokens=* delims=" %%F in ("%FILELIST%") do (
    set "FILE=%%F"
    set /a COUNT+=1
    
    REM Skip macOS metadata files
    echo !FILE! | findstr /i "\\._" >nul
    if !errorlevel! equ 0 (
        set /a SKIPPED+=1
        echo [%COUNT%/%TOTAL%] SKIP: %%F (archivo macOS)
        echo [%COUNT%/%TOTAL%] SKIP: %%F (archivo macOS)>> "%LOG%"
        goto :nextfile
    )
    
    REM Get filename parts
    for %%A in ("%%F") do set "FNAME=%%~nxA"
    for %%A in ("%%F") do set "BNAME=%%~nA"
    
    REM Get parent directory relative to SOURCE
    set "FP=%%~dpF"
    set "FP=!FP:%SOURCE%=!"
    if "!FP:~0,1!"=="\" set "FP=!FP:~1!"
    
    REM Clean project name (remove invalid chars, keep ° and ñ)
    set "CLEAN_NAME=!BNAME!"
    set "CLEAN_NAME=!CLEAN_NAME:<=_!"
    set "CLEAN_NAME=!CLEAN_NAME:>=_!"
    set "CLEAN_NAME=!CLEAN_NAME::=_!"
    set "CLEAN_NAME=!CLEAN_NAME:|=_!"
    set "CLEAN_NAME=!CLEAN_NAME:?=_!"
    set "CLEAN_NAME=!CLEAN_NAME:*=_!"
    
    REM Determine output directory
    if "!FP!"=="" (
        set "OUTDIR=%DEST%\!CLEAN_NAME!"
    ) else (
        set "OUTDIR=%DEST%\!FP!!CLEAN_NAME!"
    )
    
    REM Check if already expanded (look for .dir folder)
    if exist "!OUTDIR!\!FNAME!.dir\" (
        echo [%COUNT%/%TOTAL%] SKIP: !FNAME! (ya expandido)
        set /a SKIPPED+=1
        goto :nextfile
    )
    
    REM Check if .dir exists in source (from interrupted previous run)
    if exist "%%F.dir\" (
        echo [%COUNT%/%TOTAL%] MOVING: !FNAME! (ya expandido, moviendo a destino)
        if not exist "!OUTDIR!" mkdir "!OUTDIR!"
        
        REM Move .dir folder
        if exist "!OUTDIR!\!FNAME!.dir\" rmdir /s /q "!OUTDIR!\!FNAME!.dir\"
        move "%%F.dir" "!OUTDIR!\" >nul 2>&1
        
        REM Move .toc if exists
        if exist "%%F.toc" (
            if exist "!OUTDIR!\!FNAME!.toc" del "!OUTDIR!\!FNAME!.toc"
            move "%%F.toc" "!OUTDIR!\" >nul 2>&1
        )
        
        REM Copy original file
        copy "%%F" "!OUTDIR!\" >nul 2>&1
        
        REM Generate minimal README
        echo # !CLEAN_NAME! > "!OUTDIR!\README.md"
        echo. >> "!OUTDIR!\README.md"
        echo Proyecto TouchDesigner expandido. >> "!OUTDIR!\README.md"
        echo Fecha: %DATE% >> "!OUTDIR!\README.md"
        
        set /a COMPLETED+=1
        echo [%COUNT%/%TOTAL%] OK: !FNAME!
        goto :nextfile
    )
    
    REM Execute toeexpand.exe
    echo [%COUNT%/%TOTAL%] EXPAND: !FNAME!...
    echo [%COUNT%/%TOTAL%] EXPAND: !FNAME!...>> "%LOG%"
    
    "%TOEXPAND%" "%%F" >nul 2>&1
    
    REM Check if expansion succeeded
    if exist "%%F.dir\" (
        if not exist "!OUTDIR!" mkdir "!OUTDIR!"
        
        REM Copy .dir folder
        if exist "!OUTDIR!\!FNAME!.dir\" rmdir /s /q "!OUTDIR!\!FNAME!.dir\"
        xcopy "%%F.dir" "!OUTDIR!\!FNAME!.dir\" /E /I /Q /Y >nul 2>&1
        rmdir /s /q "%%F.dir" 2>nul
        
        REM Copy .toc if exists
        if exist "%%F.toc" (
            copy "%%F.toc" "!OUTDIR!\" /Y >nul 2>&1
            del "%%F.toc" 2>nul
        )
        
        REM Copy original file
        copy "%%F" "!OUTDIR!\" /Y >nul 2>&1
        
        REM Generate minimal README
        echo # !CLEAN_NAME! > "!OUTDIR!\README.md"
        echo. >> "!OUTDIR!\README.md"
        echo Proyecto TouchDesigner expandido automaticamente. >> "!OUTDIR!\README.md"
        echo Fuente: %%F >> "!OUTDIR!\README.md"
        echo Fecha: %DATE% %TIME% >> "!OUTDIR!\README.md"
        
        set /a COMPLETED+=1
        echo [%COUNT%/%TOTAL%] OK: !FNAME!
    ) else (
        set /a ERRORS+=1
        echo [%COUNT%/%TOTAL%] ERROR: !FNAME! - toeexpand.exe no genero .dir
        echo [%COUNT%/%TOTAL%] ERROR: !FNAME!>> "%LOG%"
    )
    
    :nextfile
)

echo.
echo ============================================================
echo RESUMEN
echo ============================================================
echo Total archivos: %TOTAL%
echo Procesados:     %COMPLETED%
echo Errores:        %ERRORS%
exho Saltados:       %SKIPPED%
echo ============================================================
echo.
echo Log: %LOG%
echo Destino: %DEST%
echo.

REM Fix typo in display
echo Saltados:       %SKIPPED%

echo.
echo Proceso completado!
pause
