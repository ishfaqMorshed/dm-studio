import { workflow, node, trigger, sticky, placeholder, newCredential, ifElse, switchCase, merge, splitInBatches, nextBatch, languageModel, memory, tool, outputParser, embedding, embeddings, vectorStore, retriever, documentLoader, textSplitter, reranker, fromAi, expr } from '@n8n/workflow-sdk';

const supabaseUrl = 'https://voatrqhfsdfjomyajovi.supabase.co';
const n8nBaseUrl = 'https://n8n.srv1202488.hstgr.cloud';

const configWorkflowId = 'vbyjWhK4ZRN9uZUM';

const looseOptions = { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 1 };
const sampleConfig = { sbUrl: supabaseUrl, anonKey: 'sb_publishable_redacted', n8nBaseUrl, studioSecret: 'redacted', ideogramKey: 'redacted', imgbbKey: 'redacted', mlKey: 'redacted', upscaleModel: 'ultra_resolution', upscaleScale: 4 };
const sampleRejected = { rejected: true, reason: 'x-studio-secret header missing or wrong' };

const sampleJobId = '6f1d2c3b-4a5e-4f60-9a7b-8c9d0e1f2a3b';
const sampleCardId = '1a2b3c4d-5e6f-4a70-8b91-0c1d2e3f4a5b';
const sampleGenerationId = '9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b';

const sampleJob = {
  id: sampleJobId,
  card_id: sampleCardId,
  generation_id: sampleGenerationId,
  status: 'dispatched',
  attempt: 1,
  original_url: null,
  final_upload_token: null,
  prep_path: null,
  final_path: null,
  metrics: {},
  last_error: null,
  n8n_execution_id: null,
  started_at: null,
  finished_at: null
};

const finisherNote = sticky(
  '## DM Studio · WF-4 Finisher (Supabase ⇄ n8n ⇄ imgbb / ModelsLab / Ideogram)\n' +
  '**Config convention (no n8n credentials in this workflow).** Both triggers first run **Load Config** / **Load Dispatch Config** = Execute Workflow → *DM Studio · WF-0 Studio Config* (SDK const configWorkflowId = vbyjWhK4ZRN9uZUM, substituted with the WF-0 id at create time). WF-0 returns one item { sbUrl, anonKey, n8nBaseUrl, studioSecret, ideogramKey, imgbbKey, mlKey, upscaleModel, upscaleScale } and every downstream node reads $(\'Load Config\').first().json.<field> (dispatcher branch: $(\'Load Dispatch Config\')). **Secret OK?** / **Dispatch Secret OK?** compare the incoming x-studio-secret header with config.studioSecret and are the only webhook auth (both Webhook nodes: authentication none); a mismatch ends in the no-op Set *Rejected* / *Dispatch Rejected*. Every Supabase REST / RPC / Storage call sends headers apikey = anonKey and x-studio-secret = studioSecret (no Authorization header, no service-role key anywhere); Fire Worker and Ping Dispatcher send the same secret header and use config.n8nBaseUrl.\n\n' +
  '**Vendor keys from the same config item:** ImgBB Upload → query param key = imgbbKey; Build Upscale Req / Eval Upscale → body key = mlKey, model_id = upscaleModel (ultra_resolution), scale = upscaleScale (4); Ideogram RemoveBG → header Api-Key = ideogramKey. **What to paste where:** nothing here - paste studioSecret (private.secrets key studio_secret), ideogramKey, imgbbKey and mlKey once in WF-0 Studio Config → Set node *Studio Config*. Create WF-0 first, paste its id into configWorkflowId, then create this workflow and set WF-6 as its error workflow. Never publish from code.\n\n' +
  '**Dispatcher branch** (Dispatch Webhook studio-finisher-dispatch ← accept_generation trigger / pg_cron every 2 min / Worker pings): Load Dispatch Config → Dispatch Secret OK? → fin_claim_jobs → fire one Worker call per claimed job (batch 1 / 300 ms). pg_cron also requeues stale jobs, so there is no schedule trigger in this workflow.\n\n' +
  '**Worker branch** (Worker Webhook studio-finisher-worker; one job): Load Config → Secret OK? → Job Config (jobId) → Get Job (+ generations.image_path) → fin_job_update working → download the original from Storage bucket gens → Fit 1024 → ImgBB → ModelsLab ultra_resolution x4 (poll 6 s / resubmit on rate limit / 10-min cap) → event upscaled → Ideogram RemoveBG → event bg_removed → Fetch Result PNG → Set 300 DPI → upload to Storage finals/<card_id>/<generation_id>-final.png → fin_job_update done → ping Dispatcher. Any failure → Fail Message → fin_job_update failed (message ≤ 500 chars) → ping. Every status change goes through the fin_job_update RPC, which also writes fin_job_events and moves the card.\n\n' +
  '**Do not reorder:** Status → bg_removed is deliberately recorded BEFORE Fetch Result PNG. An HTTP Request node does not pass input binary through, so the RPC call must never sit between the PNG download and Set 300 DPI (the binary would be lost and the job stranded in working). Set 300 DPI is the owner\'s frozen code (byte-identical to the previous version).',
  { color: 4, width: 460, height: 1040, position: [-1000, 120] }
);

const dispatchWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Dispatch Webhook',
    parameters: {
      httpMethod: 'POST',
      path: 'studio-finisher-dispatch',
      responseMode: 'onReceived',
      options: {}
    },
    position: [-480, 704]
  },
  output: [{ headers: { 'content-type': 'application/json', 'x-studio-secret': 'redacted' }, params: {}, query: {}, body: { event: 'WORKER_DONE', job_id: sampleJobId }, webhookUrl: n8nBaseUrl + '/webhook/studio-finisher-dispatch', executionMode: 'production' }]
});

const loadDispatchConfig = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.2,
  config: {
    name: 'Load Dispatch Config',
    parameters: {
      workflowId: { __rl: true, mode: 'id', value: configWorkflowId, cachedResultName: 'DM Studio · WF-0 Studio Config' },
      mode: 'once',
      options: { waitForSubWorkflow: true }
    },
    executeOnce: true,
    position: [-240, 704]
  },
  output: [sampleConfig]
});

const dispatchSecretOk = ifElse({
  version: 2.2,
  config: {
    name: 'Dispatch Secret OK?',
    parameters: {
      conditions: {
        options: looseOptions,
        conditions: [
          { id: 'ds1', leftValue: expr("{{ $('Dispatch Webhook').first().json.headers?.['x-studio-secret'] ?? '' }}"), operator: { type: 'string', operation: 'equals' }, rightValue: expr("{{ $('Load Dispatch Config').first().json.studioSecret }}") }
        ],
        combinator: 'and'
      },
      options: {}
    },
    position: [0, 704]
  },
  output: [sampleConfig]
});

const dispatchRejected = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Dispatch Rejected',
    parameters: {
      mode: 'manual',
      assignments: {
        assignments: [
          { id: 'dr1', name: 'rejected', type: 'boolean', value: true },
          { id: 'dr2', name: 'reason', type: 'string', value: 'x-studio-secret header missing or wrong' }
        ]
      },
      includeOtherFields: false,
      options: {}
    },
    position: [240, 896]
  },
  output: [sampleRejected]
});

const claimJobs = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Claim Jobs',
    parameters: {
      method: 'POST',
      url: expr("{{ $('Load Dispatch Config').first().json.sbUrl }}/rest/v1/rpc/fin_claim_jobs"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'x-studio-secret', value: expr("{{ $('Load Dispatch Config').first().json.studioSecret }}") },
          { name: 'apikey', value: expr("{{ $('Load Dispatch Config').first().json.anonKey }}") },
          { name: 'Content-Type', value: 'application/json' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '{}',
      options: { timeout: 15000 }
    },
    executeOnce: true,
    onError: 'continueRegularOutput',
    position: [480, 704]
  },
  output: [sampleJob]
});

const hasJobId = node({
  type: 'n8n-nodes-base.filter',
  version: 2.2,
  config: {
    name: 'Has Job ID',
    parameters: {
      conditions: {
        options: looseOptions,
        conditions: [
          { id: 'h', leftValue: expr('{{ $json.id ?? "" }}'), operator: { type: 'string', operation: 'regex' }, rightValue: '^[0-9a-f-]{36}$' }
        ],
        combinator: 'and'
      },
      options: {}
    },
    position: [720, 704]
  },
  output: [sampleJob]
});

