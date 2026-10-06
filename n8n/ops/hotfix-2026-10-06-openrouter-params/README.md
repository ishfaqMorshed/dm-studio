# Hot-fix 2026-10-06 - OpenRouter image parameters (`Build OpenRouter Image`, WF-2 + WF-3)

One Code-node parameter update per workflow. No node added, renamed, moved or rewired; no credential, setting, sticky, template,
migration or Edge Function change. Independent of Style Card v2 (`n8n/ops/README.md` section 0 places it; Step C re-applies the node).
Every file here except this README is GENERATED: `cd n8n/tools && node make-hotfix.js` (`--check` only compares and exits 1 on a difference)
- never edit a generated bundle file by hand; change the main sources and regenerate. This README is hand-written; `test-openrouter-hotfix.js`
checks the names it must carry.

## What broke

- Live WF-2 generation `cf89b565` (card `2e99c36b`, client Chicken Happy Hour, placement back, 2026-10-06 10:15 UTC) failed with
  `OpenRouter: No provider for openai/gpt-image-2.5-sunburst supports the requested parameter(s): resolution  (HTTP 400)`.
  The last successful OpenRouter generate with the same keys ran 2026-10-01 07:45 UTC. The failed request was `aspect_ratio: 4:5`,
  `resolution: 2K`, `output_format: png` with 3 input references; every earlier OpenRouter generation was 1:1 (the active `placement_aspect`
  template maps full_front, back and tote to 4:5 and mug to 3:2, so a back placement was the first non-square OpenRouter request).
- Cause: between 2026-10-01 and 2026-10-06 OpenRouter's Unified Image API started validating request parameters per model. The public
  descriptors `GET https://openrouter.ai/api/v1/images/models/<model>/endpoints` (no key) list what each endpoint accepts; an absent key is
  unsupported and an enum value not listed is invalid. `openai/gpt-image-2.5-sunburst` accepts `aspect_ratio, quality, background, n,
  input_references, output_compression` only, and its `aspect_ratio` enum is `1:1, 3:2, 2:3, 4:3, 3:4, 16:9, 9:16, 21:9, auto` - NO `4:5`.
  The live node sent `resolution: '2K'` and `output_format: 'png'` (both Kie-era keys; the 400 named `resolution` first) and `aspect_ratio: 4:5`.
  `google/gemini-2.5-flash-image` (the edit_text model) accepts `aspect_ratio, n, input_references` and lists `4:5` (its enum: `1:1, 2:3, 3:2,
  3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9`, the same as `google/gemini-3-pro-image-preview`; `google/gemini-3.1-flash-image-preview` adds `1:4,
  1:8, 4:1, 8:1`). Note the descriptor body is `{id, endpoints}` (not wrapped in `data` as the docs show); the node accepts both.
