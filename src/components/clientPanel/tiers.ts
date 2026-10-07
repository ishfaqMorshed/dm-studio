/** `clients.default_similarity_tier` options, shared by the client dialog and the onboarding brief. */
export const SIMILARITY_TIERS = [
  { value: 1, label: '1 · Style only, new composition' },
  { value: 2, label: '2 · Loosely inspired by the references' },
  { value: 3, label: '3 · Balanced (default)' },
  { value: 4, label: '4 · Close to the references' },
  { value: 5, label: '5 · As close as possible' },
] as const

export const SIMILARITY_TIER_HINT = "How close new designs may sit to the client's references. Designers can change it per card."
