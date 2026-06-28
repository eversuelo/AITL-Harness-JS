/**
 * T1 acceptance tests (checker). Do NOT edit these during a measured run — they are
 * the gate. The maker (agent under C0/C2) edits src/student.ts until these pass.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { registerStudent } from "./src/student.js";

test("T1: registers a valid student (normalizes email, assigns id + createdAt)", () => {
  const s = registerStudent({ tenantId: "acme", name: "Ada Lovelace", email: "Ada@Example.com" });
  assert.equal(s.tenantId, "acme");
  assert.equal(s.name, "Ada Lovelace");
  assert.equal(s.email, "ada@example.com"); // normalized to lowercase
  assert.equal(typeof s.id, "string");
  assert.ok(s.id.length > 0);
  assert.ok(s.createdAt instanceof Date);
});

test("T1: rejects an empty/blank name", () => {
  assert.throws(() => registerStudent({ tenantId: "acme", name: "   ", email: "a@b.co" }));
});

test("T1: rejects an invalid email", () => {
  assert.throws(() => registerStudent({ tenantId: "acme", name: "Ada", email: "not-an-email" }));
});

test("T1: rejects a missing/blank tenantId", () => {
  assert.throws(() => registerStudent({ tenantId: "", name: "Ada", email: "a@b.co" }));
});
