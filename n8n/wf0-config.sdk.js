import { workflow, node, trigger, sticky, placeholder, newCredential, ifElse, switchCase, merge, splitInBatches, nextBatch, languageModel, memory, tool, outputParser, embedding, embeddings, vectorStore, retriever, documentLoader, textSplitter, reranker, fromAi, expr } from '@n8n/workflow-sdk';

const supabaseUrl = 'https://voatrqhfsdfjomyajovi.supabase.co';
const supabasePublishableKey = 'sb_publishable_shDVoGzgpaS2L9OTmzyRGA_JOx52p0I';
const n8nBaseUrl = 'https://n8n.srv1202488.hstgr.cloud';

const configNote = sticky(
  '## DM Studio · WF-0 Studio Config (sub-workflow, the ONE paste location)\n' +
  'Every studio workflow (WF-1 Intake, WF-1b Style Draft, WF-2 Generate, WF-3 Edit, WF-4 Finisher, WF-6 Error, WF-7 Lessons) calls this workflow as its first step through an Execute Workflow node named **Load Config** and then reads `$(\'Load Config\').first().json.<field>`. Keys live here, not in n8n credentials.\n\n' +
  '**Paste once, in the Studio Config node:**\n' +
  '- studioSecret → `select value from private.secrets where key = \'studio_secret\'` (Supabase SQL editor). Every Supabase REST/RPC/Storage/Edge call sends it as `x-studio-secret`; webhooks compare the incoming header against it (Secret OK? node).\n' +
  '- ideogramKey → Ideogram API key (WF-4 background removal, header Api-Key).\n' +
  '- imgbbKey → imgbb API key (WF-4 public staging upload, query key).\n' +
  '- mlKey → ModelsLab API key (WF-4 upscale, key inside the JSON body).\n\n' +
  'Prefilled (public, no action): sbUrl, anonKey (Supabase publishable key, sent as `apikey`), n8nBaseUrl, upscaleModel ultra_resolution, upscaleScale 4.\n\n' +
  'Kie.ai stays on its existing n8n credentials bound by id: images **GPT Image 2 [DM-Kie]** w0sDpl2nll4HkF6h, vision **Gemini 3.1 Pro [DM-Kie]** 0l2nHQUQNnsCAfTR. Slack stays on **DM HR** kZQVG6uMHQ7Xxu2B.\n\n' +
  'After creating this workflow, copy its id into every other file\'s `const configWorkflowId = \'REPLACE_WITH_WF0_CONFIG_ID\'` before creating them. The trigger accepts any input (passthrough) and ignores it; the Set returns exactly one item.',
  { color: 4, width: 460, height: 640, position: [-520, 80] }
);

const configTrigger = trigger({
  type: 'n8n-nodes-base.executeWorkflowTrigger',
  version: 1.1,
  config: {
    name: 'Config Trigger',
    parameters: { inputSource: 'passthrough' },
    position: [0, 304]
  },
  output: [{}]
});

const studioConfig = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Studio Config',
    parameters: {
      mode: 'manual',
      assignments: {
        assignments: [
          { id: 'k1', name: 'sbUrl', type: 'string', value: supabaseUrl },
          { id: 'k2', name: 'anonKey', type: 'string', value: supabasePublishableKey },
          { id: 'k3', name: 'n8nBaseUrl', type: 'string', value: n8nBaseUrl },
          { id: 'k4', name: 'studioSecret', type: 'string', value: placeholder('Paste the studio secret: select value from private.secrets where key = studio_secret') },
          { id: 'k5', name: 'ideogramKey', type: 'string', value: placeholder('Paste your Ideogram API key') },
          { id: 'k6', name: 'imgbbKey', type: 'string', value: placeholder('Paste your imgbb API key') },
          { id: 'k7', name: 'mlKey', type: 'string', value: placeholder('Paste your ModelsLab API key') },
          { id: 'k8', name: 'upscaleModel', type: 'string', value: 'ultra_resolution' },
          { id: 'k9', name: 'upscaleScale', type: 'number', value: 4 }
        ]
      },
      includeOtherFields: false,
      options: {}
    },
    executeOnce: true,
    position: [240, 304]
  },
  output: [{ sbUrl: supabaseUrl, anonKey: 'sb_publishable_redacted', n8nBaseUrl: n8nBaseUrl, studioSecret: 'redacted', ideogramKey: 'redacted', imgbbKey: 'redacted', mlKey: 'redacted', upscaleModel: 'ultra_resolution', upscaleScale: 4 }]
});

export default workflow('dm-studio-wf0-config', 'DM Studio · WF-0 Studio Config')
  .add(configNote)
  .add(configTrigger)
  .to(studioConfig);