const fireWorker = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Fire Worker',
    parameters: {
      method: 'POST',
      url: expr("{{ $('Load Dispatch Config').first().json.n8nBaseUrl }}/webhook/studio-finisher-worker"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'x-studio-secret', value: expr("{{ $('Load Dispatch Config').first().json.studioSecret }}") },
          { name: 'Content-Type', value: 'application/json' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ job_id: $json.id }) }}'),
      options: {
        batching: { batch: { batchSize: 1, batchInterval: 300 } },
        timeout: 10000
      }
    },
    onError: 'continueRegularOutput',
    position: [960, 704]
  },
  output: [{ message: 'Workflow was started' }]
});

const workerWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Worker Webhook',
    parameters: {
      httpMethod: 'POST',
      path: 'studio-finisher-worker',
      responseMode: 'onReceived',
      options: {}
    },
    position: [-480, 208]
  },
  output: [{ headers: { 'content-type': 'application/json', 'x-studio-secret': 'redacted' }, params: {}, query: {}, body: { job_id: sampleJobId }, webhookUrl: n8nBaseUrl + '/webhook/studio-finisher-worker', executionMode: 'production' }]
});

const loadConfig = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.2,
  config: {
    name: 'Load Config',
    parameters: {
      workflowId: { __rl: true, mode: 'id', value: configWorkflowId, cachedResultName: 'DM Studio · WF-0 Studio Config' },
      mode: 'once',
      options: { waitForSubWorkflow: true }
    },
    executeOnce: true,
    position: [-240, 208]
  },
  output: [sampleConfig]
});

const secretOk = ifElse({
  version: 2.2,
  config: {
    name: 'Secret OK?',
    parameters: {
      conditions: {
        options: looseOptions,
        conditions: [
          { id: 's1', leftValue: expr("{{ $('Worker Webhook').first().json.headers?.['x-studio-secret'] ?? '' }}"), operator: { type: 'string', operation: 'equals' }, rightValue: expr("{{ $('Load Config').first().json.studioSecret }}") }
        ],
        combinator: 'and'
      },
      options: {}
    },
    position: [0, 208]
  },
  output: [sampleConfig]
});

const rejected = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Rejected',
    parameters: {
      mode: 'manual',
      assignments: {
        assignments: [
          { id: 'x1', name: 'rejected', type: 'boolean', value: true },
          { id: 'x2', name: 'reason', type: 'string', value: 'x-studio-secret header missing or wrong' }
        ]
      },
      includeOtherFields: false,
      options: {}
    },
    position: [240, 400]
  },
  output: [sampleRejected]
});

const jobConfig = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Job Config',
    parameters: {
      mode: 'manual',
      assignments: {
        assignments: [
          { id: 'c5', name: 'jobId', type: 'string', value: expr('{{ $(\'Worker Webhook\').first().json.body?.job_id ?? "" }}') }
        ]
      },
      includeOtherFields: false,
      options: {}
    },
    position: [240, 208]
  },
  output: [{ jobId: sampleJobId }]
});

const getJob = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Get Job',
    parameters: {
      method: 'GET',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/fin_jobs?id=eq.{{ $('Job Config').first().json.jobId }}&select=*,generations(image_path)"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") },
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") }
        ]
      },
      options: { timeout: 15000 }
    },
    onError: 'continueErrorOutput',
    position: [480, 208]
  },
  output: [{ ...sampleJob, generations: { image_path: sampleCardId + '/' + sampleGenerationId + '.png' } }]
});

const statusWorking = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Status → working',
    parameters: {
      method: 'POST',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/rpc/fin_job_update"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") },
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
          { name: 'Content-Type', value: 'application/json' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_job_id: $('Get Job').first().json.id, p_status: 'working', p_fields: { n8n_execution_id: String($execution.id) }, p_event: 'working', p_ok: true, p_message: 'worker started' }) }}"),
      options: { timeout: 15000 }
    },
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [720, 208]
  },
  output: [{ ...sampleJob, status: 'working', n8n_execution_id: '12345' }]
});

