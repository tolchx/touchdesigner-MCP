<#
.SYNOPSIS
    TouchDesigner Batch Expander - PowerShell
    Expande archivos .toe/.tox desde D:\TD hacia Toe_Expand
.DESCRIPTION
    Busca recursivamente archivos .toe y .tox en D:\TD, excluye archivos
    macOS ._ y ya expandidos, ejecuta toeexpand.exe y copia a Toe_Expand.
    No requiere Node.js - solo PowerShell y TouchDesigner.
.PARAMETER Source
    Directorio fuente (default: D:\TD)
.PARAMETER Output
    Directorio destino
.EXAMPLE
    .\expand-remaining.ps1
    .\expand-remaining.ps1 -Source "D:\TD\POPs"
#>

param(
    [string]$Source = "D:\TD",
    [string]$Output = ""
)

$ErrorActionPreference = "Continue"

# Rutas fijas
$ToeExpand = "C:\Program Files\Derivative\TouchDesigner\bin\toeexpand.exe"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not $Output) {
    $Output = Resolve-Path (Join-Path $ScriptDir "..\..\..\old\mcp_td_v3\Toe_Expand") -ErrorAction SilentlyContinue
    if (-not $Output) {
        $Output = Join-Path $ScriptDir "..\..\..\old\mcp_td_v3\Toe_Expand"
        New-Item -ItemType Directory -Force -Path $Output | Out-Null
        $Output = (Resolve-Path $Output).Path
    }
}

$LogFile = Join-Path $ScriptDir ".expand-ps-log.txt"

function Write-Log {
    param([string]$Message, [string]$Type = "INFO")
    $time = Get-Date -Format "HH:mm:ss"
    $line = "[$time] [$Type] $Message"
    Write-Host $line
    Add-Content -Path $LogFile -Value $line -ErrorAction SilentlyContinue
}

# ---- Verificaciones ----
if (-not (Test-Path $ToeExpand)) {
    Write-Host "ERROR: No se encuentra toeexpand.exe en:" -ForegroundColor Red
    Write-Host "       $ToeExpand" -ForegroundColor Red
    Write-Host "       Verifica que TouchDesigner este instalado." -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $Source)) {
    Write-Host "ERROR: No existe el directorio fuente: $Source" -ForegroundColor Red
    exit 1
}

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  TouchDesigner Batch Expander (PowerShell)" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Fuente:   $Source" -ForegroundColor White
Write-Host "  Destino:  $Output" -ForegroundColor White
Write-Host ""

# ---- Escanear archivos fuente ----
Write-Host "Escaneando archivos .toe y .tox..." -ForegroundColor Yellow
$allFiles = Get-ChildItem -Path $Source -Recurse -Include "*.toe", "*.tox" -File `
    | Where-Object { $_.Name -notlike "._*" -and $_.Name -notlike "__MACOSX*" }

$totalFound = @($allFiles).Count
Write-Host "  Encontrados: $totalFound archivos validos" -ForegroundColor White

# ---- Determinar cuales ya estan expandidos ----
Write-Host "Verificando archivos ya expandidos..." -ForegroundColor Yellow
$completedDirs = Get-ChildItem -Path $Output -Recurse -Directory -Filter "*.dir" -ErrorAction SilentlyContinue
$completedSet = @{}
foreach ($dir in $completedDirs) { $completedSet[$dir.FullName.ToLower()] = $true }

$needProcessing = @()
$alreadyDone = 0

foreach ($file in $allFiles) {
    $baseName = $file.Name
    $fileDir = $file.Directory.FullName
    $relDir = ""
    if ($fileDir -like "$Source*") {
        $relDir = $fileDir.Substring($Source.Length).TrimStart("\")
    }
    $projectName = [System.IO.Path]::GetFileNameWithoutExtension($file.Name)
    $projectName = $projectName -replace '[<>:"/\|?*]', '_'
    
    if ($relDir -eq "") {
        $expectedDir = (Join-Path $Output $projectName "$baseName.dir").ToLower()
    } else {
        $expectedDir = (Join-Path $Output $relDir $projectName "$baseName.dir").ToLower()
    }
    
    if ($completedSet.ContainsKey($expectedDir)) {
        $alreadyDone++
    } else {
        $needProcessing += $file.FullName
    }
}

Write-Host "  Ya expandidos: $alreadyDone" -ForegroundColor Green
Write-Host "  Por procesar:  $($needProcessing.Count)" -ForegroundColor Yellow

if ($needProcessing.Count -eq 0) {
    Write-Host "`n�Todos los archivos ya estan expandidos!" -ForegroundColor Green
    Write-Host "  Total: $totalFound en $Output" -ForegroundColor Green
    exit 0
}

