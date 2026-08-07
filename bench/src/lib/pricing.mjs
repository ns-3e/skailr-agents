// DOC: Per-category cost reconstruction (run-json "cost" group, AC-6).
// NEVER total_tokens × a single rate — each token category is billed at its
// own per-mtok rate and summed. Both cost_reported_usd (from stream-json
// result.total_cost_usd) and cost_reconstructed_usd are stored so drift
// between the two is visible; tolerance is documented in README.

/**
 * @param {{input:number, output:number, cache_read:number, cache_create:number}} tokensByCategory
 * @param {{version:string, models:Object}} pricingTable  config.pricing_table
 * @param {string} modelId exact model ID (pricing_table.models key)
 * @returns {{cost_reconstructed_usd:number, pricing_table_version:string}}
 */
export function reconstructCost(tokensByCategory, pricingTable, modelId) {
  if (!pricingTable || !pricingTable.models) {
    throw new Error("reconstructCost: pricingTable.models is required");
  }
  const rates = pricingTable.models[modelId];
  if (!rates) {
    throw new Error(`reconstructCost: no pricing_table entry for model "${modelId}"`);
  }
  const { input = 0, output = 0, cache_read = 0, cache_create = 0 } = tokensByCategory || {};

  const cost =
    (input / 1_000_000) * rates.input_per_mtok +
    (output / 1_000_000) * rates.output_per_mtok +
    (cache_read / 1_000_000) * rates.cache_read_per_mtok +
    (cache_create / 1_000_000) * rates.cache_write_per_mtok;

  // Round to 6 decimal places — sub-cent precision without float noise.
  const cost_reconstructed_usd = Math.round(cost * 1e6) / 1e6;

  return { cost_reconstructed_usd, pricing_table_version: pricingTable.version };
}