const downloadOriginal = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Download Original',
    parameters: {
      method: 'GET',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/storage/v1/object/gens/{{ $('Get Job').first().json.generations?.image_path ?? '' }}"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") },
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") }
        ]
      },
      options: {
        response: { response: { responseFormat: 'file' } },
        timeout: 120000
      }
    },
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 3000,
    onError: 'continueErrorOutput',
    position: [960, 208]
  },
  output: [{ json: {}, binary: { data: { fileName: 'original.png', mimeType: 'image/png', fileExtension: 'png' } } }]
});


const fit1024 = node({
  type: 'n8n-nodes-base.editImage',
  version: 1,
  config: {
    name: 'Fit 1024',
    parameters: {
      operation: 'resize',
      width: 1024,
      height: 1024,
      resizeOption: 'onlyIfLarger',
      options: {}
    },
    onError: 'continueErrorOutput',
    position: [1440, 208]
  },
  output: [{ json: {}, binary: { data: { fileName: 'original.png', mimeType: 'image/png', fileExtension: 'png' } } }]
});

const imgbbUpload = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'ImgBB Upload',
    parameters: {
      method: 'POST',
      url: 'https://api.imgbb.com/1/upload',
      sendQuery: true,
      queryParameters: {
        parameters: [
          { name: 'key', value: expr("{{ $('Load Config').first().json.imgbbKey }}") },
          { name: 'expiration', value: '1800' }
        ]
      },
      sendBody: true,
      contentType: 'multipart-form-data',
      bodyParameters: {
        parameters: [
          { parameterType: 'formBinaryData', name: 'image', inputDataFieldName: 'data' }
        ]
      },
      options: { timeout: 120000 }
    },
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 3000,
    onError: 'continueErrorOutput',
    position: [1680, 208]
  },
  output: [{ data: { id: 'Ab12Cd3', url: 'https://i.ibb.co/Ab12Cd3/original.png', display_url: 'https://i.ibb.co/Ab12Cd3/original.png', image: { url: 'https://i.ibb.co/Ab12Cd3/original.png', mime: 'image/png' }, expiration: '1800' }, success: true, status: 200 }]
});

const buildUpscaleReq = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build Upscale Req',
    parameters: {
      mode: 'runOnceForEachItem',
      jsCode: "const cfg = $('Load Config').first().json;\nconst initUrl = ($json.data && ($json.data.url || ($json.data.image && $json.data.image.url))) || '';\nif (!initUrl) throw new Error('imgbb did not return a url: ' + JSON.stringify($json).slice(0, 200));\nconst body = { key: cfg.mlKey, init_image: initUrl, model_id: cfg.upscaleModel || 'ultra_resolution', scale: Number(cfg.upscaleScale) || 4, face_enhance: 'false', webhook: null, track_id: null };\nreturn { json: { body, initUrl, startedAt: Date.now() } };"
    },
    onError: 'continueErrorOutput',
    position: [1920, 208]
  },
  output: [{ body: { key: 'redacted', init_image: 'https://i.ibb.co/Ab12Cd3/original.png', model_id: 'ultra_resolution', scale: 4, face_enhance: 'false', webhook: null, track_id: null }, initUrl: 'https://i.ibb.co/Ab12Cd3/original.png', startedAt: 1789500000000 }]
});

const mlUpscale = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'ML Upscale',
    parameters: {
      method: 'POST',
      url: 'https://modelslab.com/api/v6/image_editing/super_resolution',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify($('Build Upscale Req').first().json.body) }}"),
      options: { timeout: 120000 }
    },
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 3000,
    onError: 'continueErrorOutput',
    position: [2160, 208]
  },
  output: [{ status: 'processing', id: 123456789, eta: 20, fetch_result: 'https://modelslab.com/api/v6/image_editing/fetch/123456789', output: [], message: '' }]
});

