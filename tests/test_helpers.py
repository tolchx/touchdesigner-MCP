# tests/test_helpers.py
"""Shared helpers for integration tests.

Provides `coverage_cmd()` which conditionally prefixes ``coverage run
--parallel-mode`` when the environment variable ``COVERAGE_RUN=1`` is set,
so subprocess coverage is captured without modifying the test invocation.

Usage:
    set COVERAGE_RUN=1
    python -m coverage run --parallel-mode --rcfile=.coveragerc \\
        -m unittest tests.test_mcp_server_stdio_integration -v
"""

import os
import sys
from typing import Optional

COVERAGE_ACTIVE = os.environ.get("COVERAGE_RUN", "").lower() in (
    "1",
    "true",
    "yes",
)


def coverage_cmd(
    script_path: str,
    extra_python_flags: Optional[list[str]] = None,
) -> list[str]:
    """Return the ``subprocess.Popen`` *cmd* list for running *script_path*.

    When ``COVERAGE_RUN=1`` is set, the list includes ``coverage run
    --parallel-mode --rcfile=.coveragerc`` between the Python interpreter
    and the script path so the subprocess's code is tracked by coverage.py.

    Parameters
    ----------
    script_path:
        Absolute or relative path to the Python script to execute.
    extra_python_flags:
        Optional list of Python interpreter flags (e.g. ``["-u"]`` for
        unbuffered output).  These are placed immediately after the
        interpreter executable, before any coverage or script arguments.
    """
    cmd = [sys.executable]
    if extra_python_flags:
        cmd.extend(extra_python_flags)
    if COVERAGE_ACTIVE:
        cmd.extend([
            "-m",
            "coverage",
            "run",
            "--parallel-mode",
            "--rcfile=.coveragerc",
        ])
    cmd.append(script_path)
    return cmd
