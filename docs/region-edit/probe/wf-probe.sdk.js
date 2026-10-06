import { workflow, node, trigger, expr } from '@n8n/workflow-sdk';

const configWorkflowId = 'vbyjWhK4ZRN9uZUM';

const startProbe = trigger({
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: { name: 'Start Probe', position: [0, 300] },
  output: [{}]
});

const loadConfig = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.2,
  config: {
    name: 'Load Config',
    parameters: {
      workflowId: { __rl: true, mode: 'id', value: configWorkflowId, cachedResultName: 'DM Studio · WF-0 Studio Config' },
      workflowInputs: { mappingMode: 'defineBelow', value: {}, matchingColumns: [], schema: [], attemptToConvertTypes: false, convertFieldsToString: true },
      mode: 'once',
      options: { waitForSubWorkflow: true }
    },
    executeOnce: true,
    position: [240, 300]
  },
  output: [{ sbUrl: 'https://voatrqhfsdfjomyajovi.supabase.co', anonKey: 'redacted', studioSecret: 'redacted', openrouterKey: 'redacted' }]
});

const signInputs = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Sign Inputs',
    parameters: {
      method: 'POST',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/storage/v1/object/sign/gens"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") },
          { name: 'Content-Type', value: 'application/json' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: "{\"expiresIn\": 3600, \"paths\": [\"1bed5147-72ba-460c-a66f-e15e35f5a02d/1662b2d0-4e77-48d1-b95b-56f14438fd9e.png\", \"72354a02-7b0c-47bf-aef5-536b8d8acf56/9f1a2765-559b-4a03-8c06-d5b318b5bd20.png\", \"f3e4ed09-39bc-4b28-9e04-814f6e6c8e0f/fc1a7553-c303-4d7e-8f89-93ce97bacad6.png\", \"probe/region-2026-10-05/45eadf6a_marked.png\", \"probe/region-2026-10-05/45eadf6a_mask.png\", \"probe/region-2026-10-05/b33727a9_marked.png\", \"probe/region-2026-10-05/b33727a9_mask.png\", \"probe/region-2026-10-05/dace73f3_marked.png\", \"probe/region-2026-10-05/dace73f3_mask.png\"]}",
      options: { timeout: 30000, response: { response: { responseFormat: 'json', outputPropertyName: 'signed' } } }
    },
    executeOnce: true,
    position: [480, 300]
  },
  output: [{ signed: [{ path: 'probe/x.png', signedURL: '/object/sign/gens/probe/x.png?token=redacted' }] }]
});