const evalUpscale = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Eval Upscale',
    parameters: {
      mode: 'runOnceForEachItem',
      jsCode: "const r = $json || {};\nconst cfg = $('Load Config').first().json;\nconst key = cfg.mlKey;\nconst BASE = 'https://modelslab.com/api/v6/image_editing/fetch/';\nconst LIMIT_MS = 10 * 60 * 1000;\nlet startedAt = 0; try { startedAt = Number($('Build Upscale Req').first().json.startedAt) || 0; } catch (e) {}\nconst elapsed = startedAt ? (Date.now() - startedAt) : 0;\nfunction fetchOf(x){ if (!x) return ''; if (x.fetch_result) return x.fetch_result; if (x.id !== undefined && x.id !== null && x.id !== '') return BASE + x.id; return ''; }\nlet orig = null; try { orig = $('ML Upscale').first().json; } catch (e) {}\nlet decision = 'fail', url = '', fetchUrl = '', error = '';\nif (r.status === 'success') {\n  const o = Array.isArray(r.output) ? r.output[0] : (typeof r.output === 'string' ? r.output : '');\n  if (o) { decision = 'done'; url = o; } else { error = 'upscale: success without output'; }\n} else if (r.status === 'processing' || r.status === 'queued') {\n  if (elapsed > LIMIT_MS) { error = 'upscale timed out'; }\n  else { decision = 'wait'; fetchUrl = fetchOf(r) || fetchOf(orig); if (!fetchUrl) { decision = 'fail'; error = 'upscale: lost the job id'; } }\n} else {\n  const msg = String(r.message || r.messege || (r.error && r.error.message) || r.error || 'ModelsLab error');\n  if (/rate ?limit/i.test(msg) && elapsed < LIMIT_MS) { decision = 'resubmit'; } else { error = 'upscale: ' + msg.slice(0, 220); }\n}\nreturn { json: { decision, url, fetchUrl, key, error } };"
    },
    position: [2400, 208]
  },
  output: [{ decision: 'done', url: 'https://cdn2.modelslab.com/generations/upscaled.png', fetchUrl: '', key: 'redacted', error: '' }]
});

