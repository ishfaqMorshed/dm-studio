import { workflow, node, trigger, sticky, placeholder, newCredential, ifElse, switchCase, merge, splitInBatches, nextBatch, languageModel, memory, tool, outputParser, embedding, embeddings, vectorStore, retriever, documentLoader, textSplitter, reranker, fromAi, expr } from '@n8n/workflow-sdk';

const supabaseUrl = 'https://voatrqhfsdfjomyajovi.supabase.co';
const n8nBaseUrl = 'https://n8n.srv1202488.hstgr.cloud';

const configWorkflowId = 'vbyjWhK4ZRN9uZUM';

const looseOptions = { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 1 };

const sampleCardId = '1a2b3c4d-5e6f-4a70-8b91-0c1d2e3f4a5b';
const sampleGenerationId = '9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b';
const sampleClientId = '7c6d5e4f-3a2b-4c1d-9e8f-0a1b2c3d4e5f';
const sampleExecutionId = '48211';
const sampleMessage = '[DM Studio · WF-2 Generate / Create Task] Kie createTask returned 402 insufficient credits';

const sampleConfig = { sbUrl: supabaseUrl, anonKey: 'sb_publishable_redacted', n8nBaseUrl: n8nBaseUrl, studioSecret: 'redacted', ideogramKey: 'redacted', imgbbKey: 'redacted', mlKey: 'redacted', upscaleModel: 'ultra_resolution', upscaleScale: 4 };

const sampleContext = {
  executionId: sampleExecutionId,
  executionUrl: n8nBaseUrl + '/workflow/AbCdEf123456/executions/' + sampleExecutionId,
  workflowName: 'DM Studio · WF-2 Generate',
  lastNode: 'Create Task',
  message: sampleMessage,
  hintCardId: sampleCardId,
  hintGenerationId: sampleGenerationId
};

const sampleResolved = { ...sampleContext, card_id: sampleCardId, generation_id: sampleGenerationId, hasCard: true, hasGeneration: true };

const errorNote = sticky(
  '## DM Studio · WF-6 Error workflow\n' +
  'Set this workflow as the **Error workflow** (workflow settings) of WF-1 Intake, WF-1b Style Draft, WF-2 Generate, WF-3 Edit and WF-4 Finisher. It runs only for unhandled failures; the studio workflows handle their own expected failures inline.\n\n' +
  'Flow: Error Trigger → Failure Context (message, execution id, ids found in the error payload) → Find Card / Find Generation by **n8n_execution_id** (WF-1 and WF-2 tag their rows with the execution id as their first step) → Resolve Ids → PATCH generations status failed + last_error (when a generation is known) → move_card(failed, note) (when a card is known). Failures show on the card in the app (Failed column, last_error, Retry).\n\n' +
  '**Config convention (no credentials):** first node **Load Config** runs the sub-workflow WF-0 Studio Config (paste its id into `const configWorkflowId` before creating this workflow); every later node reads `$(\'Load Config\').first().json.<field>`. The Error Trigger carries no header, so there is no Secret OK? node here. Every Supabase REST/RPC call sends headers apikey = anonKey and x-studio-secret = studioSecret from config, no credential attached. Nothing to paste in this workflow: all keys live in WF-0.',
  { color: 4, width: 380, height: 640, position: [-440, 120] }
);

const errorTrigger = trigger({
  type: 'n8n-nodes-base.errorTrigger',
  version: 1,
  config: { name: 'Error Trigger', parameters: {}, position: [0, 304] },
  output: [{
    execution: {
      id: sampleExecutionId,
      url: n8nBaseUrl + '/workflow/AbCdEf123456/executions/' + sampleExecutionId,
      retryOf: null,
      error: { message: 'Kie createTask returned 402 insufficient credits', name: 'NodeOperationError', node: { name: 'Create Task', type: 'n8n-nodes-base.httpRequest' } },
      lastNodeExecuted: 'Create Task',
      mode: 'webhook'
    },
    workflow: { id: 'AbCdEf123456', name: 'DM Studio · WF-2 Generate' }
  }]
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
    position: [240, 304]
  },
  output: [sampleConfig]
});

const failureContext = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Failure Context',
    parameters: {
      mode: 'runOnceForEachItem',
      jsCode: "const src = $('Error Trigger').first().json || {};\nconst ex = src.execution || {};\nconst wf = src.workflow || {};\nconst err = ex.error || {};\nconst text = JSON.stringify(src);\nconst uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';\nconst pick = (key) => { const m = text.match(new RegExp('\"' + key + '\"\\\\s*:\\\\s*\"(' + uuid + ')\"', 'i')); return m ? m[1] : ''; };\nconst where = ex.lastNodeExecuted || (err.node && err.node.name) || '?';\nconst message = ('[' + (wf.name || 'n8n') + ' / ' + where + '] ' + String(err.message || err.description || 'unknown error')).slice(0, 500);\nreturn { json: { executionId: String(ex.id || ''), executionUrl: ex.url || '', workflowName: wf.name || '', lastNode: where, message, hintCardId: pick('card_id') || pick('cardId'), hintGenerationId: pick('generation_id') || pick('generationId') } };"
    },
    position: [480, 304]
  },
  output: [sampleContext]
});

