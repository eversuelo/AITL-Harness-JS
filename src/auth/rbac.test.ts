import assert from "node:assert/strict";
import { test } from "node:test";
import { type Actor, can } from "./rbac.js";

const root: Actor = { id: "u:root", role: "root" };
const admin: Actor = { id: "u:admin", role: "admin" };
const userA: Actor = { id: "u:alice", role: "user" };
const userB: Actor = { id: "u:bob", role: "user" };
const agent: Actor = { id: "agent:aitl-server", role: "agent" };
const auditor: Actor = { id: "u:audit", role: "auditor" };

test("root may register users", () => {
  assert.equal(can(root, "users", "create").allow, true);
});

test("non-root may not register users", () => {
  for (const a of [admin, userA, agent, auditor]) {
    assert.equal(can(a, "users", "create").allow, false, `${a.role} should not create users`);
  }
});

test("only root may change roles or disable users", () => {
  assert.equal(can(root, "users", "set_role").allow, true);
  assert.equal(can(admin, "users", "set_role").allow, false);
  assert.equal(can(root, "users", "disable").allow, true);
  assert.equal(can(admin, "users", "disable").allow, false);
});

test("a user may delete its own prompt", () => {
  assert.equal(can(userA, "prompts", "delete", { ownerId: userA.id }).allow, true);
});

test("a user may not delete another user's prompt", () => {
  assert.equal(can(userA, "prompts", "delete", { ownerId: userB.id }).allow, false);
});

test("admin and root may delete any prompt", () => {
  assert.equal(can(admin, "prompts", "delete", { ownerId: userB.id }).allow, true);
  assert.equal(can(root, "prompts", "delete", { ownerId: userB.id }).allow, true);
});

test("agent (AITL Server identity) may write memory", () => {
  assert.equal(can(agent, "memory", "create").allow, true);
  assert.equal(can(agent, "decisions", "create").allow, true);
});

test("a plain user may not write durable memory directly", () => {
  assert.equal(can(userA, "memory", "create").allow, false);
  assert.equal(can(userA, "decisions", "create").allow, false);
});

test("admin writes durable state only via delegation to the server", () => {
  assert.equal(can(admin, "memory", "create").allow, false);
  assert.equal(can(admin, "memory", "create", { delegated: true }).allow, true);
});

test("only root reads/writes config secrets and runs index/init-db", () => {
  assert.equal(can(root, "config_secrets", "read").allow, true);
  assert.equal(can(admin, "config_secrets", "read").allow, false);
  assert.equal(can(root, "indexes", "execute").allow, true);
  assert.equal(can(agent, "indexes", "execute").allow, false);
});

test("auditor may read but never mutate", () => {
  assert.equal(can(auditor, "users", "read").allow, true);
  assert.equal(can(auditor, "prompts", "read").allow, true);
  assert.equal(can(auditor, "prompts", "create").allow, false);
  assert.equal(can(auditor, "memory", "create").allow, false);
});

test("fails closed on unknown role", () => {
  const bogus = { id: "x", role: "wizard" } as unknown as Actor;
  assert.equal(can(bogus, "prompts", "read").allow, false);
});
