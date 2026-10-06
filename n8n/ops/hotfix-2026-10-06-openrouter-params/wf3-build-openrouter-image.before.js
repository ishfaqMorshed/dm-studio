const pe = $('Prompt Engine').first().json;
const src = ($json.body && $json.body.input) ? $json.body : $('Build Edit Task').first().json.body;
if (!src || !src.input || !src.input.prompt) throw new Error('no edit request to send to OpenRouter');
const models = pe.openrouter_models || {};
const refs = (src.input.image_urls || []).map((url) => ({ type: 'image_url', image_url: { url } }));
const body = { model: models.edit || 'google/gemini-2.5-flash-image', prompt: String(src.input.prompt).slice(0, 20000), n: 1, aspect_ratio: pe.aspect_ratio || '1:1', resolution: pe.resolution || '2K', output_format: 'png' };
if (refs.length) body.input_references = refs;
return { json: { body } };