const routeUpscale = switchCase({
  version: 3.2,
  config: {
    name: 'Route Upscale',
    parameters: {
      rules: {
        values: [
          { outputKey: 'done', renameOutput: true, conditions: { options: looseOptions, conditions: [{ leftValue: expr('{{ $json.decision }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'done' }], combinator: 'and' } },
          { outputKey: 'wait', renameOutput: true, conditions: { options: looseOptions, conditions: [{ leftValue: expr('{{ $json.decision }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'wait' }], combinator: 'and' } },
          { outputKey: 'fail', renameOutput: true, conditions: { options: looseOptions, conditions: [{ leftValue: expr('{{ $json.decision }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'fail' }], combinator: 'and' } },
          { outputKey: 'resubmit', renameOutput: true, conditions: { options: looseOptions, conditions: [{ leftValue: expr('{{ $json.decision }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'resubmit' }], combinator: 'and' } }
        ]
      },
      options: {}
    },
    position: [2640, 208]
  },
  output: [{ decision: 'done', url: 'https://cdn2.modelslab.com/generations/upscaled.png', fetchUrl: '', key: 'redacted', error: '' }]
});

const statusUpscaled = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Status → upscaled',
    parameters: {
      method: 'POST',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/rpc/fin_job_update"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") },
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
          { name: 'Content-Type', value: 'application/json' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_job_id: $('Get Job').first().json.id, p_status: 'working', p_fields: {}, p_event: 'upscaled', p_ok: true, p_message: String($('Eval Upscale').last().json.url || '') }) }}"),
      options: { timeout: 15000 }
    },
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [2900, 208]
  },
  output: [{ ...sampleJob, status: 'working' }]
});

const wait6s = node({
  type: 'n8n-nodes-base.wait',
  version: 1.1,
  config: {
    name: 'Wait 6s',
    parameters: { resume: 'timeInterval', amount: 6, unit: 'seconds' },
    position: [2640, 464]
  },
  output: [{ decision: 'wait', url: '', fetchUrl: 'https://modelslab.com/api/v6/image_editing/fetch/123456789', key: 'redacted', error: '' }]
});

const wait20s = node({
  type: 'n8n-nodes-base.wait',
  version: 1.1,
  config: {
    name: 'Wait 20s (rate limit)',
    parameters: { resume: 'timeInterval', amount: 20, unit: 'seconds' },
    position: [2160, 464]
  },
  output: [{ decision: 'resubmit', url: '', fetchUrl: '', key: 'redacted', error: '' }]
});

const fetchUpscale = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Fetch Upscale',
    parameters: {
      method: 'POST',
      url: expr('{{ $json.fetchUrl }}'),
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ key: $json.key }) }}'),
      options: { timeout: 60000 }
    },
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 2000,
    onError: 'continueRegularOutput',
    position: [2400, 464]
  },
  output: [{ status: 'success', id: 123456789, output: ['https://cdn2.modelslab.com/generations/upscaled.png'], message: '' }]
});

const downloadUpscaled = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Download Upscaled',
    parameters: {
      method: 'GET',
      url: expr("{{ $('Eval Upscale').last().json.url }}"),
      options: {
        response: { response: { responseFormat: 'file' } },
        timeout: 120000
      }
    },
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 3000,
    onError: 'continueErrorOutput',
    position: [3140, 208]
  },
  output: [{ json: {}, binary: { data: { fileName: 'upscaled.png', mimeType: 'image/png', fileExtension: 'png' } } }]
});

const ideogramRemoveBg = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Ideogram RemoveBG',
    parameters: {
      method: 'POST',
      url: 'https://api.ideogram.ai/v1/remove-background',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'Api-Key', value: expr("{{ $('Load Config').first().json.ideogramKey }}") }
        ]
      },
      sendBody: true,
      contentType: 'multipart-form-data',
      bodyParameters: {
        parameters: [
          { parameterType: 'formBinaryData', name: 'image', inputDataFieldName: 'data' }
        ]
      },
      options: { timeout: 120000 }
    },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 5000,
    onError: 'continueRegularOutput',
    position: [3380, 208]
  },
  output: [{ created: '2026-09-16T10:00:00Z', data: [{ url: 'https://ideogram.ai/api/images/direct/transparent.png', is_image_safe: true }] }]
});

const gotTransparentPng = ifElse({
  version: 2.2,
  config: {
    name: 'Got Transparent PNG?',
    parameters: {
      conditions: {
        options: looseOptions,
        conditions: [
          { id: 'u', leftValue: expr('{{ $json.data?.[0]?.url ?? "" }}'), operator: { type: 'string', operation: 'startsWith' }, rightValue: 'http' }
        ],
        combinator: 'and'
      },
      options: {}
    },
    position: [3620, 208]
  },
  output: [{ created: '2026-09-16T10:00:00Z', data: [{ url: 'https://ideogram.ai/api/images/direct/transparent.png', is_image_safe: true }] }]
});

const statusBgRemoved = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Status → bg_removed',
    parameters: {
      method: 'POST',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/rpc/fin_job_update"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") },
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
          { name: 'Content-Type', value: 'application/json' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_job_id: $('Get Job').first().json.id, p_status: 'working', p_fields: {}, p_event: 'bg_removed', p_ok: true, p_message: String($('Ideogram RemoveBG').first().json.data?.[0]?.url ?? '') }) }}"),
      options: { timeout: 15000 }
    },
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [3860, 208]
  },
  output: [{ ...sampleJob, status: 'working' }]
});

const fetchResultPng = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Fetch Result PNG',
    parameters: {
      method: 'GET',
      url: expr("{{ $('Ideogram RemoveBG').first().json.data[0].url }}"),
      options: {
        response: { response: { responseFormat: 'file' } },
        timeout: 120000
      }
    },
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 3000,
    onError: 'continueErrorOutput',
    position: [4100, 208]
  },
  output: [{ json: {}, binary: { data: { fileName: 'transparent.png', mimeType: 'image/png', fileExtension: 'png' } } }]
});

