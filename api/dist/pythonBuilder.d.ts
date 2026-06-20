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
export declare class PythonBuilder {
    private _imports;
    private _tryBody;
    private _exceptBody;
    /** Add one or more import modules (deduplicated). */
    import_(...modules: string[]): this;
    /** Add a line to the try block body. */
    tryBody(line: string): this;
    /** Add a line to the except block body. */
    exceptBody(line: string): this;
    /** Compile the final Python code string. */
    build(): string;
    /** Escape a string for safe embedding in a Python single-quoted string. */
    static esc(s: string): string;
}
