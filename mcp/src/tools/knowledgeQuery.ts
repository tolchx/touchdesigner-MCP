import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TDClient } from "td-api";
import { z } from "zod";
import { ok, err } from "../helpers.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Load a knowledge document from Docs/ directory.
 */
async function loadDoc(docNum: number): Promise<string | null> {
  const docsDir = path.resolve(__dirname, "../../../..", "Docs");
  try {
    const files = await fs.readdir(docsDir);
    const match = files.find((f) => f.startsWith(`${docNum}-`));
    if (!match) return null;
    return await fs.readFile(path.join(docsDir, match), "utf8");
  } catch {
    return null;
  }
}

/**
 * Simple keyword search across a document's content.
 * Returns relevance score based on keyword frequency and proximity.
 */
function scoreDocument(content: string, queryTerms: string[]): number {
  const lower = content.toLowerCase();
  let score = 0;
  for (const term of queryTerms) {
    const idx = lower.indexOf(term.toLowerCase());
    if (idx !== -1) {
      score += 10;
      // Bonus for exact word match (not substring)
      const before = idx > 0 ? lower[idx - 1] : " ";
      const after = idx + term.length < lower.length ? lower[idx + term.length] : " ";
      if (!before.match(/\w/) && !after.match(/\w/)) {
        score += 5;
      }
    }
  }
  return score;
}

/**
 * Extract the most relevant section from a document given query terms.
 * Returns the section header + content (truncated to maxChars).
 */
function extractRelevantSection(
  content: string,
  queryTerms: string[],
  maxChars: number = 3000
): string {
  const sections = content.split(/^## /m);
  if (sections.length <= 1) {
    return content.substring(0, maxChars);
  }

  // Score each section
  let bestSection = "";
  let bestScore = 0;

  for (const section of sections) {
    const sectionScore = scoreDocument(section, queryTerms);
    if (sectionScore > bestScore) {
      bestScore = sectionScore;
      bestSection = section;
    }
  }

  if (bestScore === 0) {
    // Fallback: return first section
    return sections[0].substring(0, maxChars) || content.substring(0, maxChars);
  }

  return "## " + bestSection.substring(0, maxChars);
}

// Document metadata for all knowledge docs
const DOC_INDEX = [
  { num: 110, title: "TD Academy POPs Knowledge", topics: "fundamentals, attributes, generators, particles, transforms, rendering, performance" },
  { num: 111, title: "TD Academy Workflow Patterns", topics: "recipes, network patterns, workflow" },
  { num: 112, title: "TD Academy Advanced POPs", topics: "GLSL, forces, physics, rendering, workflows, performance, attributes, math, noise, interactivity" },
  { num: 113, title: "TD Academy GLSL Workflows", topics: "GLSL, shader, GLSL Advanced, GLSL Create, GLSL Copy, GLSL Select, vertex, pixel" },
  { num: 114, title: "TD Academy Advanced Simulation", topics: "installations, flocking, boids, fluid, SPH, fractals, Mandelbrot, Mandelbulb, hybrid workflows" },
  { num: 115, title: "TD 2025.30000 Release Notes", topics: "new POPs, Text, Trace, Triangulate, Alembic Out, Particle POP, Jitter, Pre-Roll, array attributes, Python functions, CUDA, DMX, backward compatibility" },
  { num: 116, title: "Official Docs POP Knowledge", topics: "Alembic In, Ray, Polygonize, Texture Map, Skin Deform, Trig, Plane, Topology, Attribute Convert" },
  { num: 117, title: "Official Docs More POPs", topics: "Blend, Connectivity, Facet, Delete, Group, Histogram, Normal, Proximity" },
  { num: 118, title: "Official Docs Remaining POPs", topics: "Accumulate, Copy, Convert, Random" },
];

/**
 * Register the td_knowledge_query tool.
 */
export function registerKnowledgeQueryTool(server: McpServer, client: TDClient) {
  server.registerTool(
    "td_knowledge_query",
    {
      title: "Query POP Knowledge Base",
      description:
        "Search across the comprehensive POP knowledge base (Docs/110-118) for relevant documentation on TouchDesigner POPs. Covers fundamentals, GLSL, forces, physics, rendering, workflows, new features, operator parameters, troubleshooting, and more. Returns the most relevant document sections matching the query.",
      inputSchema: {
        query: z
          .string()
          .describe(
            "Search query describing what POP knowledge you need (e.g. 'GLSL particle shader', 'boids flocking', 'Particle POP parameters')"
          ),
        doc: z
          .number()
          .int()
          .min(110)
          .max(118)
          .optional()
          .describe(
            "Optional specific document number (110-118) to search within. If omitted, searches all documents."
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(5)
          .optional()
          .default(3)
          .describe("Max number of document sections to return."),
      },
    },
    async ({ query, doc, limit }) => {
      try {
        const queryTerms = query
          .toLowerCase()
          .split(/\s+/)
          .filter((t) => t.length > 2);

        // Determine which documents to search
        const docsToSearch = doc
          ? DOC_INDEX.filter((d) => d.num === doc)
          : DOC_INDEX;

        if (docsToSearch.length === 0) {
          return ok({
            found: false,
            query,
            message: `No document found for doc number ${doc}. Valid range: 110-118.`,
          });
        }

        // Search each document
        const results: Array<{
          doc: number;
          title: string;
          topics: string;
          score: number;
          excerpt: string;
        }> = [];

        for (const docMeta of docsToSearch) {
          // Quick relevance check from topics
          const topicScore = scoreDocument(docMeta.topics, queryTerms);

          // Load full document
          const content = await loadDoc(docMeta.num);
          if (!content) continue;

          const fullScore = topicScore + scoreDocument(content, queryTerms);

          if (fullScore > 0) {
            const excerpt = extractRelevantSection(content, queryTerms, 2500);
            results.push({
              doc: docMeta.num,
              title: docMeta.title,
              topics: docMeta.topics,
              score: fullScore,
              excerpt,
            });
          }
        }

        // Sort by score descending
        results.sort((a, b) => b.score - a.score);

        // Return top results
        const topResults = results.slice(0, limit ?? 3);

        if (topResults.length === 0) {
          return ok({
            found: false,
            query,
            message:
              "No relevant knowledge found for this query. Try broader search terms or specify a document number (110-118).",
            availableDocs: DOC_INDEX.map(
              (d) => `Docs/${d.num}: ${d.title}`
            ),
          });
        }

        return ok({
          found: true,
          query,
          resultCount: topResults.length,
          results: topResults.map((r) => ({
            document: `Docs/${r.doc}`,
            title: r.title,
            topics: r.topics,
            relevanceScore: r.score,
            content: r.excerpt,
          })),
        });
      } catch (e: any) {
        return err(e);
      }
    }
  );
}
