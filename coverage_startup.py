# coverage_startup.py
"""Startup script for coverage.py subprocess tracking.

Used via PYTHONSTARTUP environment variable when running integration tests
that launch mcp_server_stdio.py or w2t_server.py as subprocesses.

Usage:
    set PYTHONSTARTUP=coverage_startup.py
    set COVERAGE_PROCESS_START=.coveragerc
    python -m coverage run --parallel-mode --rcfile=.coveragerc ...
"""
import coverage
coverage.process_startup()
