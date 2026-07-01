import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyBranch } from "./branches.js";

test("classifyBranch recognizes canonical trunks", () => {
  assert.deepEqual(classifyBranch("main"), { kind: "main", environment: "prod", derivesFrom: null, protected: true });
  assert.deepEqual(classifyBranch("master"), { kind: "master", environment: "prod", derivesFrom: null, protected: true });
  assert.deepEqual(classifyBranch("develop"), { kind: "develop", environment: "dev", derivesFrom: null, protected: true });
  assert.equal(classifyBranch("staging").kind, "staging");
  assert.equal(classifyBranch("staging").environment, "staging");
});

test("classifyBranch derives non-canonical branches from the integration trunk", () => {
  const trunks = ["develop", "main"];
  assert.deepEqual(classifyBranch("feature/login", trunks), { kind: "feature", environment: "none", derivesFrom: "develop", protected: false });
  assert.equal(classifyBranch("release/1.2", trunks).kind, "release");
  assert.equal(classifyBranch("release/1.2", trunks).derivesFrom, "develop");
  assert.equal(classifyBranch("hotfix/crash", trunks).kind, "hotfix");
  assert.equal(classifyBranch("hotfix/crash", trunks).derivesFrom, "main");
  assert.equal(classifyBranch("spike-xyz", trunks).kind, "other");
  assert.equal(classifyBranch("spike-xyz", trunks).derivesFrom, "develop");
});

test("classifyBranch falls back to main when develop is absent", () => {
  assert.equal(classifyBranch("feature/x", ["main"]).derivesFrom, "main");
});