const set300Dpi = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Set 300 DPI',
    parameters: {
      jsCode: "// ONE JOB: write 300 DPI metadata (pHYs chunk) into the PNG and pass it through.\n// Never throws. Never judges size. Fail-open on anything unexpected.\nconst item = $input.item || $input.all()[0];\nconst binKey = Object.keys(item.binary || {})[0] || 'data';\nconst buf = Buffer.from(await this.helpers.getBinaryDataBuffer(0, binKey));\nconst SIG = Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]);\nlet out = buf, w = 0, h = 0;\ntry {\n  if (buf.length > 33 && buf.subarray(0,8).equals(SIG)) {\n    w = buf.readUInt32BE(16); h = buf.readUInt32BE(20);\n    const T = new Int32Array(256);\n    for (let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c = (c&1)?(0xEDB88320^(c>>>1)):(c>>>1); T[n]=c; }\n    const crc32 = (b)=>{ let c=-1; for(let i=0;i<b.length;i++) c=T[(c^b[i])&0xFF]^(c>>>8); return (c^-1)>>>0; };\n    const ppm = 11811; // 300 dpi in pixels per metre\n    const data = Buffer.alloc(9); data.writeUInt32BE(ppm,0); data.writeUInt32BE(ppm,4); data[8]=1;\n    const typeAndData = Buffer.concat([Buffer.from('pHYs'), data]);\n    const chunk = Buffer.alloc(4 + typeAndData.length + 4);\n    chunk.writeUInt32BE(9,0); typeAndData.copy(chunk,4); chunk.writeUInt32BE(crc32(typeAndData), 4 + typeAndData.length);\n    const parts = [buf.subarray(0,33), chunk];\n    let pos = 33;\n    while (pos + 8 <= buf.length) {\n      const len = buf.readUInt32BE(pos);\n      const type = buf.toString('ascii', pos+4, pos+8);\n      const end = pos + 12 + len;\n      if (type !== 'pHYs') parts.push(buf.subarray(pos, Math.min(end, buf.length)));\n      pos = end;\n    }\n    out = Buffer.concat(parts);\n  }\n} catch (e) { out = buf; }\nconst fileName = ((item.binary && item.binary[binKey] && item.binary[binKey].fileName) || 'final.png');\nlet stampedBinary = null;\ntry {\n  if (this.helpers && typeof this.helpers.prepareBinaryData === 'function') {\n    stampedBinary = await this.helpers.prepareBinaryData(out, fileName, 'image/png');\n  }\n} catch (e) { stampedBinary = null; }\nif (!stampedBinary) {\n  const meta = Object.assign({}, (item.binary && item.binary[binKey]) || {});\n  delete meta.id;\n  meta.data = out.toString('base64');\n  meta.mimeType = 'image/png';\n  meta.fileName = fileName;\n  meta.fileExtension = 'png';\n  stampedBinary = meta;\n}\nconst binOut = Object.assign({}, item.binary || {});\nbinOut[binKey] = stampedBinary;\nreturn { json: Object.assign({}, item.json, { final_w: w, final_h: h, dpi: 300 }), binary: binOut };\n"
    },
    position: [4340, 208]
  },
  output: [{ json: { final_w: 4096, final_h: 4096, dpi: 300 }, binary: { data: { fileName: 'transparent.png', mimeType: 'image/png', fileExtension: 'png' } } }]
});

const uploadFinal = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Upload Final',
    parameters: {
      method: 'POST',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/storage/v1/object/finals/{{ $('Get Job').first().json.card_id }}/{{ $('Get Job').first().json.generation_id }}-final.png"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") },
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
          { name: 'Content-Type', value: 'image/png' },
          { name: 'x-upsert', value: 'true' }
        ]
      },
      sendBody: true,
      contentType: 'binaryData',
      inputDataFieldName: 'data',
      options: { timeout: 180000 }
    },
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 3000,
    onError: 'continueErrorOutput',
    position: [4580, 208]
  },
  output: [{ Key: 'finals/' + sampleCardId + '/' + sampleGenerationId + '-final.png', Id: '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f' }]
});

