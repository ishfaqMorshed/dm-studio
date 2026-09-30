/**
 * Fixed API-cost labels for the wizard's two paid steps. These are the OpenRouter figures
 * measured in tests/e2e/REPORT.md (style draft ≈ $0.02; intake $0.012 + generation ≈ $0.07 +
 * QC $0.016 ≈ $0.10 for a test render). `settings.per_card_price_usd` is the studio's price
 * to the client, shown on Approve; a test render is never delivered, so it is not used here.
 */
export const ANALYSE_COST_LABEL = 'about $0.02'
export const TEST_RENDER_COST_LABEL = 'about $0.10'
export const COST_SUFFIX = 'of API cost'
