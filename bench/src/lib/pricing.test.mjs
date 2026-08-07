import test from "node:test";
import assert from "node:assert/strict";
import { reconstructCost } from "./pricing.mjs";

const pricingTable = {
  version: "2026-08",
  models: {
    "claude-sonnet-4-5-20250929": {
      input_per_mtok: 3.0,
      output_per_mtok: 15.0,
      cache_write_per_mtok: 3.75,
      cache_read_per_mtok: 0.3,
    },
  },
};

test("AC-6: reconstructCost sums per-category, not total*rate", () => {
  const tokens = { input: 1_000_000, output: 1_000_000, cache_read: 1_000_000, cache_create: 1_000_000 };
  const { cost_reconstructed_usd, pricing_table_version } = reconstructCost(
    tokens,
    pricingTable,
    "claude-sonnet-4-5-20250929"
  );
  // 3.00 + 15.00 + 0.30 + 3.75 = 22.05 — NOT (4,000,000 tokens * some blended rate).
  assert.equal(cost_reconstructed_usd, 22.05);
  assert.equal(pricing_table_version, "2026-08");
});

test("AC-6: reconstructCost with mixed small counts matches hand-computed sum", () => {
  const tokens = { input: 500_000, output: 100_000, cache_read: 2_000_000, cache_create: 0 };
  const { cost_reconstructed_usd } = reconstructCost(tokens, pricingTable, "claude-sonnet-4-5-20250929");
  const expected = 0.5 * 3.0 + 0.1 * 15.0 + 2.0 * 0.3 + 0;
  assert.equal(cost_reconstructed_usd, Math.round(expected * 1e6) / 1e6);
});

test("AC-6: reconstructCost with zero tokens is zero cost", () => {
  const tokens = { input: 0, output: 0, cache_read: 0, cache_create: 0 };
  const { cost_reconstructed_usd } = reconstructCost(tokens, pricingTable, "claude-sonnet-4-5-20250929");
  assert.equal(cost_reconstructed_usd, 0);
});

test("reconstructCost throws on unknown model", () => {
  const tokens = { input: 1, output: 1, cache_read: 0, cache_create: 0 };
  assert.throws(() => reconstructCost(tokens, pricingTable, "unknown-model"));
});

test("reconstructCost throws when pricing_table.models is missing", () => {
  assert.throws(() => reconstructCost({ input: 1, output: 0, cache_read: 0, cache_create: 0 }, {}, "x"));
});