- Fix: the node builds the same body as before (same keys, same order, same values) as a candidate, then keeps `model` and `prompt` and only
  the other keys the model accepts: first from the live descriptor (`this.helpers.httpRequest`, GET, `json: true`, **5 s**, union over the
  endpoints, optional catch binding), else from a static table inside the node (`/^openai[/]gpt-image-/`, `/^google[/]gemini-3[^/]*-image/`,
  `/^google[/]gemini-2[.]5-flash-image/`, anything else = `aspect_ratio, n, input_references`). Each static entry also carries the model
  family's `aspect_ratio` list (gpt-image = the 9 live values incl. `auto`; gemini-3 = the 10 common values; gemini-2.5-flash-image = the
  same 10; the common fallback has no list and passes the value through), so the static caps are `aspect_ratio {type: enum, values}` plus
  `{type: any}` for the other keys and the ratio rule below works offline too.
  **Aspect ratio mapping (round 2):** an `aspect_ratio` the model does not list is NOT dropped (with a live descriptor the card would silently
  render 1:1, with the static table OpenRouter would answer 400) - it is replaced by the nearest listed ratio by `|ln(w/h) - ln(x/y)|` over the
  listed values of the form `a:b` (`auto` and anything unparsable are never chosen; a tie keeps the first listed) and recorded in the item as
  `mapped: ['aspect_ratio 4:5 to 3:4']`. So on GPT Image `4:5 -> 3:4`, `5:4 -> 4:3`, `2:1 -> 16:9`, `3:2` and `1:1` stay;
  gemini-2.5-flash-image keeps `4:5`. The value is dropped only when it is unparsable itself (e.g. `auto` on Gemini) or nothing of the form
  `a:b` is listed. Other enum keys are still dropped on a mismatch, ranges are clamped (`n`, `input_references` trimmed to the first max
  entries). The item carries `body`, `dropped: [...]`, `mapped: [...]` and `caps_source: 'live' | 'static'`; `Mark OpenRouter` and
  `OpenRouter Image` read `body` as before. Pruning never throws; the node still throws only when there is no prompt (colon-free message).
  `generations.aspect_ratio` keeps the requested `4:5`. The finisher (`n8n/wf4-finisher.sdk.js`) never reads `aspect_ratio` and works from the
  real image, so a 3:4 design on a 4:5 placement finishes like any other; **region-composite does NOT** accept an aspect change - it refuses a
  regeneration whose shape is more than 1 % off the parent image (`size_mismatch`, HTTP 422, "never stretched", `composite.ts` C1) - see the
  fit rule below.
  Result today: WF-2 Sunburst body `model, prompt, n, aspect_ratio, background, input_references` (dropped `resolution, output_format`;
  the user's 4:5 back card comes back as a 3:4 design, `mapped ['aspect_ratio 4:5 to 3:4']`; OpenRouter returns 1024 px class sizes for GPT
  Image whatever `settings.generation_resolution` says); WF-3 edit_text on gemini-2.5-flash-image `model, prompt, n, aspect_ratio,
  input_references`, 4:5 kept; the WF-3 region body (Step C only, GPT Image 2.5 Sunburst) stays byte-identical to the probe for a 1:1 parent;
  a parent stored 4:5 maps to 3:4 and the fit rule below decides whether that is sent. `quality` is NOT added to the WF-2 body (cost behaviour
  unchanged; a later decision).
  **Fit rule (round 2; Step C's WF-3 region branch only):** prompt-engine sets `region.aspect_ratio` to the parent's STORED ratio, and the
  parent's real pixel size travels in `region.rect` (`mask_rect` carries `width` / `height`). The main WF-3 head defines `fit = <width>x<height>`;
  the shared tail, after mapping, throws BEFORE the paid call when the ratio it would send is more than 1 % off `fit` (region-composite's own
  tolerance): `Fix an area cannot run on this 1638x2048 px design - the image model lists no aspect ratio within 1 percent of that shape
  (nearest 3 by 4) and the composite step never stretches a regeneration, so none was started` (colon-free; the node's error output feeds
  `Fail Message`, so it becomes `last_error`). So a Sunburst-made parent stored 4:5 but really 3:4 (every OpenRouter GPT Image card after this
  hot-fix) composites; a Kie- or Gemini-made 4:5 parent (really 4:5 - Kie is the workaround today) cannot be fixed on GPT Image until
  region-composite pads or crops, and now fails free instead of paying for a regeneration that ends in `size_mismatch`; a region model that lists
  4:5 (gemini-2.5-flash-image, gemini-3) keeps 4:5 and composites. The hook is `typeof fit === 'string'` in the tail: WF-2 and the region-free
  WF-3 hot-fix node never define `fit`, so the check is inert there (the tests prove it) and the tail stays byte-identical in all four nodes.

## Files

| file | what |
|---|---|
| `wf2-generate.hotfix.sdk.js` | `n8n/ops/before/wf2-generate.sdk.js` (= live WF-2 `KVLDYPaWZZZtOoir`) with ONLY the `jsCode:` line of `Build OpenRouter Image` replaced by the main-source line (`n8n/wf2-generate.sdk.js`): hotfix node = main node |
| `wf3-edit.hotfix.sdk.js` | `n8n/ops/before/wf3-edit.sdk.js` (= live WF-3 `V83NWHjzDdyiqtNP`) with ONLY that line replaced by a **region-free** node: the BEFORE node jsCode minus its last line (`return { json: { body } };`) + the pruning tail of the main WF-3 node (`n8n/wf3-edit.sdk.js`, from the top-level comment `// OpenRouter validates ...` to the end). The live WF-3 graph has no region lane, so the hot-fix must not be able to take the region branch whatever prompt-engine version (v8.1 returns `region`) is deployed; the main node's region branch arrives with Step C. The tail is byte-identical in WF-2 main, WF-3 main and both hotfix nodes |
| `wf2.ops.json`, `wf3.ops.json` | `node diff-ops.js <before> <hotfix>`: exactly one op each, `updateNodeParameters` `Build OpenRouter Image` `{jsCode}` `replace: true`, jsCode = the hotfix node |
| `wf2-build-openrouter-image.js`, `wf3-build-openrouter-image.js` | the hotfix node jsCode as plain JavaScript (real newlines, exact bytes, NO trailing newline), paste-ready for the n8n UI code editor |
| `wf2-build-openrouter-image.before.js`, `wf3-build-openrouter-image.before.js` | the live (BEFORE) node jsCode, same form, for rollback |
| `n8n/tools/make-hotfix.js` | the generator of everything above (`node make-hotfix.js`, `node make-hotfix.js --check`) |

`node n8n/tools/test-openrouter-hotfix.js` runs `make-hotfix.js --check` and asserts the composition (WF-3 = BEFORE head + main tail exactly,
WF-2 = main, the tail identical across all four nodes, the ops, the paste bytes, this README, and the hotfix codes under the live graph shapes
incl. the 2e99c36b case, `pe.region` present, and a really 4:5 parent where the hot-fix node stays inert while the main node throws the fit
message).

## Apply

**A - n8n UI (no tools).** Open workflow `KVLDYPaWZZZtOoir` (DM Studio · WF-2 Generate) -> node `Build OpenRouter Image` -> select all
JavaScript in the code editor and replace it with the content of `wf2-build-openrouter-image.js` -> Back to canvas -> Save -> Publish.
Then workflow `V83NWHjzDdyiqtNP` (WF-3 Edit) -> node `Build OpenRouter Image` -> replace with `wf3-build-openrouter-image.js` -> Save -> Publish.
Mode stays "Run Once for All Items"; nothing else is touched.

**B - a fresh Claude Code session with the n8n MCP.**
1. `update_workflow('KVLDYPaWZZZtOoir', operations = <wf2.ops.json>)` -> `publish_workflow('KVLDYPaWZZZtOoir')`.
2. `update_workflow('V83NWHjzDdyiqtNP', operations = <wf3.ops.json>)` -> `publish_workflow('V83NWHjzDdyiqtNP')`.
(`validate_workflow` in between if wanted; the live versionIds before the change were `53073bc3-...` / `1fbb0856-...`.)

## Verify

The USER retries the failed card `2e99c36b` (never an automated session - it uses the E2E Test Client for its own smoke run). In the new WF-2
execution the item of `Build OpenRouter Image` shows `body` without `resolution` / `output_format` and with `aspect_ratio: "3:4"`,
`dropped: ["resolution","output_format"]`, `mapped: ["aspect_ratio 4:5 to 3:4"]` (the card is a 4:5 back placement) and `caps_source: "live"`
(`"static"` means the descriptor GET failed inside n8n, or the Code node sandbox exposes no `this.helpers.httpRequest` (task runner) - the body is
still right, incl. the mapping; check the n8n host's outbound access);
`OpenRouter Image` answers 200 and the card reaches needs_review with a 3:4 design (`generations.aspect_ratio` stays `4:5`). For WF-3: one
Edit text on a done version runs through on `google/gemini-2.5-flash-image` with `dropped: ["resolution","output_format"]`, `mapped: []`.

## Rollback

Paste the old code back: `wf2-build-openrouter-image.before.js` / `wf3-build-openrouter-image.before.js` (= the live jsCode, also printable
with `cd n8n/tools && node export-nodes.js ../ops/before/wf2-generate.sdk.js --node "Build OpenRouter Image"`, same for
`../ops/before/wf3-edit.sdk.js`) into the node, Save, Publish - or send that export as `update_workflow` operations. Nothing else changed.

## Later

`n8n/ops/wf2.ops.json` (Step C, Style Card v2) carries the identical WF-2 `Build OpenRouter Image` node, so Step C re-applies it
idempotently. `n8n/ops/wf3.ops.json` (Step C + the WF-3 region lane) carries the MAIN WF-3 node: the same pruning tail plus the region branch
in its head, which only makes sense once the region lane nodes exist - hence the region-free hot-fix node here. The sticky notes are updated
by Step C only (`wf2.sticky.ops.json` / `wf3.sticky.ops.json`). Tests: `node n8n/tools/test-openrouter-hotfix.js` (this bundle),
`node n8n/tools/test-openrouter-caps.js` (network: live descriptors vs the static table incl. the ratio lists, and every built body at 1:1
and 4:5 - the WF-3 region lane with a really 4:5 parent throws the fit message where no listed ratio is within 1 %; `--write` refreshes
`n8n/tools/fixtures/openrouter-caps/`), plus the node checks in `test-wf2-prompts.js` and `test-wf3-region.js`.

Known limitations (Step C's main WF-3 node, not this bundle): Fix an area on GPT Image for a parent whose real shape GPT Image cannot render
(a really 4:5 Kie- or Gemini-made full_front / back / tote card) fails before the paid call with the fit message above - tracked in
`tests/e2e/BUGS.md` E2E-022 until region-composite pads / crops a regeneration to the parent or the region lane picks a model that lists the
parent's ratio (gemini-2.5-flash-image and gemini-3 list 4:5). Offline (static table) `input_references` is not clamped - the static caps carry
`{type: any}` for it, the live descriptor's max is 3 on gemini-2.5-flash-image, 14 on gemini-3, 16 on gpt-image - so a card with more than 3
references on gemini-2.5-flash-image still gets a 400 when the descriptor GET failed; accepted residual, the live descriptor is the normal path.
