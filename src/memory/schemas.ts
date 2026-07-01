/**
 * Zod schemas for the memory-layer documents still owned by Zod.
 *
 * Historically every durable collection had its schema here. The durable CORE collections
 * (messages, memory, decisions, decisions_history, memory_history, events) have since moved
 * to Mongoose models (single source of shape + validation + types):
 *   Message      → src/models/message.model.ts
 *   MemoryDoc    → src/models/memory.model.ts
 *   ADR          → src/models/decision.model.ts
 *   HistoryEntry → src/models/history.model.ts (decisions_history + memory_history)
 *   Event        → src/models/event.model.ts
 *
 * What remains here: the shared enums/value types those models re-import (MEMORY_TYPES,
 * ROLES, ToolCall) plus the `Run` schema/builder (runs migrate in a later phase). Use the
 * `make*` builders — they fill the shared defaults (project, timestamps).
 */

import { z } from "zod";

const now = () => new Date();

export const MEMORY_TYPES = ["user", "feedback", "project", "reference", "synthesis"] as const;
export const ROLES = ["user", "assistant", "tool", "system"] as const;

export type MemoryType = (typeof MEMORY_TYPES)[number];
export type Role = (typeof ROLES)[number];

// ── shared base fields ───────────────────────────────────────────────────
const BaseShape = {
  project: z.string(), // Project scope; isolates multi-project memory.
  created_at: z.date().default(now),
  updated_at: z.date().default(now),
};

export const ToolCallSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  input: z.record(z.unknown()).default({}),
});
export type ToolCall = z.infer<typeof ToolCallSchema>;

// ── Run: one agent run / session ───────────────────────────────────────────
export const RunSchema = z.object({
  ...BaseShape,
  model: z.string(),
  harness_config: z.record(z.unknown()).default({}),
  status: z.enum(["running", "done", "error"]).default("running"),
  token_usage: z.object({ input: z.number(), output: z.number() }).default({ input: 0, output: 0 }),
  started_at: z.date().default(now),
  ended_at: z.date().nullable().default(null),
  tags: z.array(z.string()).default([]),
});
export type Run = z.infer<typeof RunSchema>;

// ── builders (mirror pydantic constructors: parse fills defaults) ────────────
export const makeRun = (v: z.input<typeof RunSchema>): Run => RunSchema.parse(v);
