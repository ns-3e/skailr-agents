import test from "node:test";
import assert from "node:assert/strict";
import { hashSecret, verifySecret } from "../src/auth/hash.ts";

test("hashSecret never returns the raw input", () => {
  const hash = hashSecret("s3cr3t-value");
  assert.notEqual(hash, "s3cr3t-value");
  assert.ok(!hash.includes("s3cr3t-value"));
});

test("verifySecret accepts the correct secret and rejects a wrong one", () => {
  const hash = hashSecret("correct-secret");
  assert.equal(verifySecret("correct-secret", hash), true);
  assert.equal(verifySecret("wrong-secret", hash), false);
});