const findCard = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Find Card',
    parameters: {
      method: 'GET',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/cards?n8n_execution_id=eq.{{ $json.executionId }}&select=id,client_id,stage&limit=1"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") }
        ]
      },
      options: { timeout: 15000 }
    },
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [720, 304]
  },
  output: [{ id: sampleCardId, client_id: sampleClientId, stage: 'generating' }]
});

const findGeneration = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Find Generation',
    parameters: {
      method: 'GET',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/generations?n8n_execution_id=eq.{{ $('Failure Context').first().json.executionId }}&status=in.(dispatched,working)&select=id,card_id,status&order=created_at.desc&limit=1"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") }
        ]
      },
      options: { timeout: 15000 }
    },
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [960, 304]
  },
  output: [{ id: sampleGenerationId, card_id: sampleCardId, status: 'working' }]
});

const resolveIds = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Resolve Ids',
    parameters: {
      mode: 'runOnceForEachItem',
      jsCode: "const ctx = $('Failure Context').first().json;\nconst card = $('Find Card').first().json || {};\nconst gen = $('Find Generation').first().json || {};\nconst isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));\nconst generation_id = isUuid(gen.id) ? gen.id : (isUuid(ctx.hintGenerationId) ? ctx.hintGenerationId : '');\nconst card_id = isUuid(card.id) ? card.id : (isUuid(gen.card_id) ? gen.card_id : (isUuid(ctx.hintCardId) ? ctx.hintCardId : ''));\nreturn { json: Object.assign({}, ctx, { card_id, generation_id, hasCard: !!card_id, hasGeneration: !!generation_id }) };"
    },
    position: [1200, 304]
  },
  output: [sampleResolved]
});

const hasGeneration = ifElse({
  version: 2.2,
  config: {
    name: 'Has Generation?',
    parameters: {
      conditions: {
        options: looseOptions,
        conditions: [
          { id: 'g', leftValue: expr('{{ $json.hasGeneration }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }
        ],
        combinator: 'and'
      },
      options: {}
    },
    position: [1440, 304]
  },
  output: [sampleResolved]
});

const generationFailed = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Generation → failed',
    parameters: {
      method: 'PATCH',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/generations?id=eq.{{ $('Resolve Ids').first().json.generation_id }}"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") },
          { name: 'Content-Type', value: 'application/json' },
          { name: 'Prefer', value: 'return=representation' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ status: 'failed', last_error: $('Resolve Ids').first().json.message, finished_at: $now.toISO() }) }}"),
      options: { timeout: 15000 }
    },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 3000,
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [1680, 208]
  },
  output: [{ id: sampleGenerationId, card_id: sampleCardId, status: 'failed', last_error: sampleMessage }]
});

const hasCard = ifElse({
  version: 2.2,
  config: {
    name: 'Has Card?',
    parameters: {
      conditions: {
        options: looseOptions,
        conditions: [
          { id: 'c', leftValue: expr("{{ $('Resolve Ids').first().json.hasCard }}"), operator: { type: 'boolean', operation: 'true', singleValue: true } }
        ],
        combinator: 'and'
      },
      options: {}
    },
    position: [1920, 304]
  },
  output: [sampleResolved]
});

const cardFailed = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Card → failed',
    parameters: {
      method: 'POST',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/rpc/move_card"),
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
      jsonBody: expr("{{ JSON.stringify({ p_card_id: $('Resolve Ids').first().json.card_id, p_stage: 'failed', p_note: $('Resolve Ids').first().json.message, p_force: true }) }}"),
      options: { timeout: 15000 }
    },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 3000,
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [2160, 208]
  },
  output: [{ id: sampleCardId, client_id: sampleClientId, stage: 'failed', last_error: sampleMessage }]
});


export default workflow('dm-studio-wf6-error', 'DM Studio · WF-6 Error')
  .add(errorNote)
  .add(errorTrigger)
  .to(loadConfig)
  .to(failureContext)
  .to(findCard)
  .to(findGeneration)
  .to(resolveIds)
  .to(hasGeneration.onTrue(generationFailed.to(hasCard)).onFalse(hasCard))
  .add(hasCard)
  .to(cardFailed);
