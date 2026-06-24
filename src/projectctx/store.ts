/**
 * DefinitionStore — gateway to the `agents` / `skills` collections.
 *
 * One store class serves either collection (chosen by `kind`), since both hold the
 * same `DefinitionRecord` shape. Upsert is keyed by (project, name); search uses
 * Mongo `$text` with a case-insensitive regex fallback (mirrors PromptStore), so it
 * works on any deployment without a vector index.
 */

import type { Db, Document } from "mongodb";
import { getDb } from "../db/client.js";
import {
  type DefinitionKind,
  type DefinitionRecord,
  collectionFor,
  makeDefinitionRecord,
} from "./schemas.js";

export class DefinitionStore {
  readonly db: Db;
  readonly collection: string;

  constructor(kind: DefinitionKind, db?: Db) {
    this.db = db ?? getDb();
    this.collection = collectionFor(kind);
  }

  /** Insert/update a definition, keyed by (project, name). Returns the stored record. */
  async upsert(
    rec: Partial<DefinitionRecord> & { project: string; name: string },
  ): Promise<DefinitionRecord> {
    const doc = makeDefinitionRecord(rec);
    doc.updated_at = new Date();
    const existing = await this.db
      .collection(this.collection)
      .findOne({ project: doc.project, name: doc.name }, { projection: { created_at: 1 } });
    if (existing?.created_at instanceof Date) doc.created_at = existing.created_at;
    await this.db
      .collection(this.collection)
      .updateOne({ project: doc.project, name: doc.name }, { $set: doc }, { upsert: true });
    return doc;
  }

  /** Fetch one definition by (project, name); `null` if absent. */
  async get(project: string, name: string): Promise<Document | null> {
    return this.db.collection(this.collection).findOne({ project, name });
  }

  /** List a project's definitions, newest first. Optional tag filter. */
  async list(
    project: string,
    opts: { tag?: string; limit?: number } = {},
  ): Promise<Document[]> {
    const query: Record<string, unknown> = { project };
    if (opts.tag !== undefined) query.tags = opts.tag;
    return this.db
      .collection(this.collection)
      .find(query)
      .sort({ updated_at: -1 })
      .limit(opts.limit ?? 100)
      .toArray();
  }

  /** Search definitions: Mongo `$text` with a case-insensitive regex fallback. */
  async search(project: string, query: string, limit = 10): Promise<Document[]> {
    const coll = this.db.collection(this.collection);
    try {
      return await coll
        .find(
          { project, $text: { $search: query } },
          { projection: { score: { $meta: "textScore" } } },
        )
        .sort({ score: { $meta: "textScore" } })
        .limit(limit)
        .toArray();
    } catch {
      const rx = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      return coll
        .find({ project, $or: [{ name: rx }, { description: rx }, { content: rx }] })
        .sort({ updated_at: -1 })
        .limit(limit)
        .toArray();
    }
  }

  /** Delete one definition by (project, name). Returns whether a doc was removed. */
  async delete(project: string, name: string): Promise<boolean> {
    const res = await this.db.collection(this.collection).deleteOne({ project, name });
    return res.deletedCount === 1;
  }
}
