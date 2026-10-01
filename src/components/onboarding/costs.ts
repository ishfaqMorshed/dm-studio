/**
 * Fixed API-cost labels for the wizard's two paid steps (spec section 8). An analysis is two vision
 * passes (per-image sheets, then the Style Card): about $0.045 at 9 images, $0.06 at 16. A test
 * render is intake $0.012 + generation ≈ $0.07 + QC ≈ $0.016 (tests/e2e/REPORT.md).
 * `settings.per_card_price_usd` is the studio's price to the client, shown on Approve; a test render
 * is never delivered, so it is not used here.
 */
export const ANALYSE_COST_LABEL = 'about $0.05'
export const TEST_RENDER_COST_LABEL = 'about $0.10'
export const COST_SUFFIX = 'of API cost'
