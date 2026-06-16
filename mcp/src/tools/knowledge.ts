import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TDClient } from "td-api";
import { z } from "zod";
import { ok, err } from "../helpers.js";
import { queryPops, loadPopsIndex } from "../popsDb.js";
import { TdFamilySchema, queryOps, loadOpsIndex } from "../opsDb.js";
import { queryTemplates } from "../templatesDb.js";
import { resolveSemanticTerms } from "../semantic.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function registerKnowledgeTools(server: McpServer, client: TDClient) {
  // ---------------------------------------------------------------------------
  // td_pops_query
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_pops_query",
    {
      title: "Query POPs Knowledge Base",
      description:
        "Search the local POPs knowledge base or fetch a specific operator doc by page slug (e.g. Particle_POP).",
      inputSchema: {
        search: z.string().optional().describe("Search string"),
        page_slug: z.string().optional().describe("Exact page slug (e.g. Particle_POP)"),
        limit: z.number().int().min(1).max(50).optional().describe("Max results"),
      },
    },
    async ({ search, page_slug, limit }) => {
      try {
        const result = await queryPops({ search, pageSlug: page_slug, limit });
        return ok(result);
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_ops_query
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_ops_query",
    {
      title: "Query Operator Knowledge Base (TOP/CHOP/SOP/DAT)",
      description:
        "Search the local operator knowledge base (TOP/CHOP/SOP/DAT) or fetch a specific operator doc by family+page slug (e.g. TOP + Noise_TOP).",
      inputSchema: {
        search: z.string().optional().describe("Search string"),
        family: TdFamilySchema.optional().describe("Operator family: TOP|CHOP|SOP|DAT"),
        page_slug: z.string().optional().describe("Exact page slug (e.g. Noise_TOP)"),
        limit: z.number().int().min(1).max(50).optional().describe("Max results"),
      },
    },
    async ({ search, family, page_slug, limit }) => {
      try {
        const result = await queryOps({ search, family, pageSlug: page_slug, limit });
        return ok(result);
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_templates_query
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_templates_query",
    {
      title: "Query Project Templates",
      description:
        "Search reusable patterns and project-specific markdown templates inside Toe_Expand documentation.",
      inputSchema: {
        search: z.string().describe("Search phrase"),
        project: z.string().optional().describe("Optional project filter"),
        limit: z.number().int().min(1).max(50).optional().describe("Max results"),
      },
    },
    async ({ search, project, limit }) => {
      try {
        const result = await queryTemplates({ search, project, limit });
        return ok(result);
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_alias_resolve
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_alias_resolve",
    {
      title: "Resolve Semantic Aliases",
      description:
        "Resolve prompt vocabulary like feedback loop, life, size, cd or direction into canonical TouchDesigner parameters, attributes and family hints.",
      inputSchema: {
        text: z.string().describe("Natural language text or prompt"),
      },
    },
    async ({ text }) => {
      try {
        const result = resolveSemanticTerms(text);
        return ok(result);
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_get_param_help
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_get_param_help",
    {
      title: "Get Parameter Help",
      description:
        "Look up the available parameters for a TouchDesigner operator type (e.g. 'noiseTOP') from the local knowledge base.",
      inputSchema: {
        type: z
          .string()
          .describe(
            "Operator type to look up (e.g. 'noiseTOP', 'constantCHOP', 'mergeSOP', 'textDAT')"
          ),
      },
    },
    async ({ type }) => {
      try {
        const opType = type;
        // Map the opType to a family and pageSlug by scanning the ops index
        const index = await loadOpsIndex();
        const ops = index.operators || [];
        const matching = ops.filter(
          (op) => op.tdOpTypeGuess?.toLowerCase() === opType.toLowerCase()
            || op.pageSlug?.toLowerCase() === opType.toLowerCase()
        );

        // Also search POPs index for this operator type
        let popMatch = null;
        try {
          const popsIndex = await loadPopsIndex();
          const pops = popsIndex.operators || [];
          const popsMatches = pops.filter(
            (op) => op.tdOpTypeGuess?.toLowerCase() === opType.toLowerCase()
              || op.pageSlug?.toLowerCase() === opType.toLowerCase()
          );
          if (popsMatches.length > 0) {
            popMatch = popsMatches[0];
          }
        } catch {
          // POPs index not available; fallback: search ops index for POPs
          const popCandidates = ops.filter(
            (op) =>
              op.pageSlug?.toUpperCase().includes("POP") &&
              (op.tdOpTypeGuess?.toLowerCase() === opType.toLowerCase() ||
                op.pageSlug?.toLowerCase() === opType.toLowerCase())
          );
          if (popCandidates.length > 0) {
            popMatch = popCandidates[0];
          }
        }

        if (matching.length === 0 && !popMatch) {
          return ok({
            found: false,
            type: opType,
            message: `No operator found for type '${opType}' in the local knowledge base. Try searching with td_ops_query to find the correct type name.`,
            hint: "Operator types follow the pattern: noiseTOP, constantCHOP, mergeSOP, textDAT, etc.",
          });
        }

        const match = matching.length > 0 ? matching[0] : null;
        const isPop = !match && popMatch !== null;

        if (isPop) {
          // POP operator: load from pops data path
          const __dirname = path.dirname(fileURLToPath(import.meta.url));
          const docPath = path.join(
            __dirname,
            "../data/pops/operators",
            `${popMatch!.pageSlug}.json`
          );

          let doc: Record<string, unknown>;
          try {
            const raw = await fs.readFile(docPath, "utf8");
            doc = JSON.parse(raw);
          } catch {
            return ok({
              found: true,
              type: opType,
              family: "POP",
              pageTitle: popMatch!.pageTitle,
              url: popMatch!.url,
              note: "Full parameter details not available in local database for this operator.",
            });
          }

          return ok({
            found: true,
            type: opType,
            family: "POP",
            pageTitle: doc.pageTitle,
            url: doc.url,
            summary: typeof doc.summary === "string" ? doc.summary.substring(0, 1000) : "",
            parameters: doc.parameters ?? [],
            inputs: doc.inputs ?? [],
            attributes: doc.attributes ?? [],
          });
        }

        // Regular TOP/CHOP/SOP/DAT operator
        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        const docPath = path.join(
          __dirname,
          "../data/ops/operators",
          match!.family,
          `${match!.pageSlug}.json`
        );

        let doc: Record<string, unknown>;
        try {
          const raw = await fs.readFile(docPath, "utf8");
          doc = JSON.parse(raw);
        } catch {
          return ok({
            found: true,
            type: opType,
            family: match!.family,
            pageTitle: match!.pageTitle,
            url: match!.url,
            note: "Full parameter details not available in local database for this operator.",
          });
        }

        return ok({
          found: true,
          type: opType,
          family: doc.family,
          pageTitle: doc.pageTitle,
          url: doc.url,
          summary: typeof doc.summary === "string" ? doc.summary.substring(0, 1000) : "",
          parameters: doc.parameters ?? [],
          inputs: doc.inputs ?? [],
          attributes: doc.attributes ?? [],
        });
      } catch (e: any) {
        return ok({
          found: false,
          type: type,
          error: e instanceof Error ? e.message : String(e),
          message: `Could not look up operator type '${type}' from the local knowledge base.`,
        });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_search_official_docs
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_search_official_docs",
    {
      title: "Search Official TD Docs",
      description:
        "Search TouchDesigner's built-in offline help for operator documentation, parameter info, and usage summaries.",
      inputSchema: {
        query: z.string().describe("Search query (operator name or keyword)"),
        limit: z.number().optional().default(5).describe("Max results"),
      },
    },
    async ({ query, limit }) => {
      try {
        const result = await client.searchOfficialDocs(query, limit ?? 5);
        return ok(result);
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_export_network
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_export_network",
    {
      title: "Export Network as Python Code, Diff, or JSON",
      description:
        "Generate Python code, a simplified git-diff, or a JSON snapshot that captures the structure of a TouchDesigner network. Introspects the children of a container operator and produces output in the requested format.",
      inputSchema: {
        path: z
          .string()
          .describe("Container operator path to export (e.g. '/project1/myContainer')"),
        format: z
          .enum(["python", "diff", "json"])
          .optional()
          .default("python")
          .describe("Output format: 'python' (default) for recreatable Python code, 'diff' for a compact git-diff-style summary, 'json' for the full network structure as JSON"),
      },
    },
    async ({ path: containerPath, format }) => {
      try {
        // Execute Python inside TD that walks children and generates recreate code
        const code = `import json
try:
    container = op('${containerPath.replace(/'/g, "\\\\'")}')
    if container is None:
        print(json.dumps({'success': False, 'error': 'Container not found'}))
    else:
        lines = []
        lines.append('# Auto-generated by td_export_network')
        lines.append(f'# Source: {container.path}')
        lines.append('')

        def walk_children(parent, depth=0):
            indent = '    ' * depth
            items = []
            try:
                for child in parent.children:
                    if child is None:
                        continue
                    info = {
                        'path': child.path,
                        'name': child.name,
                        'type': child.OPType,
                        'parentPath': parent.path,
                    }
                    # Collect parameter overrides (non-default)
                    pars = []
                    try:
                        for p in child.pars:
                            try:
                                default = getattr(p, 'default', None)
                                mode = str(p.mode)
                                val = p.val
                                expr = p.expr if p.isExpression else None
                                pars.append({
                                    'name': p.name,
                                    'val': val,
                                    'expr': expr,
                                    'mode': mode,
                                    'default': default,
                                })
                            except:
                                pass
                    except:
                        pass
                    info['pars'] = pars

                    # Collect input connections
                    inputs = []
                    try:
                        for idx, conn in enumerate(child.inputConnectors):
                            try:
                                src = conn.op
                                if src:
                                    inputs.append({
                                        'index': idx,
                                        'sourcePath': src.path,
                                        'sourceName': src.name,
                                    })
                            except:
                                pass
                    except:
                        pass
                    info['inputs'] = inputs

                    # Collect children recursively
                    children = []
                    try:
                        children = walk_children(child, depth + 1)
                    except:
                        pass
                    info['children'] = children

                    items.append(info)
            except:
                pass
            return items

        network = walk_children(container)
        print(json.dumps({'success': True, 'path': container.path, 'network': network}))
except Exception as e:
    print(json.dumps({'success': False, 'error': str(e)}))`;

        const result = await client.execute(code, "/");
        if (!result.success) {
          const msg = result.error?.message ?? result.stderr ?? "Unknown error";
          return err(msg);
        }

        const parsed = JSON.parse(result.stdout.trim());
        if (!parsed.success) {
          return err(parsed.error ?? "Export failed");
        }

        // Generate output from the introspected network
        const network = parsed.network;

        // Collect all nodes flat
        const allNodes: any[] = [];
        function collectNodes(items: any[], parentPath: string) {
          for (const item of items) {
            allNodes.push(item);
            if (item.children && item.children.length > 0) {
              collectNodes(item.children, item.path);
            }
          }
        }
        collectNodes(network, parsed.path);

        if (format === "json") {
          // Full JSON export
          return ok({
            path: parsed.path,
            nodeCount: allNodes.length,
            format: "json",
            network: parsed.network,
          });
        }

        if (format === "diff") {
          // Simplified git-diff output à la embody/dylanroscover
          const diffLines: string[] = [];
          diffLines.push(`# Git-diff network export`);
          diffLines.push(`# Source container: ${parsed.path}`);
          diffLines.push(`# Generated: ${new Date().toISOString()}`);
          diffLines.push("");

          for (const node of allNodes) {
            const relPath = node.path;
            const typeName = node.type || "?";
            const nodeName = node.name;

            // Created node: + path type name
            diffLines.push(`+ ${relPath} ${typeName} ${nodeName}`);

            // Modified parameters: ~ path par=val
            if (node.pars && node.pars.length > 0) {
              for (const p of node.pars) {
                const valStr = p.expr ? `expr=${p.expr}` : `val=${JSON.stringify(p.val)}`;
                diffLines.push(`~ ${relPath} ${p.name}=${valStr}`);
              }
            }

            // Connections: > sourcePath -> targetPath
            if (node.inputs && node.inputs.length > 0) {
              for (const inp of node.inputs) {
                if (inp.sourcePath) {
                  diffLines.push(`> ${inp.sourcePath} -> ${relPath} (input ${inp.index})`);
                }
              }
            }
          }

          const diffOutput = diffLines.join("\n");
          return ok({
            path: parsed.path,
            nodeCount: allNodes.length,
            format: "diff",
            diff: diffOutput,
          });
        }

        // ── default: python format ──
        let pythonLines: string[] = [];
        pythonLines.push("# Auto-generated TouchDesigner network recreate script");
        pythonLines.push(`# Source container: ${parsed.path}`);
        pythonLines.push("");
        pythonLines.push("import json");
        pythonLines.push("");
        pythonLines.push("");
        pythonLines.push("def recreate_network(parent_path, container_name):");
        pythonLines.push('    """Create the exported network inside parent_path."""');
        pythonLines.push(`    parent = op(parent_path)`);
        pythonLines.push(`    if parent is None:`);
        pythonLines.push(`        raise ValueError(f"Parent not found: {parent_path}")`);
        pythonLines.push(`    container = parent.create(container_name)`);
        pythonLines.push(`    return container`);
        pythonLines.push("");

        // Create all nodes
        pythonLines.push("# Create all nodes");
        pythonLines.push("def create_nodes(container):");
        for (const node of allNodes) {
          const relName = node.name;
          const typeName = node.type;
          if (node.children && node.children.length > 0) {
            pythonLines.push(`    # ${node.path} (container)`);
            pythonLines.push(`    ${relName} = container.create(${typeName}, '${relName}')`);
          } else {
            pythonLines.push(`    ${relName} = container.create(${typeName}, '${relName}')`);
          }
        }
        pythonLines.push("");

        // Connect nodes
        pythonLines.push("# Connect nodes");
        pythonLines.push("def connect_nodes(container):");
        for (const node of allNodes) {
          if (node.inputs && node.inputs.length > 0) {
            for (const inp of node.inputs) {
              if (inp.sourcePath) {
                const srcName = inp.sourceName;
                const tgtName = node.name;
                pythonLines.push(`    # ${srcName} -> ${tgtName} (input ${inp.index})`);
                pythonLines.push(`    try:`);
                const srcNode = allNodes.find((n: any) => n.name === srcName);
                if (srcNode) {
                  pythonLines.push(`        src = op(container.path + '/${srcName}')`);
                  pythonLines.push(`        tgt = op(container.path + '/${tgtName}')`);
                  pythonLines.push(`        tgt.inputConnectors[${inp.index}].connect(src)`);
                } else {
                  pythonLines.push(`        pass  # source not in exported scope`);
                }
                pythonLines.push(`    except Exception as e:`);
                pythonLines.push(`        print(f"Could not connect ${srcName} -> ${tgtName}: {e}")`);
              }
            }
          }
        }
        pythonLines.push("");

        // Set parameter overrides
        pythonLines.push("# Set parameter overrides (non-default values)");
        pythonLines.push("def set_parameters(container):");
        for (const node of allNodes) {
          if (node.pars && node.pars.length > 0) {
            const nonDefaultPars = node.pars.filter(
              (p: any) => JSON.stringify(p.val) !== JSON.stringify(p.default),
            );
            if (nonDefaultPars.length > 0) {
              pythonLines.push(`    # ${node.name} parameters`);
              for (const p of nonDefaultPars) {
                const safeVal = JSON.stringify(p.val);
                if (p.expr) {
                  pythonLines.push(`    try:`);
                  pythonLines.push(`        op(container.path + '/${node.name}').par.${p.name}.expr = ${JSON.stringify(p.expr)}`);
                  pythonLines.push(`    except: pass`);
                } else {
                  pythonLines.push(`    try:`);
                  pythonLines.push(`        op(container.path + '/${node.name}').par.${p.name}.val = ${safeVal}`);
                  pythonLines.push(`    except: pass`);
                }
              }
            }
          }
        }
        pythonLines.push("");

        // Main
        pythonLines.push('# Main execution');
        pythonLines.push('if __name__ == "__main__":');
        pythonLines.push(`    container = recreate_network("/", "${parsed.path.split('/').pop() || 'exported_network'}")`);
        pythonLines.push("    create_nodes(container)");
        pythonLines.push("    connect_nodes(container)");
        pythonLines.push("    set_parameters(container)");
        pythonLines.push('    print(f"Network recreated at {container.path}")');

        const pythonCode = pythonLines.join("\n");

        return ok({
          path: parsed.path,
          nodeCount: allNodes.length,
          format: "python",
          python: pythonCode,
        });
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_list_tutorials
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_list_tutorials",
    {
      title: "List Tutorials",
      description:
        "List available TouchDesigner tutorials. Filter by category (audio, glow, feedback, particles, shader) and/or difficulty (beginner, intermediate, advanced).",
      inputSchema: {
        category: z.string().optional().describe("Filter by category (e.g. audio, glow, feedback, particles, shader)"),
        difficulty: z.string().optional().describe("Filter by difficulty (beginner, intermediate, advanced)"),
      },
    },
    async ({ category, difficulty }) => {
      try {
        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        const tutorialsDir = path.join(__dirname, "../data/tutorials");
        
        let files: string[];
        try {
          files = await fs.readdir(tutorialsDir);
        } catch {
          return ok({ tutorials: [], total: 0, message: "Tutorials directory not found." });
        }
        
        const mdFiles = files.filter((f) => f.endsWith(".md"));
        const tutorials: any[] = [];
        
        for (const file of mdFiles) {
          const content = await fs.readFile(path.join(tutorialsDir, file), "utf8");
          // Simple frontmatter parser (YAML between --- markers)
          const frontMatch = content.match(/^---\n([\s\S]*?)\n---/);
          if (!frontMatch) continue;
          
          const frontStr = frontMatch[1];
          // Parse simple YAML key-value pairs
          const meta: Record<string, any> = {};
          for (const line of frontStr.split("\n")) {
            const colonIdx = line.indexOf(":");
            if (colonIdx === -1) continue;
            const key = line.slice(0, colonIdx).trim();
            let val: any = line.slice(colonIdx + 1).trim();
            
            // Parse arrays
            if (val.startsWith("[")) {
              try { val = JSON.parse(val.replace(/'/g, '"')); } catch { /* keep as string */ }
            }
            // Parse booleans
            else if (val === "true") val = true;
            else if (val === "false") val = false;
            // Keep as string
            
            meta[key] = val;
          }
          
          const name = file.replace(/\.md$/, "");
          tutorials.push({
            name,
            file,
            ...meta,
          });
        }
        
        // Apply filters
        let filtered = tutorials;
        if (category) {
          const catLower = category.toLowerCase();
          filtered = filtered.filter((t) => {
            const cat = t.category?.toLowerCase() || "";
            return cat === catLower || cat.includes(catLower);
          });
        }
        if (difficulty) {
          const diffLower = difficulty.toLowerCase();
          filtered = filtered.filter((t) => {
            const d = t.difficulty?.toLowerCase() || "";
            return d === diffLower || d.includes(diffLower);
          });
        }
        
        return ok({
          tutorials: filtered.map((t) => ({
            name: t.name,
            title: t.title,
            category: t.category,
            difficulty: t.difficulty,
            keywords: t.keywords,
            duration: t.duration,
            requires_td: t.requires_td,
          })),
          total: filtered.length,
        });
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_get_tutorial
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_get_tutorial",
    {
      title: "Get Tutorial Content",
      description:
        "Get the full markdown content of a tutorial by its name (filename without .md extension). Use td_list_tutorials to find available tutorials.",
      inputSchema: {
        name: z.string().describe("Tutorial name (filename without .md, e.g. 'audio-reactive', 'bloom-effect')"),
      },
    },
    async ({ name }) => {
      try {
        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        const filePath = path.join(__dirname, "../data/tutorials", `${name}.md`);
        
        let content: string;
        try {
          content = await fs.readFile(filePath, "utf8");
        } catch {
          return ok({ found: false, message: `Tutorial '${name}' not found. Use td_list_tutorials to see available tutorials.` });
        }
        
        return ok({
          found: true,
          name,
          content,
        });
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_list_workflows
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_list_workflows",
    {
      title: "List Workflows",
      description:
        "List available reusable TouchDesigner workflow patterns. Filter by category (color, blur, keying, feedback, audio, transform, analyze) and/or difficulty (beginner, intermediate, advanced).",
      inputSchema: {
        category: z.string().optional().describe("Filter by category (e.g. color, blur, keying, feedback, audio, transform, analyze)"),
        difficulty: z.string().optional().describe("Filter by difficulty (beginner, intermediate, advanced)"),
      },
    },
    async ({ category, difficulty }) => {
      try {
        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        const workflowsDir = path.join(__dirname, "../data/workflows");
        
        let files: string[];
        try {
          files = await fs.readdir(workflowsDir);
        } catch {
          return ok({ workflows: [], total: 0, message: "Workflows directory not found." });
        }
        
        const mdFiles = files.filter((f) => f.endsWith(".md"));
        const workflows: any[] = [];
        
        for (const file of mdFiles) {
          const content = await fs.readFile(path.join(workflowsDir, file), "utf8");
          const frontMatch = content.match(/^---\n([\s\S]*?)\n---/);
          if (!frontMatch) continue;
          
          const frontStr = frontMatch[1];
          const meta: Record<string, any> = {};
          for (const line of frontStr.split("\n")) {
            const colonIdx = line.indexOf(":");
            if (colonIdx === -1) continue;
            const key = line.slice(0, colonIdx).trim();
            let val: any = line.slice(colonIdx + 1).trim();
            
            if (val.startsWith("[")) {
              try { val = JSON.parse(val.replace(/'/g, '"')); } catch { /* keep as string */ }
            } else if (val === "true") val = true;
            else if (val === "false") val = false;
            
            meta[key] = val;
          }
          
          const name = file.replace(/\.md$/, "");
          workflows.push({
            name,
            file,
            ...meta,
          });
        }
        
        let filtered = workflows;
        if (category) {
          const catLower = category.toLowerCase();
          filtered = filtered.filter((w) => {
            const cat = w.category?.toLowerCase() || "";
            return cat === catLower || cat.includes(catLower);
          });
        }
        if (difficulty) {
          const diffLower = difficulty.toLowerCase();
          filtered = filtered.filter((w) => {
            const d = w.difficulty?.toLowerCase() || "";
            return d === diffLower || d.includes(diffLower);
          });
        }
        
        return ok({
          workflows: filtered.map((w) => ({
            name: w.name,
            title: w.title,
            category: w.category,
            difficulty: w.difficulty,
            keywords: w.keywords,
            duration: w.duration,
            requires_td: w.requires_td,
          })),
          total: filtered.length,
        });
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_get_workflow
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_get_workflow",
    {
      title: "Get Workflow Content",
      description:
        "Get the full markdown content of a workflow by its name (filename without .md extension). Use td_list_workflows to find available workflows.",
      inputSchema: {
        name: z.string().describe("Workflow name (filename without .md, e.g. 'color-correction', 'motion-blur')"),
      },
    },
    async ({ name }) => {
      try {
        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        const filePath = path.join(__dirname, "../data/workflows", `${name}.md`);
        
        let content: string;
        try {
          content = await fs.readFile(filePath, "utf8");
        } catch {
          return ok({ found: false, message: `Workflow '${name}' not found. Use td_list_workflows to see available workflows.` });
        }
        
        return ok({
          found: true,
          name,
          content,
        });
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_get_td_classes
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_get_td_classes",
    {
      title: "List TD Operator Classes",
      description:
        "List all TouchDesigner operator classes from the local knowledge base, organized by family (TOP, CHOP, SOP, DAT, POP, COMP). Each class includes its page title, slug, URL, and optional tdOpTypeGuess.",
      inputSchema: {
        family: z.string().optional().describe("Filter by family: TOP, CHOP, SOP, DAT, POP, or COMP"),
        search: z.string().optional().describe("Search within class names and descriptions"),
        limit: z.number().int().min(1).max(200).optional().describe("Max results per family (default 50)"),
      },
    },
    async ({ family, search, limit }) => {
      try {
        const maxLimit = limit ?? 50;
        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        
        // Load ops index (TOP, CHOP, SOP, DAT)
        const opsIndex = await loadOpsIndex();
        
        // Load pops index (POP)
        let popsIndex: { operators: any[] } = { operators: [] };
        try {
          popsIndex = await loadPopsIndex();
        } catch {
          // POPs index not available
        }
        
        // Families and their operators
        const families: Record<string, any[]> = {};
        
        // Group ops by family
        for (const op of opsIndex.operators || []) {
          const fam = op.family || "UNKNOWN";
          if (!families[fam]) families[fam] = [];
          families[fam].push({
            pageTitle: op.pageTitle,
            pageSlug: op.pageSlug,
            tdOpTypeGuess: op.tdOpTypeGuess,
            url: op.url,
            summary: op.summary ? op.summary.substring(0, 200) : undefined,
          });
        }
        
        // Add POP family
        families["POP"] = (popsIndex.operators || []).map((op: any) => ({
          pageTitle: op.pageTitle,
          pageSlug: op.pageSlug,
          tdOpTypeGuess: op.tdOpTypeGuess,
          url: op.url,
          experimental: op.experimental,
        }));
        
        // Apply filters
        const filtered: Record<string, any[]> = {};
        const familiesToInclude = family
          ? [family.toUpperCase()]
          : Object.keys(families).sort();
        
        for (const fam of familiesToInclude) {
          if (!families[fam]) continue;
          
          let ops = families[fam];
          
          if (search) {
            const q = search.toLowerCase();
            ops = ops.filter((op: any) =>
              (op.pageTitle?.toLowerCase() || "").includes(q) ||
              (op.tdOpTypeGuess?.toLowerCase() || "").includes(q) ||
              (op.pageSlug?.toLowerCase() || "").includes(q) ||
              (op.summary?.toLowerCase() || "").includes(q)
            );
          }
          
          filtered[fam] = ops.slice(0, maxLimit);
        }
        
        // Build summary counts
        const summary: Record<string, number> = {};
        const familiesToShow = family ? [family.toUpperCase()] : Object.keys(families).sort();
        for (const fam of familiesToShow) {
          if (families[fam]) {
            summary[fam] = families[fam].length;
          }
        }
        
        return ok({
          families: filtered,
          counts: summary,
          filtered: family ? true : false,
          searched: search ? true : false,
        });
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_get_module_help
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_get_module_help",
    {
      title: "Get Operator Documentation",
      description:
        "Look up detailed documentation for a specific TouchDesigner operator by its page slug or tdOpTypeGuess. Searches both the main operator index (TOP/CHOP/SOP/DAT) and POPs index (POP). Returns parameter details, inputs, attributes, and usage examples.",
      inputSchema: {
        name: z.string().describe("Operator page slug (e.g. 'Noise_TOP') or tdOpTypeGuess (e.g. 'noiseTOP')"),
      },
    },
    async ({ name }) => {
      try {
        const opType = name;
        
        // Search ops index first
        const index = await loadOpsIndex();
        const ops = index.operators || [];
        const matching = ops.filter(
          (op: any) =>
            (op.tdOpTypeGuess?.toLowerCase() || "") === opType.toLowerCase() ||
            (op.pageSlug?.toLowerCase() || "") === opType.toLowerCase()
        );
        
        // Search POPs index
        let popMatch: any = null;
        try {
          const popsIndex = await loadPopsIndex();
          const pops = popsIndex.operators || [];
          const popsMatches = pops.filter(
            (op: any) =>
              (op.tdOpTypeGuess?.toLowerCase() || "") === opType.toLowerCase() ||
              (op.pageSlug?.toLowerCase() || "") === opType.toLowerCase()
          );
          if (popsMatches.length > 0) {
            popMatch = popsMatches[0];
          }
        } catch {
          // POPs index not available
        }
        
        if (matching.length === 0 && !popMatch) {
          return ok({
            found: false,
            name: opType,
            message: `No operator found for '${opType}' in the local knowledge base. Try td_get_td_classes to list available operators.`,
            hint: "Operator types follow the pattern: noiseTOP, constantCHOP, mergeSOP, textDAT, accumulatePOP, etc.",
          });
        }
        
        const match = matching.length > 0 ? matching[0] : null;
        const isPop = !match && popMatch !== null;
        
        if (isPop) {
          // Load POP operator doc
          const __dirname = path.dirname(fileURLToPath(import.meta.url));
          const docPath = path.join(
            __dirname,
            "../data/pops/operators",
            `${popMatch!.pageSlug}.json`
          );
          
          let doc: Record<string, unknown>;
          try {
            const raw = await fs.readFile(docPath, "utf8");
            doc = JSON.parse(raw);
          } catch {
            return ok({
              found: true,
              name: opType,
              family: "POP",
              pageTitle: popMatch!.pageTitle,
              url: popMatch!.url,
              note: "Full operator doc JSON not available locally for this operator.",
            });
          }
          
          return ok({
            found: true,
            name: opType,
            family: "POP",
            pageTitle: doc.pageTitle,
            pageSlug: doc.pageSlug,
            url: doc.url,
            tdOpTypeGuess: doc.tdOpTypeGuess,
            summary: typeof doc.summary === "string" ? doc.summary.substring(0, 2000) : "",
            parameters: doc.parameters ?? [],
            inputs: doc.inputs ?? [],
            attributes: doc.attributes ?? [],
            examples: doc.examples ?? [],
            commonCombinations: doc.commonCombinations ?? [],
            troubleshooting: doc.troubleshooting ?? [],
            localNotes: doc.localNotes ?? [],
          });
        }
        
        // Regular TOP/CHOP/SOP/DAT operator
        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        const docPath = path.join(
          __dirname,
          "../data/ops/operators",
          match!.family,
          `${match!.pageSlug}.json`
        );
        
        let doc: Record<string, unknown>;
        try {
          const raw = await fs.readFile(docPath, "utf8");
          doc = JSON.parse(raw);
        } catch {
          return ok({
            found: true,
            name: opType,
            family: match!.family,
            pageTitle: match!.pageTitle,
            url: match!.url,
            note: "Full operator doc JSON not available locally for this operator.",
          });
        }
        
        return ok({
          found: true,
          name: opType,
          family: doc.family ?? match!.family,
          pageTitle: doc.pageTitle ?? match!.pageTitle,
          pageSlug: doc.pageSlug ?? match!.pageSlug,
          url: doc.url ?? match!.url,
          tdOpTypeGuess: doc.tdOpTypeGuess ?? match!.tdOpTypeGuess,
          summary: typeof doc.summary === "string" ? doc.summary.substring(0, 2000) : "",
          parameters: doc.parameters ?? [],
          inputs: doc.inputs ?? [],
          attributes: doc.attributes ?? [],
          examples: doc.examples ?? [],
          commonCombinations: doc.commonCombinations ?? [],
          troubleshooting: doc.troubleshooting ?? [],
          localNotes: doc.localNotes ?? [],
        });
      } catch (e: any) {
        return ok({
          found: false,
          name: name,
          error: e instanceof Error ? e.message : String(e),
          message: `Could not look up operator '${name}' from the local knowledge base.`,
        });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_compare_mcps — comparativa de servidores MCP (mejora 7)
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_compare_mcps",
    {
      title: "Compare MCP Servers (vs TWOZERO & co.)",
      description:
        "Compare this TouchDesigner MCP against other existing MCPs and tools " +
        "like TWOZERO. Returns a hardcoded comparison table of features, " +
        "capabilities, and scope. Optionally filter by a specific server name.",
      inputSchema: {
        server: z
          .string()
          .optional()
          .describe("Filter by server name (e.g. 'TWOZERO', 'hermes', 'this_mcp')"),
      },
    },
    async ({ server }) => {
      try {
        // Hardcoded comparison data derived from data/docs/03-twozero-evaluation.md
        const comparisonData = [
          {
            server: "TWOZERO",
            native_td: true,
            code_generation: false,
            knowledge_base: false,
            component_library: true,
            cloud_sync: true,
            production_tools: true,
            embedded_ui: true,
            mcp_protocol: false,
            notes: "Toolkit nativo con UI embebida, librería curada de componentes, sync en la nube. Sin generación por IA ni MCP.",
          },
          {
            server: "this_mcp",
            native_td: true,
            code_generation: true,
            knowledge_base: true,
            component_library: true,
            cloud_sync: false,
            production_tools: true,
            embedded_ui: false,
            mcp_protocol: true,
            notes: "MCP server completo con skills en Markdown, prompts maestros, scripts Python idempotentes, BD de conocimiento versionada (JSON+MD). Sin sync nube ni UI integrada.",
          },
          {
            server: "hermes_agent",
            native_td: false,
            code_generation: true,
            knowledge_base: true,
            component_library: false,
            cloud_sync: true,
            production_tools: false,
            embedded_ui: false,
            mcp_protocol: true,
            notes: "Agente MCP multi-herramienta con memoria, skills, plugins. No es específico de TD; puede delegar en this_mcp para operaciones TD.",
          },
          {
            server: "notebooklm",
            native_td: false,
            code_generation: false,
            knowledge_base: true,
            component_library: false,
            cloud_sync: true,
            production_tools: false,
            embedded_ui: false,
            mcp_protocol: true,
            notes: "MCP server de Google NotebookLM. Documentación y estudio, no tiene integración con TouchDesigner.",
          },
          {
            server: "blender_mcp",
            native_td: false,
            code_generation: true,
            knowledge_base: false,
            component_library: false,
            cloud_sync: false,
            production_tools: true,
            embedded_ui: false,
            mcp_protocol: true,
            notes: "MCP server para Blender 3D. Generación y edición de assets 3D, descarga de modelos. Específico de Blender, no TD.",
          },
        ];

        const categories = [
          { key: "native_td", label: "Nativo TouchDesigner" },
          { key: "code_generation", label: "Generación por IA/scripts" },
          { key: "knowledge_base", label: "Base de conocimiento local" },
          { key: "component_library", label: "Librería de componentes/patrones" },
          { key: "cloud_sync", label: "Sincronización en la nube" },
          { key: "production_tools", label: "Herramientas de producción" },
          { key: "embedded_ui", label: "UI embebida" },
          { key: "mcp_protocol", label: "Protocolo MCP estándar" },
        ];

        let filtered = comparisonData;
        if (server) {
          const q = server.toLowerCase();
          filtered = comparisonData.filter((s) => s.server.toLowerCase().includes(q));
          if (filtered.length === 0) {
            return ok({
              filtered: true,
              query: server,
              servers: comparisonData.map((s) => s.server),
              message: `No server found matching '${server}'. Available servers: ${comparisonData.map((s) => s.server).join(", ")}`,
            });
          }
        }

        // Build a human-readable comparison table
        const headers = ["Feature", ...filtered.map((s) => s.server)];
        const rows: string[][] = [];

        for (const cat of categories) {
          const row: string[] = [cat.label];
          for (const srv of filtered) {
            row.push((srv as unknown as Record<string, boolean>)[cat.key] ? "✅" : "❌");
          }
          rows.push(row);
        }

        // Compute column widths
        const colWidths = headers.map((h, i) => {
          let max = h.length;
          for (const row of rows) {
            if (row[i].length > max) max = row[i].length;
          }
          return max + 2;
        });

        const separator = headers
          .map((_, i) => "-".repeat(colWidths[i]))
          .join("|");

        const tableLines: string[] = [];
        tableLines.push(headers.map((h, i) => h.padEnd(colWidths[i])).join("|"));
        tableLines.push(separator);
        for (const row of rows) {
          tableLines.push(row.map((c, i) => c.padEnd(colWidths[i])).join("|"));
        }

        const table = tableLines.join("\n");

        // Notes per filtered server
        const notes = filtered.map((s) => `  - ${s.server}: ${s.notes}`).join("\n");

        return ok({
          filtered: !!server,
          query: server || null,
          servers: filtered.map((s) => s.server),
          comparison: filtered.map((s) => ({
            server: s.server,
            ...Object.fromEntries(categories.map((c) => [c.label, (s as unknown as Record<string, unknown>)[c.key]])),
            notes: s.notes,
          })),
          table,
          summary: `Comparativa de ${filtered.length} servidor(es):\n\n${table}\n\nNotas:\n${notes}`,
        });
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_run_prompt — prompts maestros (mejora 8)
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_run_prompt",
    {
      title: "Run Master Prompt",
      description:
        "Retrieve a master prompt by its ID. Master prompts are Markdown files " +
        "with YAML frontmatter stored in the prompts/ directory. They define " +
        "project types, complexity levels, performance budgets, and validation " +
        "criteria. Optional params object allows variable substitution in the " +
        "prompt content using {{variable}} placeholders.",
      inputSchema: {
        prompt_id: z
          .string()
          .describe(
            "Prompt ID (matches a .md file inside prompts/master/, e.g. 'particles-experto-feedback-sim')"
          ),
        params: z
          .record(z.string(), z.string())
          .optional()
          .describe(
            "Optional key-value pairs for {{variable}} substitution in the prompt content"
          ),
      },
    },
    async ({ prompt_id, params }) => {
      try {
        const __dirname = path.dirname(fileURLToPath(import.meta.url));

        // Search order: 1) prompts/master/<id>.md  2) data/tutorials/<id>.md
        const candidates = [
          path.join(__dirname, "../data/prompts/master", `${prompt_id}.md`),
          path.join(__dirname, "../data/tutorials", `${prompt_id}.md`),
        ];

        let content: string | null = null;
        let sourcePath: string | null = null;

        for (const candidate of candidates) {
          try {
            content = await fs.readFile(candidate, "utf8");
            sourcePath = candidate;
            break;
          } catch {
            // try next
          }
        }

        if (content === null) {
          // List available prompts for a helpful error
          const dirsToScan = [
            path.join(__dirname, "../data/prompts/master"),
            path.join(__dirname, "../data/tutorials"),
          ];

          const available: string[] = [];
          for (const dir of dirsToScan) {
            try {
              const files = await fs.readdir(dir);
              for (const f of files) {
                if (f.endsWith(".md")) {
                  available.push(f.replace(/\.md$/, ""));
                }
              }
            } catch {
              // directory doesn't exist
            }
          }

          return ok({
            found: false,
            prompt_id,
            message: `Prompt '${prompt_id}' not found.`,
            available: available.length > 0 ? available : [
              "particles-experto-feedback-sim",
              "audio-reactive",
              "bloom-effect",
              "feedback-loop",
              "glsl-shader",
              "particle-system",
              "pop-30-systems",
              "pop-complex-systems",
              "pop-interactive-hq",
            ],
          });
        }

        // Extract frontmatter if present
        let frontmatter: Record<string, any> = {};
        let body = content;

        const frontMatch = content.match(/^---\n([\s\S]*?)\n---\n?/);
        if (frontMatch) {
          const frontStr = frontMatch[1];
          body = content.slice(frontMatch[0].length);

          // Parse simple YAML key-value pairs
          for (const line of frontStr.split("\n")) {
            const colonIdx = line.indexOf(":");
            if (colonIdx === -1) continue;
            const key = line.slice(0, colonIdx).trim();
            let val: any = line.slice(colonIdx + 1).trim();

            if (val.startsWith("[")) {
              try {
                val = JSON.parse(val.replace(/'/g, '"'));
              } catch {
                /* keep as string */
              }
            } else if (val === "true") val = true;
            else if (val === "false") val = false;
            else if (!isNaN(Number(val))) val = Number(val);

            frontmatter[key] = val;
          }
        }

        // Perform variable substitution if params are provided
        let renderedBody = body;
        if (params && typeof params === "object") {
          for (const [key, value] of Object.entries(params)) {
            renderedBody = renderedBody.replace(
              new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g"),
              value
            );
          }
        }

        // Replace any leftover {{variables}} with a marker
        const unresolved: string[] = [];
        const variableRegex = /\{\{\s*(\w+)\s*\}\}/g;
        let match;
        while ((match = variableRegex.exec(renderedBody)) !== null) {
          unresolved.push(match[1]);
        }

        return ok({
          found: true,
          prompt_id,
          source: sourcePath,
          title: frontmatter.title || prompt_id,
          frontmatter,
          content: renderedBody,
          unresolved_variables: unresolved.length > 0 ? unresolved : undefined,
          note: unresolved.length > 0
            ? `The following variables were not replaced: ${unresolved.join(", ")}. Pass them via the 'params' object.`
            : undefined,
        });
      } catch (e: any) {
        return err(e);
      }
    }
  );
}