# ---- Preguntar confirmacion ----
Write-Host ""
Write-Host "Se procesaran $($needProcessing.Count) archivos." -ForegroundColor Yellow
$resp = Read-Host "�Continuar? (s/n)"
if ($resp -notlike "s*") { Write-Host "Cancelado."; exit 0 }

# ---- Procesar secuencialmente ----
Write-Host ""
Write-Host "Procesando..." -ForegroundColor Green

$processed = 0
$errors = 0
$skipped = 0
$total = $needProcessing.Count
$startTime = Get-Date

for ($i = 0; $i -lt $total; $i++) {
    $filePath = $needProcessing[$i]
    $fileName = Split-Path $filePath -Leaf
    $fileDir = Split-Path $filePath -Parent
    $baseName = Split-Path $filePath -Leaf
    $projectName = [System.IO.Path]::GetFileNameWithoutExtension($filePath)
    $projectName = $projectName -replace '[<>:"/\|?*]', '_'
    
    $relDir = ""
    if ($fileDir -like "$Source*") {
        $relDir = $fileDir.Substring($Source.Length).TrimStart("\")
    }
    
    if ($relDir -eq "") {
        $outDir = Join-Path $Output $projectName
    } else {
        $outDir = Join-Path $Output $relDir $projectName
    }
    
    $idx = $i + 1
    $progress = "[$idx/$total]"
    
    # Doble check de .dir
    $targetDir = Join-Path $outDir "$baseName.dir"
    if (Test-Path $targetDir) {
        Write-Log "$progress SKIP: $fileName (ya existe)" "SKIP"
        $skipped++
        continue
    }
    
    Write-Log "$progress EXPAND: $fileName..." "INFO"
    
    # Ejecutar toeexpand.exe
    $proc = Start-Process -FilePath $ToeExpand -ArgumentList "`"$filePath`"" -NoNewWindow -PassThru -Wait
    
    # Verificar si se genero .dir
    $expandedDir = "$filePath.dir"
    $expandedToc = "$filePath.toc"
    
    if (-not (Test-Path $expandedDir)) {
        Write-Log "$progress ERROR: $fileName - toeexpand no genero .dir" "ERROR"
        $errors++
        continue
    }
    
    # Crear directorio de salida
    New-Item -ItemType Directory -Force -Path $outDir | Out-Null
    
    # Copiar y limpiar .dir
    if (Test-Path $targetDir) { Remove-Item -Recurse -Force $targetDir -ErrorAction SilentlyContinue }
    Copy-Item -Path $expandedDir -Destination $targetDir -Recurse -Force
    Remove-Item -Recurse -Force $expandedDir -ErrorAction SilentlyContinue
    
    # Copiar .toc si existe
    if (Test-Path $expandedToc) {
        $targetToc = Join-Path $outDir "$baseName.toc"
        Copy-Item -Path $expandedToc -Destination $targetToc -Force
        Remove-Item -Force $expandedToc -ErrorAction SilentlyContinue
    }
    
    # Copiar archivo original
    Copy-Item -Path $filePath -Destination (Join-Path $outDir $baseName) -Force
    
    # README
    $readme = "# $projectName`n`nProyecto TouchDesigner expandido automaticamente.`nFuente: $filePath`nFecha: $(Get-Date -Format 'yyyy-MM-dd HH:mm')`n"
    Set-Content -Path (Join-Path $outDir "README.md") -Value $readme
    
    Write-Log "$progress OK: $fileName" "OK"
    $processed++
    
    # Reporte cada 20 archivos
    if ($processed % 20 -eq 0) {
        $elapsed = [math]::Round(((Get-Date) - $startTime).TotalMinutes, 1)
        Write-Log "Progreso: $processed procesados, $errors errores, $skipped saltados ($elapsed min)" "STATS"
    }
}

# ---- Resumen ----
$elapsed = [math]::Round(((Get-Date) - $startTime).TotalMinutes, 1)
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  RESULTADOS" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Total archivos:       $totalFound" -ForegroundColor White
Write-Host "  Ya expandidos:        $alreadyDone" -ForegroundColor Green
Write-Host "  Procesados ahora:     $processed" -ForegroundColor Green
Write-Host "  Errores:              $errors" -ForegroundColor Red
Write-Host "  Tiempo total:         $elapsed minutos" -ForegroundColor White
Write-Host "  Destino:              $Output" -ForegroundColor White
Write-Host ""
Write-Host "Log guardado en: $LogFile" -ForegroundColor Gray

if ($errors -gt 0) {
    Write-Host ""
    Write-Host "ATENCION: Hubo $errors errores. Revisa el log para mas detalles." -ForegroundColor Yellow
}

pause
