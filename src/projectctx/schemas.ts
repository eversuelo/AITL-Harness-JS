/**
 * Project-context definitions — durable `agents` and `skills` collections.
 *
 * These hold reusable, project-scoped definitions (an AGENTS.md-style agent brief or
 * a SKILLS.md-style skill) that the MCP can serve on every repo call so a client can
 * recover project context. Both share ONE document shape (`DefinitionRecord`); only
 * the collection differs.
 *
 * Intentionally kept OUT of the shared `COLLECTIONS` list in db/client.ts (like
 * `prompts`) so the Python↔TS parity contract stays untouched.
 */

import { z } from "zod";

export const AGENTS_COLLECTION = "agents";
export const SKILLS_COLLECTION = "skills";
export type DefinitionKind = "agent" | "skill";

export const collectionFor = (kind: DefinitionKind): string =>
  kind === "agent" ? AGENTS_COLLECTION : SKILLS_COLLECTION;

export const DefinitionRecordSchema = z.object({
  project: z.string(),
  name: z.string(), // unique per (project, kind); e.g. "code-reviewer"
  description: z.string().default(""),
  content: z.string().default(""), // the markdown body / instructions
  source: z.string().default("mcp"), // file path or "mcp"
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).default({}),
  created_at: z.date().default(() => new Date()),
  updated_at: z.date().default(() => new Date()),
});
export type DefinitionRecord = z.infer<typeof DefinitionRecordSchema>;

export const makeDefinitionRecord = (
  v: z.input<typeof DefinitionRecordSchema>,
): DefinitionRecord => DefinitionRecordSchema.parse(v);