const statusDone = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Status → done',
    parameters: {
      method: 'POST',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/rpc/fin_job_update"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") },
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
          { name: 'Content-Type', value: 'application/json' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_job_id: $('Get Job').first().json.id, p_status: 'done', p_fields: { final_path: $('Get Job').first().json.card_id + '/' + $('Get Job').first().json.generation_id + '-final.png', metrics: { final_w: $('Set 300 DPI').first().json.final_w, final_h: $('Set 300 DPI').first().json.final_h, dpi: 300 } }, p_event: 'done', p_ok: true, p_message: 'final uploaded' }) }}"),
      options: { timeout: 15000 }
    },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 3000,
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [4820, 208]
  },
  output: [{ ...sampleJob, status: 'done', final_path: sampleCardId + '/' + sampleGenerationId + '-final.png', metrics: { final_w: 4096, final_h: 4096, dpi: 300 } }]
});

const failMessage = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Fail Message',
    parameters: {
      mode: 'runOnceForEachItem',
      jsCode: "const j = $json || {};\nconst text = (v) => (v === undefined || v === null || v === '' ? '' : (typeof v === 'object' ? String(v.message || v.description || JSON.stringify(v)) : String(v)));\nconst message = (text(j.error) || text(j.message) || text(j.detail) || 'unknown error').slice(0, 500);\nreturn { json: { message, jobId: $('Job Config').first().json.jobId } };"
    },
    position: [3380, 704]
  },
  output: [{ message: 'upscale: ModelsLab error', jobId: sampleJobId }]
});

const statusFailed = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Status → failed',
    parameters: {
      method: 'POST',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/rpc/fin_job_update"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") },
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
          { name: 'Content-Type', value: 'application/json' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_job_id: $('Job Config').first().json.jobId, p_status: 'failed', p_fields: {}, p_event: 'failed', p_ok: false, p_message: $json.message }) }}"),
      options: { timeout: 15000 }
    },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 3000,
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [3620, 704]
  },
  output: [{ ...sampleJob, status: 'failed', last_error: 'upscale: ModelsLab error' }]
});

const pingDispatcher = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Ping Dispatcher',
    parameters: {
      method: 'POST',
      url: expr("{{ $('Load Config').first().json.n8nBaseUrl }}/webhook/studio-finisher-dispatch"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") },
          { name: 'Content-Type', value: 'application/json' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ event: 'WORKER_DONE', job_id: $('Job Config').first().json.jobId }) }}"),
      options: { timeout: 10000 }
    },
    executeOnce: true,
    onError: 'continueRegularOutput',
    position: [5060, 464]
  },
  output: [{ message: 'Workflow was started' }]
});

export default workflow('dm-studio-wf4-finisher', 'DM Studio · WF-4 Finisher')
  .add(finisherNote)
  .add(dispatchWebhook)
  .to(loadDispatchConfig)
  .to(dispatchSecretOk.onTrue(claimJobs).onFalse(dispatchRejected))
  .add(claimJobs)
  .to(hasJobId)
  .to(fireWorker)
  .add(workerWebhook)
  .to(loadConfig)
  .to(secretOk.onTrue(jobConfig).onFalse(rejected))
  .add(jobConfig)
  .to(getJob.onError(failMessage))
  .to(statusWorking)
  .to(downloadOriginal.onError(failMessage))
  .to(fit1024.onError(failMessage))
  .to(imgbbUpload.onError(failMessage))
  .to(buildUpscaleReq.onError(failMessage))
  .to(mlUpscale.onError(failMessage))
  .to(evalUpscale)
  .to(routeUpscale.onCase(0, statusUpscaled).onCase(1, wait6s).onCase(2, failMessage).onCase(3, wait20s))
  .add(statusUpscaled)
  .to(downloadUpscaled.onError(failMessage))
  .to(ideogramRemoveBg)
  .to(gotTransparentPng.onTrue(statusBgRemoved).onFalse(failMessage))
  .add(statusBgRemoved)
  .to(fetchResultPng.onError(failMessage))
  .to(set300Dpi)
  .to(uploadFinal.onError(failMessage))
  .to(statusDone)
  .to(pingDispatcher)
  .add(wait6s)
  .to(fetchUpscale)
  .to(evalUpscale)
  .add(wait20s)
  .to(mlUpscale)
  .add(failMessage)
  .to(statusFailed)
  .to(pingDispatcher);
