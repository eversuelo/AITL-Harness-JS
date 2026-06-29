/**
 * `aitl init claude` — write a CLAUDE.md initializer for a repo that should use this harness.
 *
 * Sibling of `aitl init agent` (which writes AGENTS.md). CLAUDE.md is the file Claude Code
 * auto-loads as project memory, so this is the strongest instruction-level lever to make a
 * Claude Code session treat the aitl-js MCP as its durable backend: consult it before
 * decisions, persist after, and run telemetered (tokens + per-session artifact graph).
 *
 * It will NOT clobber an existing CLAUDE.md unless `force` is set (this repo already has a
 * canonical one).
 */

import { promises as fs } from "node:fs";
import { createInterface } from "node:readline/promises";

export interface ClaudeGuideOpts {
  out: string;
  project: string;
  mcp: string;
  interactive?: boolean;
  force?: boolean;
}

function renderClaudeMd(project: string, mcp: string): string {
  const hydrate = `aitl hydrate --project ${project} --no-vector`;
  const capture = `aitl capture-session --project ${project}`;
  return `# CLAUDE.md — ${project}

> Operating contract for **Claude Code**. The durable memory backend is the **aitl-js MCP**
> server \`${mcp}\`. Treat it as the source of truth — not your in-context memory. Generated
> by \`aitl init claude\`.

## Project scope

Use the project **\`${project}\`** for every \`${mcp}\` MCP call. Never use a variant spelling
(it fragments the durable history).

## Before EVERY non-trivial decision — CONSULT THE MCP

Do not decide from memory. First query durable state via the \`${mcp}\` MCP server:

1. \`search_memory\` — semantic recall over prior memory/notes for this project.
2. \`list_decisions\` — the ADRs already taken (don't contradict an accepted one; supersede explicitly).
3. \`get_repomap\` — when the decision touches code structure.

If the MCP and your assumptions disagree, **the MCP wins** — or surface the conflict.

## After deciding / learning — PERSIST IT

1. \`record_decision\` — record any architectural decision as an ADR (Context / Decision /
   Consequences). Use the next-free id (read it with \`list_decisions\`); never reuse one.
2. \`write_memory\` — capture durable facts, preferences and gotchas (\`type\`: user | feedback
   | project | reference), keyed by a stable slug. Link related notes with \`[[slug]]\`.
3. \`record_prompt\` — record the prompt/spec that drove the work, so the session is reconstructable.

## This session is telemetered

The harness measures each session and links what it produced:

- **Tokens / turns / cost** are captured per run (see the **Runs** tab in \`aitl ui\`).
- **Per-session graph**: the run is linked to the ADRs, memories and prompts you wrote
  (parsed from this session's MCP calls). Re-run \`${capture}\` to refresh it.
- **Specs** (SDD): a spec-shaped prompt is auto-classified, persisted, and synthesized with
  the task outcome.

## Setup (once per machine/repo)

### 1. Register the MCP server — \`.mcp.json\`

\`\`\`json
{
  "mcpServers": { "${mcp}": { "command": "aitl", "args": ["mcp"] } }
}
\`\`\`

### 2. Allow the tools + wire the hooks — \`.claude/settings.local.json\`

\`\`\`json
{
  "enableAllProjectMcpServers": true,
  "enabledMcpjsonServers": ["${mcp}"],
  "permissions": { "allow": ["mcp__${mcp}"] },
  "hooks": {
    "UserPromptSubmit": [ { "hooks": [ { "type": "command", "command": "${hydrate}" } ] } ],
    "Stop": [ { "hooks": [ { "type": "command", "command": "${capture}" } ] } ]
  }
}
\`\`\`

The hooks are the only *deterministic* layer: \`UserPromptSubmit → aitl hydrate\` injects the
durable context into every prompt; \`Stop → ${capture}\` records the session as a run and links
its artifacts. They run \`aitl\` outside the MCP, so they need Mongo configured (step 3).

### 3. Configure the Mongo connection (user profile, not git)

\`\`\`bash
aitl config set MONGODB_URI "mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/aitl?appName=<app>"
aitl config set MONGODB_DB aitl
aitl check-db && aitl init-db
\`\`\`

## Rules of thumb

- **Recall before reasoning.** A 1-second \`search_memory\` beats re-deriving context.
- **One decision → one ADR.** Small, append-only, contiguous ids.
- **Don't duplicate.** Update an existing memory/decision instead of a near-copy.
- **Scope everything** to project \`${project}\`.
`;
}

export async function writeClaudeGuide(opts: ClaudeGuideOpts): Promise<string> {
  let { out, project, mcp } = opts;

  if (opts.interactive) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      out = (await rl.question(`Output file [${out}]: `)).trim() || out;
      project = (await rl.question(`Project scope [${project}]: `)).trim() || project;
      mcp = (await rl.question(`MCP server name [${mcp}]: `)).trim() || mcp;
    } finally {
      rl.close();
    }
  }

  // Guard against clobbering an existing CLAUDE.md (e.g. this repo's canonical one).
  if (!opts.force) {
    try {
      await fs.access(out);
      throw new Error(`${out} already exists. Re-run with --force to overwrite.`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  await fs.writeFile(out, renderClaudeMd(project, mcp), "utf-8");
  return out;
}
