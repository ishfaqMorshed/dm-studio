import { workflow, node, trigger, sticky, placeholder, newCredential, ifElse, switchCase, merge, splitInBatches, nextBatch, languageModel, memory, tool, outputParser, embedding, embeddings, vectorStore, retriever, documentLoader, textSplitter, reranker, fromAi, expr } from '@n8n/workflow-sdk';

const kieBaseUrl = 'https://api.kie.ai';

const kieImageCredential = newCredential('GPT Image 2 [DM-Kie]', 'w0sDpl2nll4HkF6h');

const looseOptions = { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 1 };

const sampleTaskId = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
const sampleResultUrl = 'https://tempfile.aiquickdraw.com/s/' + sampleTaskId + '.png';
const samplePollResponse = {
  code: 200,
  msg: 'success',
  data: {
    taskId: sampleTaskId,
    model: 'gpt-image-2-5-sunburst-image-to-image',
    state: 'success',
    param: '{}',
    resultJson: '{"resultUrls":["' + sampleResultUrl + '"]}',
    failCode: null,
    failMsg: null,
    completeTime: 1790000060000,
    createTime: 1790000000000,
    costTime: 60000,
    creditsConsumed: 6,
    progress: 100
  }
};
const sampleEval = {
  decision: 'success',
  failMsg: '',
  taskId: sampleTaskId,
  state: 'success',
  resultUrls: [sampleResultUrl],
  resultUrl: sampleResultUrl,
  creditsConsumed: 6,
  raw: samplePollResponse
};

const pollNote = sticky(
  '## DM Studio · WF-5 Poll (sub-workflow)\n' +
  'Called by WF-2 (and later WF-3) through Execute Workflow with inputs **taskId** (Kie job id), optional **url** (full status URL; defaults to Kie jobs/recordInfo?taskId=…), **interval** (seconds, floor 6, default 10) and **timeout** (seconds, default 1800 = the 30-minute cap).\n\n' +
  'Loop: Poll Vendor → Eval Poll → Route Poll. `wait` re-enters Wait Interval; `success` returns one item `{ taskId, state, resultUrls, resultUrl, creditsConsumed, raw }`; `fail` (vendor state fail, non-retryable HTTP code, or timeout) throws so the caller\'s Execute Workflow node takes its error output.\n\n' +
  'The timeout is measured from Poll Config.startedAt (execution data survives Wait nodes). Auth: Kie Header Auth credential **GPT Image 2 [DM-Kie]** (w0sDpl2nll4HkF6h). A caller cannot pass a credential at runtime, so a different vendor needs its own copy of this workflow bound to that credential.',
  { color: 4, width: 380, height: 520, position: [-440, 120] }
);

const pollTrigger = trigger({
  type: 'n8n-nodes-base.executeWorkflowTrigger',
  version: 1.1,
  config: {
    name: 'Poll Trigger',
    parameters: {
      inputSource: 'workflowInputs',
      workflowInputs: {
        values: [
          { name: 'taskId', type: 'string' },
          { name: 'url', type: 'string' },
          { name: 'interval', type: 'number' },
          { name: 'timeout', type: 'number' }
        ]
      }
    },
    position: [0, 304]
  },
  output: [{ taskId: sampleTaskId, url: '', interval: 10, timeout: 1800 }]
});

const pollConfig = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Poll Config',
    parameters: {
      mode: 'manual',
      assignments: {
        assignments: [
          { id: 'p1', name: 'taskId', type: 'string', value: expr('{{ $json.taskId ?? "" }}') },
          { id: 'p2', name: 'pollUrl', type: 'string', value: expr('{{ $json.url || ("' + kieBaseUrl + '/api/v1/jobs/recordInfo?taskId=" + encodeURIComponent($json.taskId ?? "")) }}') },
          { id: 'p3', name: 'intervalSec', type: 'number', value: expr('{{ Math.max(6, Number($json.interval) || 10) }}') },
          { id: 'p4', name: 'timeoutMs', type: 'number', value: expr('{{ (Number($json.timeout) || 1800) * 1000 }}') },
          { id: 'p5', name: 'startedAt', type: 'number', value: expr('{{ $now.toMillis() }}') }
        ]
      },
      includeOtherFields: false,
      options: {}
    },
    position: [240, 304]
  },
  output: [{ taskId: sampleTaskId, pollUrl: kieBaseUrl + '/api/v1/jobs/recordInfo?taskId=' + sampleTaskId, intervalSec: 10, timeoutMs: 1800000, startedAt: 1790000000000 }]
});

