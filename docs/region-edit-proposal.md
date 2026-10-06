# Fix an area with GPT Image 2.5 — proposal (not implemented)

Status: DECIDED 2026-10-05 (user): Fix an area = GPT Image 2.5 Sunburst on OpenRouter, locked outside (no OpenAI key, no masked edit); built per the architect plan: region-composite, studio_29, prompt-engine region lane, qc-judge v2.3, WF-3 region lane

## 1. What is wrong today (measured on 4 real region edits)

Today "Fix an area" sends two pictures to Nano Banana (`google/gemini-2.5-flash-image`): the design and a black/white box picture. n8n then
resizes the model's output, cuts the box out of it and pastes it onto the original with a hard edge.

| Edit | Outside the box | Seam (colour jump at the box edge vs. the original) | Model redraw shifted by |
|---|---|---|---|
| b33727a9 sunglasses → red | 0 px changed | 1.47× | 7 px right, 1 up |
| 354c1ae2 rose → sunflower | 0 px changed | 2.75× | ~1 px |
| 45eadf6a rose → sunflower | 0 px changed | 3.69× (worst) | 8 px right, 1 down |
| dace73f3 bear → tiger | 0 px changed | 2.2× | 6 px right |

Causes, in order of size:
1. Nano Banana does not know the box picture is a mask; it redraws the whole design and the redraw lands 1–8 px off (different every run).
2. n8n never lines the redraw up with the original before cutting the box out.
3. The paste is a razor-hard rectangle, so fur, hair, outlines and ridges step 6–8 px at the border.
4. New objects bigger than the box get sliced flat (the sunflowers).
5. A small tint step (blacks ~5 levels lighter, grey background 3–7 levels bluer).

Evidence: `docs/region-edit/sunflower-sliced.png`, `fur-seam-closeup.png`, `bear-tiger-seam.png`.

## 2. What GPT Image 2.5 officially supports (verified)

- **OpenAI API, called directly, supports a real masked edit (inpainting) with Sunburst.** `POST https://api.openai.com/v1/images/edits`, model
  `gpt-image-2.5-sunburst` (snapshot `-2026-09-08`); the model page lists "inpainting" and "Image edit v1/images/edits: Supported".
  - Mask: a PNG with an alpha channel, same dimensions as the image, < 4 MB; "fully transparent areas (alpha zero) indicate where image should
    be edited". Our current mask (white box on black, no alpha) cannot be sent as it is, and OpenAI's sample conversion would invert it.
  - Output size can be set to exactly the original (WxH, multiples of 16; above 2560×1440 is "experimental", so 2048×2048 is allowed but
    experimental). Quality low…max; `input_fidelity` must be omitted for 2.5.
  - **The mask is guidance, not a lock:** "Masking with GPT Image is entirely prompt-based. The model uses the mask as guidance, but may not
    follow its exact shape with complete precision." And: "If a region must remain pixel-identical, composite the approved edit into the
    original image instead of relying on prompting alone." (developers.openai.com image-generation / image-prompting guides)
  - The "mark an area" feature on OpenAI's site (ChatGPT) is not pixel-precise either: "Highlights are not always precise, and edits may extend
    beyond the area you selected." (help.openai.com)
  - Tested on OpenAI's own Sunburst mask example: **no shift at all (0 px)** — the main cause of today's seam disappears — but the model still
    redraws outside the mask (about 16% of outside pixels changed by > 20 levels after colour correction).
- **Kie:** GPT Image 2.5 Sunburst has text-to-image and image-to-image only (prompt, input_urls, aspect_ratio, resolution, background). No
  mask field anywhere in its schema.
- **OpenRouter:** no mask, no edits endpoint, `size`/`resolution` are not supported for Sunburst (which is why we get 1024 px); only
  `input_references`. A mask sent there is just another reference picture — exactly today's failure.

**Conclusion:** a true GPT 2.5 marked edit needs a direct OpenAI API key. And even then, keeping the rest of the design identical needs a
smarter paste-back, as OpenAI itself recommends.

## 3. Recommended solution — "GPT 2.5 marked edit, locked outside"

