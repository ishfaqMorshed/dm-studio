// Recorded / reconstructed vendor QC responses for qc_test.ts.
// live006b5ba1 and live4199a165 are rebuilt from the stored generations.qc_report rows (fetched read-only 2026-09-30):
// generations has no qc_raw column, so the 9 booleans, text_found, issues, pass and the v1 tail keys are the exact
// values the judge reported, re-serialised. Neither carries the qc_prompt v2 "style" key (v1 template was active).
export const FIXTURES = {
  cleanPass: '{"text_found":"FAMILY FIRST","text_matches":true,"text_once":true,"extra_text":false,"text_legible":true,"no_halos":true,"background_ok":true,"no_shadows":true,"flat_artwork":true,"edges_clean":true,"issues":[],"pass":true,"palette_ok":true,"style_violations":[],"min_text_height_frac":0.09}',
  textFail: {
    text_found: 'FAMILY FRIST © 2024', text_matches: false, text_once: true, extra_text: true, text_legible: true, no_halos: true,
    background_ok: true, no_shadows: true, flat_artwork: true, edges_clean: true,
    issues: ['Spell the text exactly "FAMILY FIRST"', 'Remove the watermark'], pass: false,
  },
  malformed: 'Sorry, I cannot inspect this image. {"text_found": "FAMILY FIRST", "pass": tru',
  fenced: 'Here is the verdict:\n```json\n{"text_found":"FAMILY FIRST","text_matches":"true","extra_text":"false","text_legible":true,"no_halos":true,"background_ok":"false","no_shadows":true,"flat_artwork":true,"edges_clean":true,"issues":["Make the background one flat solid grey"],"pass":"false","style_violations":["uses a gradient behind the lettering"]}\n```\nLet me know if you need more.',
  geminiEnvelope: { id: 'x', choices: [{ message: { role: 'assistant', content: '```json\n{"text_found":"FAMILY FIRST","text_matches":true,"text_once":true,"extra_text":false,"text_legible":true,"no_halos":true,"background_ok":true,"no_shadows":true,"flat_artwork":true,"edges_clean":true,"issues":[],"pass":true,"min_text_height_frac":"12%"}\n```' } }] },
  styleOnly: '{"text_found":"FAMILY FIRST","text_matches":true,"text_once":true,"extra_text":false,"text_legible":true,"no_halos":true,"background_ok":true,"no_shadows":true,"flat_artwork":true,"edges_clean":true,"issues":[],"pass":true,"palette_ok":false,"style_violations":["neon pink accent is not in the palette"]}',
  noTextFail: '{"text_found":"SAMPLE","text_matches":false,"text_once":true,"extra_text":true,"text_legible":true,"no_halos":true,"background_ok":true,"no_shadows":true,"flat_artwork":true,"edges_clean":true,"issues":["Remove all text"],"pass":false}',

  // generation 006b5ba1 (Chicken Happy Hour test render, qc_prompt v1): pass, score 100, palette_ok true,
  // style_violations ['Omitting the bottom center social media handle'] - no "style" key.
  live006b5ba1: '{"text_found":"CHICKEN HAPPY HOUR EST. 2026","text_matches":true,"text_once":true,"extra_text":false,"text_legible":true,"no_halos":true,"background_ok":true,"no_shadows":true,"flat_artwork":true,"edges_clean":true,"issues":[],"pass":true,"palette_ok":true,"style_violations":["Omitting the bottom center social media handle"]}',
  // generation 4199a165 (raccoon, qc_prompt v1): the judge said pass:false with all 9 checks true (its issues were style
  // and letter-case complaints) - v1 verdict 'fail' with needs_regen false, v2 verdict 'warn'.
  live4199a165: '{"text_found":"I am racoon baby Adore ME I love to eat","text_matches":true,"text_once":true,"extra_text":false,"text_legible":true,"no_halos":true,"background_ok":true,"no_shadows":true,"flat_artwork":true,"edges_clean":true,"issues":["Restrict colors strictly to the locked palette (remove yellow, pink, and brown from the burger and mouth).","Change all text to uppercase to match the style card typography rules."],"pass":false}',

  // qc_prompt v2 shapes ("style" key)
  v2WrongHero: '{"text_found":"CHICKEN HAPPY HOUR EST. 2026","text_matches":true,"text_once":true,"extra_text":false,"text_legible":true,"no_halos":true,"background_ok":true,"no_shadows":true,"flat_artwork":true,"edges_clean":true,"issues":[],"pass":true,"style":{"subject_seen":"a chicken","subject_ok":false,"palette_ok":true,"off_palette_colours":[],"medium_ok":true,"typography_ok":true,"composition_ok":true,"forbid_hits":[],"case_seen":"UPPER","text_height_ok":true,"min_text_height_frac":0.08,"cropped":false}}',
  v2PaletteOnly: '{"text_found":"CHICKEN HAPPY HOUR EST. 2026","text_matches":true,"text_once":true,"extra_text":false,"text_legible":true,"no_halos":true,"background_ok":true,"no_shadows":true,"flat_artwork":true,"edges_clean":true,"issues":[],"pass":true,"style":{"subject_seen":"a highland cow","subject_ok":true,"palette_ok":false,"off_palette_colours":[{"name":"teal","hex":"#2f8f8f","area":"small"}],"medium_ok":true,"typography_ok":true,"composition_ok":true,"forbid_hits":[],"case_seen":"UPPER","text_height_ok":true,"min_text_height_frac":0.07,"cropped":false}}',
  v2ForbidHit: '{"text_found":"CHICKEN HAPPY HOUR EST. 2026","text_matches":true,"text_once":true,"extra_text":false,"text_legible":true,"no_halos":true,"background_ok":true,"no_shadows":true,"flat_artwork":true,"edges_clean":true,"issues":[],"pass":true,"style":{"subject_seen":"a highland cow","subject_ok":true,"palette_ok":true,"off_palette_colours":[],"medium_ok":true,"typography_ok":true,"composition_ok":false,"forbid_hits":[5],"case_seen":"Title","text_height_ok":true,"min_text_height_frac":0.05,"cropped":false}}',
  v2AllGood: '{"text_found":"CHICKEN HAPPY HOUR EST. 2026","text_matches":true,"text_once":true,"extra_text":false,"text_legible":true,"no_halos":true,"background_ok":true,"no_shadows":true,"flat_artwork":true,"edges_clean":true,"issues":[],"pass":true,"style":{"subject_seen":"a highland cow","subject_ok":true,"palette_ok":true,"off_palette_colours":[],"medium_ok":true,"typography_ok":true,"composition_ok":true,"forbid_hits":[],"case_seen":"UPPER","text_height_ok":true,"min_text_height_frac":0.09,"cropped":false}}',
  v2CroppedAndSmall: '{"text_found":"CHICKEN HAPPY HOUR EST. 2026","text_matches":true,"text_once":true,"extra_text":false,"text_legible":true,"no_halos":true,"background_ok":true,"no_shadows":true,"flat_artwork":true,"edges_clean":true,"issues":["Keep the artwork inside the frame"],"pass":true,"style":{"subject_seen":"a highland cow","subject_ok":true,"palette_ok":true,"off_palette_colours":[],"medium_ok":true,"typography_ok":true,"composition_ok":true,"forbid_hits":[],"case_seen":"UPPER","text_height_ok":false,"min_text_height_frac":0.02,"cropped":true}}',
};

/** generations 006b5ba1 style_card_snapshot forbid list (Chicken v2 draft) - forbid[4] is the text demand the validator removes. */
export const CHICKEN_FORBID = [
  'Gradients and soft airbrush shading',
  'Photorealism or 3D rendering',
  'Clean, minimalist flat-vector icons without texture',
  'Asymmetrical or left-aligned layouts',
  'Omitting the bottom center social media handle',
  'Heavy grunge that severely obscures or eats away at the legibility of the typography',
];
