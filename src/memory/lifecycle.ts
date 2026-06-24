/**
 * Session memory lifecycle — the "Engram-style" protocol, native to this harness.
 *
 * Three hooks around an agent run (see `runAgent` in src/orchestration/graph.ts):
 *   1. hydrate()  — at session START, pull the project's most relevant durable memory
 *      and render it as a system preamble (the `mem_context` step).
 *   2. summarizeSession() — at session END, compress the transcript into ONE durable,
 *      classified, embedded memory doc (the `mem_session_summary` step). Because it is
 *      auto-classified, a run that made a decision/bugfix/discovery is saved under that
 *      category with no explicit `mem_save` call (the auto-save trigger).
 *
 * Everything is best-effort: a failure here never breaks the run, only skips the hook.
 */

import { embedOne } from "../ingest/embedder.js";
import type { Provider } from "../providers/base.js";
import { Classifier } from "./classifier.js";
import { type MemoryDoc, makeMemoryDoc } from "./schemas.js";
import { MemoryStore } from "./store.js";

/** Categories that mark a run as worth remembering beyond a plain summary. */
export const TRIGGER_CATEGORIES = new Set(["decision", "bug", "convention", "reference"]);

type Msg = Record<string, unknown>;

/**
 * Fetch the project's most relevant memory for `prompt`.
 *
 * Tries semantic search first, then falls back to lexical search when vector search is
 * unavailable (throws) OR returns nothing (no vector index, missing embeddings). Final
 * fallback is recent memory, so hydration still works on a fresh/un-indexed deployment.
 */
async function relevantMemory(
  store: MemoryStore,
  project: string,
  prompt: string,
  limit: number,
): Promise<Record<string, unknown>[]> {
  try {
    const hits = await store.vectorSearch("memory", await embedOne(prompt), { project, limit });
    if (hits.length > 0) return hits;
  } catch {
    // fall through to lexical
  }
  try {
    const hits = await store.textSearch("memory", prompt, { project, limit });
    if (hits.length > 0) return hits;
  } catch {
    // fall through to recency
  }
  try {
    return await store.listMemory(project, { limit });
  } catch {
    return [];
  }
}

export interface HydrateResult {
  preamble: string;
  count: number;
}

/**
 * Build a system preamble from the project's relevant durable memory.
 * Returns an empty preamble (count 0) when there is nothing to inject.
 */
export async function hydrate(
  project: string,
  prompt: string,
  opts: { store?: MemoryStore; limit?: number; maxChars?: number } = {},
): Promise<HydrateResult> {
  const store = opts.store ?? new MemoryStore();
  const limit = opts.limit ?? 6;
  const maxChars = opts.maxChars ?? 4000;

  const hits = await relevantMemory(store, project, prompt, limit);
  if (hits.length === 0) return { preamble: "", count: 0 };

  const lines = [
    "## Project memory (durable context recovered for this session)",
    "Use these prior decisions, conventions and notes; do not contradict them silently.",
    "",
  ];
  let budget = maxChars;
  let used = 0;
  for (const h of hits) {
    const slug = String(h.slug ?? "");
    const desc = String(h.description ?? "");
    const cat = h.category ? ` (${String(h.category)})` : "";
    const body = String(h.body ?? "").replace(/\s+/g, " ").trim().slice(0, 400);
    const entry = `- [[${slug}]]${cat}: ${desc || body}${desc && body ? ` — ${body}` : ""}`;
    if (entry.length > budget) break;
    lines.push(entry);
    budget -= entry.length;
    used += 1;
  }
  return { preamble: lines.join("\n"), count: used };
}

export interface SessionSummary {
  slug: string;
  category: string;
  type: MemoryDoc["type"];
}

/** Best-effort LLM summary of the transcript; deterministic fallback without a provider. */
async function summarizeTranscript(convo: Msg[], llm: Provider | null): Promise<string> {
  const joined = convo
    .map((m) => `${String(m.role)}: ${String(m.content ?? "")}`)
    .join("\n")
    .slice(0, 12_000);
  if (llm !== null) {
    const out = await llm.complete(
      "Summarize this agent session into durable project memory. Preserve decisions, " +
        "conventions, bugfixes, file paths and any [[links]]. Be concise:\n\n" +
        joined,
    );
    return out.trim();
  }
  // Deterministic fallback: keep the assistant's conclusions.
  const conclusions = convo
    .filter((m) => m.role === "assistant" && String(m.content ?? "").trim())
    .map((m) => String(m.content).trim());
  return conclusions.join("\n\n").slice(0, 2000) || joined.slice(0, 2000);
}

/**
 * Compress a finished run into ONE durable, classified, embedded memory doc.
 * Returns null when there is nothing meaningful to store.
 */
export async function summarizeSession(
  project: string,
  runId: string,
  convo: Msg[],
  opts: { store?: MemoryStore; provider?: Provider } = {},
): Promise<SessionSummary | null> {
  const store = opts.store ?? new MemoryStore();
  const llm = opts.provider ?? null;

  const summary = await summarizeTranscript(convo, llm);
  if (!summary.trim()) return null;

  // Auto-classify (rules-first; LLM only if a provider was supplied) → the auto-save trigger.
  const category = await new Classifier(undefined, llm).classifyText(summary);
  const type: MemoryDoc["type"] = "project";
  const tags = ["session", ...(TRIGGER_CATEGORIES.has(category) ? [category] : [])];
  const slug = `session-${runId.slice(0, 8)}`;

  const doc: MemoryDoc = makeMemoryDoc({
    project,
    slug,
    type,
    category,
    description: `Session summary (${category}) — run ${runId.slice(0, 8)}`,
    body: summary,
    tags,
  });
  try {
    doc.embedding = await embedOne(`${doc.description}\n${doc.body}`);
  } catch {
    // Embedding is optional; the doc is still text-searchable.
  }
  await store.upsertMemory(doc);
  return { slug, category, type };
}
