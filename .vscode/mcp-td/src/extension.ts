import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

let serverProcess: cp.ChildProcess | null = null;
let serverOutputChannel: vscode.OutputChannel | null = null;

// ─── helpers ──────────────────────────────────────────────────────────

function getExtensionPath(): string {
    // The extension dir is .vscode/mcp-td/ — we need the workspace root for
    // the MCP server which lives at workspace/mcp/dist/index.js
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        throw new Error('No workspace folder open. Open the touchdesigner folder first.');
    }
    return workspaceFolders[0].uri.fsPath;
}

function getMcpIndexPath(): string {
    return path.join(getExtensionPath(), 'mcp', 'dist', 'index.js');
}

function getOutputChannel(): vscode.OutputChannel {
    if (!serverOutputChannel) {
        serverOutputChannel = vscode.window.createOutputChannel('MCP-TD Server');
    }
    return serverOutputChannel;
}

// ─── activate / deactivate ────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext) {
    console.log('MCP-TD: extension activated');

    context.subscriptions.push(
        vscode.commands.registerCommand('mcp-td.start', startServer),
        vscode.commands.registerCommand('mcp-td.stop', stopServer),
        vscode.commands.registerCommand('mcp-td.status', showStatus),
        vscode.commands.registerCommand('mcp-td.execute', executePython),
        vscode.commands.registerCommand('mcp-td.listTools', listTools),
    );
}

export function deactivate() {
    stopServer();
}

// ─── start ────────────────────────────────────────────────────────────

async function startServer() {
    if (serverProcess) {
        vscode.window.showWarningMessage('MCP-TD server is already running.');
        return;
    }

    const indexJs = getMcpIndexPath();
    if (!fs.existsSync(indexJs)) {
        vscode.window.showErrorMessage(
            `MCP server not found at ${indexJs}. Run 'npm run build' in the workspace root first.`
        );
        return;
    }

    const config = vscode.workspace.getConfiguration('mcp-td');
    const host = config.get<string>('host', 'localhost');
    const port = config.get<number>('port', 44444);

    const env: NodeJS.ProcessEnv = {
        ...process.env,
        TDAPI_HOST: host,
        TDAPI_PORT: String(port),
    };

    const channel = getOutputChannel();
    channel.clear();
    channel.show(true);
    channel.appendLine('[MCP-TD] Starting server...');
    channel.appendLine(`[MCP-TD] TDAPI_HOST=${host}, TDAPI_PORT=${port}`);
    channel.appendLine(`[MCP-TD] Path: ${indexJs}`);

    serverProcess = cp.spawn('node', [indexJs], {
        cwd: path.dirname(path.dirname(indexJs)), // mcp/ directory
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
    });

    serverProcess.stdout?.on('data', (data: Buffer) => {
        channel.append(data.toString());
    });

    serverProcess.stderr?.on('data', (data: Buffer) => {
        channel.append(data.toString());
    });

    serverProcess.on('error', (err) => {
        channel.appendLine(`[MCP-TD] Error: ${err.message}`);
        serverProcess = null;
        vscode.window.showErrorMessage(`MCP-TD server error: ${err.message}`);
    });

    serverProcess.on('exit', (code) => {
        channel.appendLine(`[MCP-TD] Server exited with code ${code}`);
        serverProcess = null;
    });

    // Give it a moment to start
    await new Promise((r) => setTimeout(r, 500));
    vscode.window.showInformationMessage('MCP-TD server started.');
}

// ─── stop ─────────────────────────────────────────────────────────────

function stopServer() {
    if (!serverProcess) {
        vscode.window.showInformationMessage('MCP-TD server is not running.');
        return;
    }

    const channel = getOutputChannel();
    channel.appendLine('[MCP-TD] Stopping server...');

    // Try graceful kill first
    serverProcess.kill('SIGTERM');

    // Force kill after 2 seconds if still alive
    setTimeout(() => {
        if (serverProcess && !serverProcess.killed) {
            serverProcess.kill('SIGKILL');
        }
    }, 2000);

    serverProcess = null;
    vscode.window.showInformationMessage('MCP-TD server stopped.');
}

// ─── status ───────────────────────────────────────────────────────────

async function showStatus() {
    const channel = getOutputChannel();
    channel.show(true);

    if (serverProcess) {
        channel.appendLine(`[MCP-TD] Server PID: ${serverProcess.pid}`);
        channel.appendLine('[MCP-TD] Status: RUNNING');
        channel.appendLine('[MCP-TD] Tools: See "MCP-TD: List Tools"');
    } else {
        channel.appendLine('[MCP-TD] Status: STOPPED');
    }
}

// ─── execute python ───────────────────────────────────────────────────

