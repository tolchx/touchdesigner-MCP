"""sitecustomize: automatically starts coverage measurement in subprocesses.

Place the parent directory on PYTHONPATH when running tests to enable
coverage tracking of subprocesses launched via subprocess.Popen.

Usage:
    set PYTHONPATH=coverage_hooks;%%PYTHONPATH%%
    set COVERAGE_PROCESS_START=.coveragerc
    python -m coverage run --parallel-mode --rcfile=.coveragerc ...
"""
try:
    import coverage
    coverage.process_startup()
except ImportError:
    pass  # coverage not installed — do nothing
