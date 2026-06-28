import assert from "node:assert/strict";
import { test } from "node:test";
import { ROLES } from "./rbac.js";
import { validateRole, validateUserSeed } from "./users.js";

test("validateRole accepts every RBAC role", () => {
  for (const role of ROLES) assert.equal(validateRole(role), role);
});

test("validateRole rejects unknown roles", () => {
  assert.throws(() => validateRole("superuser"), /role must be one of/);
});

test("validateUserSeed rejects an invalid role", () => {
  assert.throws(
    () => validateUserSeed({ username: "alice", email: "a@b.co", password: "longpassword12", role: "ceo" }),
    /role must be one of/,
  );
});

test("validateUserSeed enforces password length", () => {
  assert.throws(
    () => validateUserSeed({ username: "alice", email: "a@b.co", password: "short" }),
    /at least 12 characters/,
  );
});

test("validateUserSeed accepts a well-formed seed", () => {
  assert.doesNotThrow(() =>
    validateUserSeed({ username: "alice", email: "alice@example.com", password: "longenoughpw12", role: "user" }),
  );
});
