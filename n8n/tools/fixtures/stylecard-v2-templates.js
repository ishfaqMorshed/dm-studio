// Verbatim copies of the Style Card v2 prompt_templates rows (spec docs/stylecard-v2-spec.md section 1.4).
// The migration supabase/migrations/20260930_studio_21_style_card_v2.sql is the source of truth once it lands;
// this fixture lets n8n/tools/test-wf1b-style.js render the WF-1b requests without a database.
module.exports = {
  style_sheet: {
    slug: 'style_sheet',
    version: 1,
    body: `Attached are {{IMAGE_COUNT}} past designs of one print-on-demand client, IMAGE 1 .. IMAGE {{IMAGE_COUNT}} in the order attached. Describe EACH image separately as flat printed artwork (ignore garment, body, folds, glare, perspective, app UI). Where a list of allowed values is given use ONLY one of them; free-text fields have the word limit shown. Transcribe every word you see exactly.
Per-image notes from the studio (garment, mockup, outlier):
{{REFERENCE_NOTES}}
Return ONLY {"sheets":[...]} with exactly one object per image, in order, no markdown fences:
{"image":1,"quality":"clean|draft|mockup|screenshot|low_res","garment_seen":"black|white|heather|navy|tan|other|none","colorway":"dark_garment|light_garment|unknown","medium":"<=8 words","realism":"iconic|stylised|detailed|realistic","line_weight":"none|hairline|fine|medium|bold|heavy","line_style":"<=8 words","outline":"none|thin|thick|keyline","shading":"none|flat|hatching|stipple|halftone|cel|painterly|gradient","texture":"<=6 words","edge_finish":"clean|rough|distressed|stamped","layout":"stacked|badge|arched_lockup|split_panel|scene|text_only|other","hero":{"subject":"<=6 words","framing":"chest_up|full_figure|head_only|scene|object|none","scale":"small|medium|large|fills"},"supporting_elements":["<=4 words"],"swatches":[{"hex":"#RRGGBB","role":"line|fill|text|disc|accent","area":"dominant|secondary|accent"}],"text":[{"text":"exact transcription","role":"headline|sub|handle|est|tagline|brand|other","family":"slab_serif|display_serif|condensed_sans|grotesk_sans|script|brush|blackletter|woodtype|stencil|hand_lettered|other","weight":"light|regular|bold|black","case":"UPPER|lower|Title|Mixed","effects":["arched","inline_hatching","outline","banner","drop_line","distressed"],"placement":"above_hero|below_hero|on_hero|bottom_margin|inside_badge|none"}],"mood":["<=2 words"],"off_style":false}`
  },
  style_profiler: {
    slug: 'style_profiler',
    version: 3,
    body: `You are a precise visual analyst building the STYLE CARD for one print-on-demand client. Attached are {{IMAGE_COUNT}} of this client's PAST DESIGNS, numbered in the order attached (IMAGE 1 .. IMAGE {{IMAGE_COUNT}}). Describe the client's recurring visual identity - the look that makes every design recognisable - NOT any single design.

IMPORTANT: an image may be a rough draft, a shirt mockup, worn, angled, folded, a screenshot or distorted. Judge ONLY the flat printed DESIGN ARTWORK as if seen flat and straight-on; ignore garment, body, background, perspective, folds, glare and app UI.

CLIENT BRIEF from the studio. The brief is ground truth for WHAT the client makes (subjects), the brand text, the garments and the rules; the images are ground truth for HOW things are drawn.
- Client: {{CLIENT_NAME}}. Niche / audience: {{NICHE}}
- Subjects the client sells designs about: {{SUBJECTS}}
- Brand text that recurs on designs (a handle, an EST. line, a tagline): {{BRAND_TEXT}}
- Garments the client prints on: {{GARMENT_COLORS}}
- Notes: {{CLIENT_NOTES}}
- Must-have signature moves: {{MUST_HAVE}}
- Never do: {{AVOID}}
- Typography note: {{TYPOGRAPHY_NOTE}}
- Studio rules, for your information only - NEVER write these words into any field: palette {{PALETTE_MODE}}, text case {{TEXT_CASE}}, typography {{LOCK_TYPOGRAPHY}}, composition {{LOCK_COMPOSITION}}.
Per-image notes from the studio:
{{REFERENCE_NOTES}}

PER-IMAGE SHEETS - a first pass already described each image with a fixed vocabulary. Use them as your evidence and cite their IMAGE numbers:
{{SHEETS_JSON}}

RULES
1. A claim enters the card only when it holds for the MAJORITY of images whose sheet is not off_style and whose quality is clean or draft; record every exception in evidence.
2. subjects = every brief subject first, in the client's words, then the recurring subjects you see. Never drop a brief subject because the images lack it. Fill subject_sources with brief, images or both for each entry.
3. Brand text is TEXT, not style. Put every recurring handle, EST. line, brand name or tagline into brand_text.items with its usual placement and NOWHERE else. composition, typography, signature_moves and forbid describe only what is DRAWN. A forbid entry names a visual thing that must never appear - never something that must be present.
4. Vocabulary: linework.weight is exactly one of none|hairline|fine|medium|bold|heavy; shading_method one of none|flat|hatching|stipple|halftone|cel|painterly; edge_finish one of clean|rough|distressed|stamped; realism one of iconic|stylised|detailed|realistic; typography.case is the case the images actually use: UPPER|lower|Title|Mixed; lettering family one of slab_serif|display_serif|condensed_sans|grotesk_sans|script|brush|blackletter|woodtype|stencil|hand_lettered|other.
5. Lengths: medium, shading, texture and linework.style at most 12 words; composition at most 40 words, naming no subject (write "the hero") and no words from the designs; each forbid and signature move at most 10 words; no trailing periods anywhere.
6. Colours: 3 to 8 palette entries, hex as #RRGGBB uppercase, exactly one dominant listed first, each with a role (line|fill|text|disc|accent|highlight) and the IMAGE numbers it appears in. When the images split into colourways (for example white ink on dark garments and full colour on light garments) add one palette_variants entry per garment side.
7. must_have: fold an item into signature_moves ONLY when you see it in at least two images; list the others under brief_check.must_have_not_seen verbatim. Never write an avoid item into evidence unless you saw it - then cite it under brief_check.avoid_seen_in.
8. For every field you fill, list in field_evidence the IMAGE numbers that support it and those that contradict it. representative_images = the 3 IMAGE numbers that best show the whole look.
9. BACKGROUND is always exactly "flat mid-grey #808080, isolated artwork". garment_colors = the brief's garments when given; infer only when it says not given.
10. EVIDENCE: 5 to 15 short notes, each starting with "IMAGE n" (or "IMAGE n, m"), one claim each, plus one "IMAGE n: exception - ..." per image that disagrees with the majority.

Return ONLY this JSON object - no markdown fences, no commentary, every key present, no keys renamed:
{"schema":2,"medium":"","realism":"","linework":{"weight":"","style":"","outline":""},"shading":"","shading_method":"","texture":"","edge_finish":"","palette":[{"name":"","hex":"#RRGGBB","weight":"","role":"","images":[1]}],"palette_variants":[],"composition":"","hero":{"framing":"","scale":""},"typography":{"vibe":"","placement":"","case":"","headline":{"family":"","weight":"","effects":[]},"secondary":{"family":"","weight":"","effects":[]}},"background":"flat mid-grey #808080, isolated artwork","mood":["",""],"subjects":[""],"subject_sources":{},"brand_text":{"items":[],"always_present":false},"forbid":["",""],"signature_moves":[""],"garment_colors":[""],"representative_images":[1,2,3],"field_evidence":{},"brief_check":{"must_have_seen":[],"must_have_not_seen":[],"avoid_seen_in":[]},"evidence":["IMAGE n: short note"]}`
  }
};
