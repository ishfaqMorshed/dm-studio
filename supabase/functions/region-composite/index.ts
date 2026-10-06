// DM Studio · Edge Function `region-composite` (2026-10-05, Fix an area = GPT Image 2.5 Sunburst, locked outside).
// The model regenerates the WHOLE design; this function keeps only the change: new pixels inside the user's box, a
// linear fade across a ring of settings.region_ring_pct % of the width, the previous version byte-identical beyond it
// (a hard gate: 0 such pixels may differ). Size, shift and colour corrections run first; overflow past the box is
// measured and a larger rect suggested. handler.ts holds the HTTP / auth / storage logic, composite.ts the pure
// algorithm, png.ts a dependency-free PNG codec. Tests: supabase/functions/region-composite/composite_test.ts
// (npm run test:functions).
//
// POST {generation_id, mode: 'locked' | 'extend' | 'full', rect_override?: {x, y, w, h, width?, height?}}
//   locked  WF-3 worker only (x-studio-secret): composite the stored raw regeneration, upload gens/<card>/<gen>.png,
//           PATCH image_path / composite_mode / region_metrics / drift_pct 0.
//   extend  worker or staff JWT: the same regeneration over a larger rect -> NEW child via rpc region_child ($0).
//   full    worker or staff JWT: the raw regeneration taken whole -> NEW child via rpc region_child ($0).
// Auth matrix: x-studio-secret -> rpc studio_secret_ok (all modes); authorization Bearer <staff jwt> -> rpc is_staff
// (extend / full; locked gives 403 forbidden_mode); neither -> 401. verify_jwt is OFF (supabase/config.toml) because
// the worker has no JWT and the staff JWT is checked by forwarding it to PostgREST. CORS on every response, OPTIONS 204.
// Deploy: supabase functions deploy region-composite --project-ref voatrqhfsdfjomyajovi --no-verify-jwt

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handler } from "./handler.ts";

Deno.serve((req) => handler(req));