What the designer does (same as today, plus a hint):
1. Draw the box. A thin dashed line appears just outside it (~3% of the width): "Pixels between your box and this line may be softly blended;
   nothing beyond this line will change."
2. Type the change.

What happens:
3. WF-3 sends the original to OpenAI `gpt-image-2.5-sunburst` `/v1/images/edits` with a real transparent-hole mask built from the saved box
   (same size as the image), `size` = the original's exact size, quality high, PNG, opaque background, and a prompt that describes the whole
   design, then: "Change only <instruction> inside the transparent area; keep the new element fully inside it; keep everything else exactly as
   it is — no shifting, zooming, recolouring or text changes."
4. The full regenerated image comes back at the same size; it is saved untouched as the "full regen" copy.
5. The final picture is built from original + full regen:
   a. size check (exact, never stretched; retry once, then backup route);
   b. alignment check (measure and correct any shift);
   c. colour match (remove the small overall tint measured just outside the box, max 16 levels);
   d. combine: new pixels inside the box, a soft fade between the box and the dashed line, original pixels byte-for-byte beyond it;
   e. safety lock: pixels beyond the dashed line must equal the original exactly (0 differences) or the result is blocked.
6. If the new object spills past the dashed line (the sunflower case), the designer sees "Trimmed to your area" vs "Extend area by N px" —
   re-combining from the saved regen costs $0, no new AI call.
7. "Use full GPT regeneration" button (the literal ask): shows the raw full image with a score of how much changed outside the box; offered as
   safe only when ≥ 99% of outside pixels stay within 8 levels after colour matching and QC confirms the text is unchanged; otherwise
   available with a warning.
8. QC gains region questions: instruction done? seam visible? new object cut off? text unchanged? One automatic retry on failure.
9. Backup route when OpenAI is down/refuses/no key: today's model (or Kie GPT 2.5 without a mask) through the same steps 5–8, labelled
   "approximate". Simulated on the 4 old edits, alignment + soft edge alone cut visible border steps from 27–54% to 9–35% of lines.

Rejected: keeping GPT's full output every time (changes ~16–35% of outside pixels on OpenAI's own example — risky for text and the grey
background); GPT 2.5 via Kie/OpenRouter (no mask); today's hard paste; other mask models (not GPT 2.5).

## 4. Before building: a half-day probe (~5 OpenAI calls, about $0.3–0.6)

Rerun b33727a9 (sunglasses), 45eadf6a twice (sunflower, worst seam + overflow), dace73f3 (bear → tiger, flat art) and one 2048 px parent with
the exact request above, then combine offline. Pass if: size exact 5/5; shift ≤ 1 px 5/5; 0 changed pixels beyond the ring 5/5 (hard gate);
seam ratio ≤ 1.2 at the box and ring edges; ghosting ≤ 3%; edit done on ≥ 3 of 4; cost at 1024 ≤ $0.10. The same probe decides whether "use
full regeneration" can ever be the default and whether 2048 works or 2K parents should be edited at 1024 and upscaled.

## 5. Cost, time, effort

| Route | Per edit |
|---|---|
| Today, Nano Banana (Kie / OpenRouter) | ~$0.02–0.04 |
| Proposed, OpenAI Sunburst high 1024×1024 | ~$0.06–0.08 |
| Proposed, OpenAI Sunburst high 2048×2048 | ~$0.12–0.15 |
| Sunburst medium 1024 (if the probe shows it is good enough) | ~$0.02 + input |

Latency undocumented ("longer generation times") — measure in the probe; n8n timeout ~300 s. OpenAI Tier 1 allows 5 images/minute, so
region edits need a queue. Build ≈ 4 days after the probe (app mask builder + ring + buttons 1d; DB columns 0.25d; region prompt template
0.5d; WF-3 OpenAI lane + composite Code node 1.5d; region QC 0.5d; tuning 0.5d).

Needs from the user: an OpenAI API key (pasted into WF-0 like the other keys), possibly OpenAI Organization Verification, and a decision on
the ~3× cost per region edit.
