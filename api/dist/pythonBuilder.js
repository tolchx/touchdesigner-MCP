/**
 * PythonBuilder — Fluent helper for generating Python code sent to TouchDesigner.
 *
 * Eliminates repetitive string escaping, import management, try/except wrapping,
 * and JSON output boilerplate across TDClient methods.
 *
 * Usage:
 *   const code = new PythonBuilder()
 *     .import_('json')
 *     .tryBody(`t = op('${PythonBuilder.esc(path)}')`)
 *     .tryBody(`if t is None: print(json.dumps({'success':False,'error':'Not found'}))`)
 *     .tryBody(`else: t.destroy(); print(json.dumps({'success':True,'path':t.path}))`)
 *     .exceptBody("print(json.dumps({'success':False,'error':str(e)}))")
 *     .build();
 */
export class PythonBuilder {
    _imports = [];
    _tryBody = [];
    _exceptBody = [];
    // ── Import management ────────────────────────────────────────────
    /** Add one or more import modules (deduplicated). */
    import_(...modules) {
        for (const m of modules) {
            if (!this._imports.includes(m))
                this._imports.push(m);
        }
        return this;
    }
    // ── Body lines ───────────────────────────────────────────────────
    /** Add a line to the try block body. */
    tryBody(line) {
        this._tryBody.push(line);
        return this;
    }
    /** Add a line to the except block body. */
    exceptBody(line) {
        this._exceptBody.push(line);
        return this;
    }
    // ── Build ────────────────────────────────────────────────────────
    /** Compile the final Python code string. */
    build() {
        const parts = [];
        if (this._imports.length > 0) {
            parts.push(`import ${this._imports.join(",")}`);
        }
        parts.push("try:");
        for (const line of this._tryBody) {
            parts.push(`    ${line}`);
        }
        if (this._exceptBody.length > 0) {
            parts.push("except Exception as e:");
            for (const line of this._exceptBody) {
                parts.push(`    ${line}`);
            }
        }
        return parts.join("\n");
    }
    // ── Static escape helpers ────────────────────────────────────────
    /** Escape a string for safe embedding in a Python single-quoted string. */
    static esc(s) {
        return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    }
}
