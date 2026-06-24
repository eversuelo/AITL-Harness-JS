/**
 * runOnHost — drive an external agent host with the harness wrapped around it.
 *
 * The host (Codex / Claude Code / Antigravity) runs its own agent loop; the harness adds
 * the durable layer: it hydrates project context into the prompt, records the run as a
 * first-class `run` with transcript + events, and reports status. This is the "cognitive
 * system" running OVER another agent, rather than driving a raw model itself.
 */

import { randomUUID } from "node:crypto";
import { hydrate } from "../memory/lifecycle.js";
import { makeEvent, makeMessage, makeRun } from "../memory/schemas.js";
import { MemoryStore } from "../memory/store.js";
import { type HostAdapter, getHost } from "./base.js";

export interface RunOnHostOpts {
  store?: MemoryStore;
  host: string | HostAdapter;
  cwd?: string;
  timeoutMs?: number;
  /** Inject the project's durable context into the prompt (default true). */
  hydrate?: boolean;
}

export interface RunOnHostResult {
  run_id: string;
  host: string;
  final_text: string;
  exit_code: number;
  status: "done" | "error";
}

export async function runOnHost(
  prompt: string,
  project: string,
  opts: RunOnHostOpts,
): Promise<RunOnHostResult> {
  const store = opts.store ?? new MemoryStore();
  const host = typeof opts.host === "string" ? getHost(opts.host) : opts.host;

  const runId = randomUUID();
  const run = makeRun({
    project,
    model: `host:${host.name}`,
    harness_config: { role: "host", host: host.name },
  });
  await store.db.collection("runs").insertOne({ ...run, _id: runId as never });
  await store.appendMessage(makeMessage({ project, run_id: runId, idx: 0, role: "user", content: prompt }));

  // Hydrate the host's prompt with the project's durable context (the harness's value-add).
  let fullPrompt = prompt;
  if (opts.hydrate !== false) {
    try {
      const { preamble, sections } = await hydrate(project, prompt, { store });
      if (preamble) fullPrompt = `${preamble}\n\n---\n\n${prompt}`;
      await store.logEvent(makeEvent({ project, run_id: runId, type: "hydrate", payload: { host: host.name, ...sections } }));
    } catch {
      // hydration is best-effort
    }
  }
  await store.logEvent(makeEvent({ project, run_id: runId, type: "spawn", payload: { host: host.name } }));

  let result: { text: string; raw: string; exitCode: number };
  try {
    result = await host.runTask(fullPrompt, { cwd: opts.cwd, timeoutMs: opts.timeoutMs });
  } catch (err) {
    const message = String(err instanceof Error ? err.message : err).slice(0, 500);
    await store.db
      .collection("runs")
      .updateOne({ _id: runId as never }, { $set: { status: "error", ended_at: new Date(), error: message } });
    await store.logEvent(makeEvent({ project, run_id: runId, type: "error", payload: { host: host.name, message } }));
    throw err;
  }

  const status: "done" | "error" = result.exitCode === 0 ? "done" : "error";
  await store.appendMessage(makeMessage({ project, run_id: runId, idx: 1, role: "assistant", content: result.text }));
  await store.db
    .collection("runs")
    .updateOne({ _id: runId as never }, { $set: { status, ended_at: new Date() } });

  return { run_id: runId, host: host.name, final_text: result.text, exit_code: result.exitCode, status };
}