const probeCases = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Probe Cases',
    parameters: { jsCode: "const spec = [{\"cid\": \"b33727a9\", \"instruction\": \"change the sunglass color to red\", \"where\": \"the area from 40% to 70% across and 28% to 43% down the image\", \"parent\": \"f3e4ed09-39bc-4b28-9e04-814f6e6c8e0f/fc1a7553-c303-4d7e-8f89-93ce97bacad6.png\", \"mask\": \"probe/region-2026-10-05/b33727a9_mask.png\", \"marked\": \"probe/region-2026-10-05/b33727a9_marked.png\", \"out\": \"probe/region-2026-10-05/b33727a9\"}, {\"cid\": \"45eadf6a\", \"instruction\": \"change the flower from rose to sunflower\", \"where\": \"the area from 44% to 83% across and 37% to 51% down the image\", \"parent\": \"72354a02-7b0c-47bf-aef5-536b8d8acf56/9f1a2765-559b-4a03-8c06-d5b318b5bd20.png\", \"mask\": \"probe/region-2026-10-05/45eadf6a_mask.png\", \"marked\": \"probe/region-2026-10-05/45eadf6a_marked.png\", \"out\": \"probe/region-2026-10-05/45eadf6a\"}, {\"cid\": \"dace73f3\", \"instruction\": \"make the bear to look like a tiger\", \"where\": \"the area from 49% to 72% across and 50% to 67% down the image\", \"parent\": \"1bed5147-72ba-460c-a66f-e15e35f5a02d/1662b2d0-4e77-48d1-b95b-56f14438fd9e.png\", \"mask\": \"probe/region-2026-10-05/dace73f3_mask.png\", \"marked\": \"probe/region-2026-10-05/dace73f3_marked.png\", \"out\": \"probe/region-2026-10-05/dace73f3\"}];\nconst signed = {};\nconst rows = Array.isArray($input.first().json.signed) ? $input.first().json.signed : $input.all().map((i) => i.json);\nfor (const s of rows) { if (s && s.path && s.signedURL) signed[s.path] = $('Load Config').first().json.sbUrl + '/storage/v1' + s.signedURL; }\nconst ref = (p) => { if (!signed[p]) throw new Error('not signed ' + p.replace(/:/g, '-')); return { type: 'image_url', image_url: { url: signed[p] } }; };\nconst out = [];\nfor (const s of spec) {\n  const base = 'TARGETED EDIT OF AN EXISTING DESIGN. Image 1 is the finished print design. Change ONLY this: ' + s.instruction + '. The change happens only in ' + s.where + '. Keep the new element inside that area, at a size that fits it, drawn in the same art style, line weight, texture and colour palette as the rest of the design. EVERYTHING ELSE must stay exactly identical to Image 1 - the same framing and position (no shifting, zooming or cropping), the same composition, every line, texture and colour, all lettering and text, and the flat grey background. Output the complete design at exactly the same framing as Image 1.';\n  const v = [\n    ['A_mask', base + ' Image 2 is a black-and-white mask of the same size - the WHITE rectangle marks the only area that may change; everything black must stay identical.', [s.parent, s.mask]],\n    ['B_marked', base + ' Image 2 is the same design with a red rectangle drawn around the only area to change. The red rectangle is a marker only - never draw it; edit Image 1.', [s.parent, s.marked]],\n    ['C_words', base, [s.parent]]\n  ];\n  for (const [name, prompt, refs] of v) out.push({ json: { key: s.cid + '_' + name, out_path: s.out + '_' + name + '_out.png', body: { model: 'openai/gpt-image-2.5-sunburst', prompt, input_references: refs.map(ref), aspect_ratio: '1:1', quality: 'high', background: 'opaque', n: 1 } } });\n}\nreturn out;" },
    position: [720, 300]
  },
  output: [{ key: 'b33727a9_A_mask', out_path: 'probe/x.png', body: { model: 'openai/gpt-image-2.5-sunburst' } }]
});

const callSunburst = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Call Sunburst',
    parameters: {
      method: 'POST',
      url: 'https://openrouter.ai/api/v1/images',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'Authorization', value: expr("Bearer {{ $('Load Config').first().json.openrouterKey }}") },
          { name: 'Content-Type', value: 'application/json' },
          { name: 'X-Title', value: 'DM Studio probe' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify($json.body) }}'),
      options: { timeout: 300000, batching: { batch: { batchSize: 3, batchInterval: 1000 } } }
    },
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [960, 300]
  },
  output: [{ data: [{ b64_json: 'iVBORw0KGgo=', media_type: 'image/png' }], usage: { cost: 0.07 } }]
});

const decodeResult = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Decode Result',
    parameters: {
      mode: 'runOnceForEachItem',
      jsCode: "const c = $('Probe Cases').item.json;\nconst d = (Array.isArray($json.data) && $json.data[0]) || {};\nconst b64 = String(d.b64_json || '').replace(/^data:[^,]*,/, '');\nif (!b64) { return { json: { key: c.key, ok: false, error: JSON.stringify($json).slice(0, 300) } }; }\nreturn { json: { key: c.key, ok: true, out_path: c.out_path, cost_usd: ($json.usage && $json.usage.cost) || null }, binary: { data: { data: b64, mimeType: d.media_type || 'image/png', fileName: 'out.png', fileExtension: 'png' } } };"
    },
    position: [1200, 300]
  },
  output: [{ key: 'b33727a9_A_mask', ok: true, out_path: 'probe/x.png', cost_usd: 0.07 }]
});

const uploadResult = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Upload Result',
    parameters: {
      method: 'POST',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/storage/v1/object/gens/{{ $json.out_path || 'probe/region-2026-10-05/failed.txt' }}"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") },
          { name: 'Content-Type', value: 'image/png' },
          { name: 'x-upsert', value: 'true' }
        ]
      },
      sendBody: true,
      contentType: 'binaryData',
      inputDataFieldName: 'data',
      options: { timeout: 120000 }
    },
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [1440, 300]
  },
  output: [{ Key: 'gens/probe/x.png' }]
});

export default workflow('dm-studio-probe-region', 'DM Studio · PROBE region edit (temporary)')
  .add(startProbe)
  .to(loadConfig)
  .to(signInputs)
  .to(probeCases)
  .to(callSunburst)
  .to(decodeResult)
  .to(uploadResult);
