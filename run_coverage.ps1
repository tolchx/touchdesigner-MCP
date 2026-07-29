#!/usr/bin/env pwsh
# run_coverage.ps1 — Ejecuta cobertura completa de los servidores Python
#
# Uso:
#   .\run_coverage.ps1
#
# Requisitos:
#   pip install coverage
#
# Esto ejecuta 218 tests en total (87 MCP unit + 23 MCP integ + 92 W2T unit + 16 W2T integ)
# y genera un reporte combinado de cobertura.

$ErrorActionPreference = "Stop"

$env:COVERAGE_RUN = "1"
$env:PYTHONIOENCODING = "utf-8"

# ── Limpiar datos anteriores ──
Write-Host "=== Cleaning old coverage data ===" -ForegroundColor Cyan
Remove-Item -Force ".coverage*" -ErrorAction SilentlyContinue 2>$null

# ── Suite MCP ──
Write-Host "=== MCP Unit Tests (87 tests) ===" -ForegroundColor Cyan
python -m coverage run --parallel-mode --rcfile=.coveragerc -m unittest tests.test_mcp_server_stdio 2>&1

Write-Host "=== MCP Integration Tests (23 tests) ===" -ForegroundColor Cyan
python -m coverage run --parallel-mode --rcfile=.coveragerc -m unittest tests.test_mcp_server_stdio_integration.TestMcpStdioIntegration 2>&1

Start-Sleep -Seconds 3

# ── Suite W2T ──
Write-Host "=== W2T Unit Tests (92 tests) ===" -ForegroundColor Cyan
python -m coverage run --parallel-mode --rcfile=.coveragerc -m unittest tests.test_w2t_server_unit 2>&1

Start-Sleep -Seconds 3

Write-Host "=== W2T Integration Tests (16 tests) ===" -ForegroundColor Cyan
python -m coverage run --parallel-mode --rcfile=.coveragerc -m unittest tests.test_w2t_server_integration 2>&1

# ── Combinar y reportar ──
Write-Host "=== Combining coverage data ===" -ForegroundColor Cyan
python -m coverage combine --rcfile=.coveragerc 2>&1

Write-Host "=== Coverage Report (mcp_server_stdio + w2t_server) ===" -ForegroundColor Green
python -m coverage report --rcfile=.coveragerc --include=mcp_server_stdio.py,w2t_server.py 2>&1

Write-Host "=== Generating HTML report ===" -ForegroundColor Cyan
python -m coverage html --rcfile=.coveragerc -d coverage_html 2>&1

Write-Host "=== DONE ===" -ForegroundColor Green
Write-Host "HTML report: coverage_html/index.html" -ForegroundColor Yellow