const pollVendor = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Poll Vendor',
    parameters: {
      method: 'GET',
      url: expr("{{ $('Poll Config').first().json.pollUrl }}"),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      options: { timeout: 60000 }
    },
    credentials: { httpHeaderAuth: kieImageCredential },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2500,
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [480, 304]
  },
  output: [samplePollResponse]
});

const evalPoll = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Eval Poll',
    parameters: {
      mode: 'runOnceForEachItem',
      jsCode: "const j = $json || {};\nconst cfg = $('Poll Config').first().json;\nconst data = j.data || null;\nconst state = (data && data.state) || '';\nconst elapsed = Date.now() - (Number(cfg.startedAt) || Date.now());\nlet decision = 'wait';\nif (j.code === 200 && state === 'success') decision = 'success';\nelse if (state === 'fail' || (typeof j.code === 'number' && j.code !== 200 && j.code !== 429 && j.code < 500)) decision = 'fail';\nelse if (elapsed > (Number(cfg.timeoutMs) || 1800000)) decision = 'fail';\nlet resultUrls = [];\ntry { resultUrls = JSON.parse((data && data.resultJson) || '{}').resultUrls || []; } catch (e) { resultUrls = []; }\nif (decision === 'success' && !resultUrls.length) decision = 'fail';\nconst failMsg = decision === 'fail' ? String((data && data.failMsg) || (j.code !== 200 && j.msg) || (j.error && (j.error.message || j.error)) || ('poll ended state=' + (state || 'unknown') + ' after ' + Math.round(elapsed / 1000) + 's')).slice(0, 500) : '';\nreturn { json: { decision, failMsg, taskId: cfg.taskId, state, resultUrls, resultUrl: resultUrls[0] || '', creditsConsumed: data ? (data.creditsConsumed ?? null) : null, raw: j } };"
    },
    position: [720, 304]
  },
  output: [sampleEval]
});

const routePoll = switchCase({
  version: 3.2,
  config: {
    name: 'Route Poll',
    parameters: {
      rules: {
        values: [
          { outputKey: 'success', renameOutput: true, conditions: { options: looseOptions, conditions: [{ leftValue: expr('{{ $json.decision }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'success' }], combinator: 'and' } },
          { outputKey: 'wait', renameOutput: true, conditions: { options: looseOptions, conditions: [{ leftValue: expr('{{ $json.decision }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'wait' }], combinator: 'and' } },
          { outputKey: 'fail', renameOutput: true, conditions: { options: looseOptions, conditions: [{ leftValue: expr('{{ $json.decision }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'fail' }], combinator: 'and' } }
        ]
      },
      options: {}
    },
    position: [960, 304]
  },
  output: [sampleEval]
});

const returnResult = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Return Result',
    parameters: {
      mode: 'manual',
      assignments: {
        assignments: [
          { id: 'r1', name: 'ok', type: 'boolean', value: true },
          { id: 'r2', name: 'finishedAt', type: 'string', value: expr('{{ $now.toISO() }}') }
        ]
      },
      includeOtherFields: true,
      options: {}
    },
    position: [1200, 112]
  },
  output: [{ ...sampleEval, ok: true, finishedAt: '2026-09-24T10:01:00.000Z' }]
});

const waitInterval = node({
  type: 'n8n-nodes-base.wait',
  version: 1.1,
  config: {
    name: 'Wait Interval',
    parameters: { resume: 'timeInterval', amount: expr("{{ $('Poll Config').first().json.intervalSec }}"), unit: 'seconds' },
    position: [1200, 304]
  },
  output: [{ ...sampleEval, decision: 'wait', state: 'generating', resultUrls: [], resultUrl: '' }]
});

const throwFailure = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Throw Failure',
    parameters: {
      mode: 'runOnceForEachItem',
      jsCode: "const msg = String($json.failMsg || 'vendor job failed').slice(0, 500);\nthrow new Error('Poll failed for task ' + ($json.taskId || '?') + ': ' + msg);"
    },
    position: [1200, 496]
  },
  output: [{ decision: 'fail', failMsg: 'poll ended state=fail after 61s', taskId: sampleTaskId }]
});

export default workflow('dm-studio-wf5-poll', 'DM Studio · WF-5 Poll')
  .add(pollNote)
  .add(pollTrigger)
  .to(pollConfig)
  .to(pollVendor)
  .to(evalPoll)
  .to(routePoll.onCase(0, returnResult).onCase(1, waitInterval).onCase(2, throwFailure))
  .add(waitInterval)
  .to(pollVendor);
