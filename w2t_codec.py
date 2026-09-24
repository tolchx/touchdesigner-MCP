"""Web2Touch codec: safe Python-literal building + static path resolution.

Extracted so it can be unit-tested without starting a server, and shared by the
sync (w2t_server.py) and async (w2t_server_async.py) relays.

Why (2026-09-24 audit): the relay turns client JSON into Python source that runs
inside TouchDesigner via POST /exec. Building that source with str.format()
means a value containing a quote breaks out of the string literal and executes
whatever follows. Every value must be serialized as a Python literal, never
interpolated raw.
"""

from __future__ import annotations

import json
import pathlib

# Charset accepted for row identifiers (they end up as TD cell values).
_SAFE_ID_CHARS = set(
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-+: /"
)


def py_str(value: object) -> str:
    """Return a QUOTED Python string literal that is safe for any content.

    json.dumps produces the same escaping rules for the characters that matter
    (quotes, backslashes, control chars), so the result can be spliced into a
    Python source string without escaping concerns.
    """
    return json.dumps(str(value))


def sanitize_id(value: object) -> str:
    """Drop anything outside the expected identifier charset (control chars,
    quotes, newlines) so a hostile id cannot even reach the literal builder."""
    return "".join(c for c in str(value) if c in _SAFE_ID_CHARS)


def build_neon_upsert_code(data: dict, raw_msg: str = "") -> str:
    """Build the Python code that upserts one row into /project1/neon_values.

    Every interpolated value goes through py_str()/sanitize_id(): the generated
    source stays valid (and inert) regardless of what the client sent.
    """
    cid = py_str(sanitize_id(data.get("id", "")))
    ctype = py_str(sanitize_id(data.get("type", "")))
    cval = py_str(data.get("value", raw_msg))
    cts = py_str(sanitize_id(data.get("timestamp", "")))
    return (
        'import json; t=op("/project1/neon_values"); '
        f"cid={cid}; ctype={ctype}; cval={cval}; cts={cts}; found=-1\n"
        "for r in range(1,t.numRows):\n"
        " if t[r,0].val==cid: found=r; break\n"
        "if found<0: t.appendRow([cid,ctype,cval,cts])\n"
        "else: t[found,2]=cval; t[found,3]=cts"
    )


def safe_static_path(root: pathlib.Path, uri: str) -> pathlib.Path | None:
    """Resolve a request URI to a file INSIDE root, or None.

    Rejects path traversal (``..``), absolute paths and NUL bytes: a static
    server that serves ``/assets/../../secret`` is a file-disclosure bug, not a
    feature. Root itself is resolved so symlink-free comparisons still hold.
    """
    if not uri or "\x00" in uri:
        return None
    clean = uri.split("?", 1)[0].split("#", 1)[0].lstrip("/")
    if clean in ("", "."):
        return None
    if ".." in clean.split("/"):
        return None
    candidate = (root / clean).resolve()
    try:
        root_resolved = root.resolve()
    except OSError:
        return None
    if candidate != root_resolved and root_resolved not in candidate.parents:
        return None
    return candidate if candidate.is_file() else None
