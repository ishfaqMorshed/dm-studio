const pe = $('Prompt Engine').first().json;
const src = ($json.body && $json.body.input) ? $json.body : ($('Build Corrective Prompt').isExecuted ? $('Build Corrective Prompt').last().json.body : $('Build Create Task').first().json.body);
if (!src || !src.input || !src.input.prompt) throw new Error('no image request to send to OpenRouter');
const models = pe.openrouter_models || {};
const refs = (src.input.input_urls || []).map((url) => ({ type: 'image_url', image_url: { url } }));
const body = { model: models.image || 'openai/gpt-image-2.5-sunburst', prompt: String(src.input.prompt).slice(0, 20000), n: 1, aspect_ratio: src.input.aspect_ratio || pe.aspect_ratio || '1:1', resolution: src.input.resolution || pe.resolution || '2K', output_format: 'png', background: 'opaque' };
if (refs.length) body.input_references = refs;
return { json: { body } };