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
};