async function executePython() {
    const code = await vscode.window.showInputBox({
        prompt: 'Enter TouchDesigner Python code to execute',
        placeHolder: 'e.g. op("/project1").store("key", 42)',
        ignoreFocusOut: true,
    });

    if (!code) {
        return; // user cancelled
    }

    // Call the MCP server via a REST-like pattern: we need to send a JSON-RPC
    // message over stdin to the spawned child process (stdio transport).
    if (!serverProcess || !serverProcess.stdin) {
        vscode.window.showErrorMessage('MCP-TD server is not running. Start it first via "MCP-TD: Start Server".');
        return;
    }

    const channel = getOutputChannel();
    channel.appendLine(`\n[MCP-TD] Executing Python code...`);
    channel.appendLine(`> ${code}`);

    // Build a JSON-RPC request for the td_execute_python tool
    const request = JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now().toString(),
        method: 'tools/call',
        params: {
            name: 'td_execute_python',
            arguments: { code },
        },
    });

    channel.appendLine(`[MCP-TD] Sending request...`);

    // Listen for the response
    let responseData = '';
    const onData = (data: Buffer) => {
        responseData += data.toString();
    };
    serverProcess.stdout?.on('data', onData);

    // Send the request
    serverProcess.stdin.write(request + '\n');

    // Wait briefly for the response
    await new Promise((r) => setTimeout(r, 1000));

    serverProcess.stdout?.removeListener('data', onData);

    if (responseData) {
        channel.appendLine(`[MCP-TD] Response: ${responseData}`);
        try {
            const parsed = JSON.parse(responseData);
            if (parsed.result?.content) {
                const text = parsed.result.content
                    .filter((c: any) => c.type === 'text')
                    .map((c: any) => c.text)
                    .join('\n');
                vscode.window.showInformationMessage('Python executed successfully');
                channel.appendLine(text);
            } else {
                vscode.window.showErrorMessage('Execution returned no result');
            }
        } catch {
            channel.appendLine('[MCP-TD] Raw response (non-JSON): ' + responseData);
        }
    } else {
        channel.appendLine('[MCP-TD] No response received. Check if TouchDesigner is running.');
        vscode.window.showWarningMessage('No response from MCP server. Is TouchDesigner running?');
    }
}

// ─── list tools ───────────────────────────────────────────────────────

// Known tools from the MCP server (extracted from tools/*.js)
const KNOWN_TOOLS = [
    'td_op_create', 'td_op_delete', 'td_op_rename', 'td_op_move', 'td_op_clone', 'td_op_copy_paste',
    'td_connect', 'td_disconnect', 'td_bypass', 'td_cleanup',
    'td_par_get', 'td_par_set', 'td_par_list', 'td_par_menu', 'td_par_defaults', 'td_par_export', 'td_par_import',
    'td_inspect', 'td_browse', 'td_search', 'td_tree', 'td_pulse',
    'td_execute_python', 'td_run_file',
    'td_ui_message', 'td_ui_dialog', 'td_ui_color_picker',
    'td_data_table', 'td_data_to_json', 'td_data_from_json',
    'td_project_lifecycle', 'td_snapshot_scene', 'td_memory_save', 'td_memory_recall',
    'td_batch', 'td_knowledge_query',
    'td_history', 'td_history_summary', 'td_history_diff',
    'td_watchdog', 'td_watchdog_clear',
    'td_runner_create', 'td_runner_execute', 'td_runner_status', 'td_runner_stop',
];

async function listTools() {
    const channel = getOutputChannel();
    channel.show(true);

    if (serverProcess) {
        channel.appendLine(`[MCP-TD] Server is RUNNING (PID: ${serverProcess.pid})`);
        channel.appendLine('[MCP-TD] Tools loaded:');
        // Try to get tools list via MCP tools/list
        if (serverProcess.stdin) {
            const request = JSON.stringify({
                jsonrpc: '2.0',
                id: 'list-tools-' + Date.now(),
                method: 'tools/list',
                params: {},
            });
            let responseData = '';
            const onData = (data: Buffer) => { responseData += data.toString(); };
            serverProcess.stdout?.on('data', onData);
            serverProcess.stdin.write(request + '\n');
            await new Promise((r) => setTimeout(r, 800));
            serverProcess.stdout?.removeListener('data', onData);

            if (responseData) {
                try {
                    const parsed = JSON.parse(responseData);
                    if (parsed.result?.tools) {
                        const items: vscode.QuickPickItem[] = parsed.result.tools.map((t: any) => ({
                            label: t.name,
                            description: t.description || '',
                        }));
                        const pick = await vscode.window.showQuickPick(items, {
                            placeHolder: `Select a tool (${items.length} available)`,
                            matchOnDescription: true,
                        });
                        if (pick) {
                            channel.appendLine(`  - ${pick.label}: ${pick.description}`);
                        }
                        return;
                    }
                } catch { /* fall through */ }
            }
        }
    }

    // Fallback: show known list
    const items = KNOWN_TOOLS.map((name) => ({
        label: name,
        description: '',
    }));
    const pick = await vscode.window.showQuickPick(items, {
        placeHolder: `Known tools (${items.length}) — server not running`,
        matchOnDescription: true,
    });
    if (pick) {
        channel.appendLine(`  - ${pick.label}`);
    }
}
