# Kie.ai — GPT Image 2.5 Sunburst (verified 2026-09-24)

Source: docs.kie.ai/market/gpt/gpt-image-2-5-sunburst-image-to-image, docs.kie.ai/market/common/get-task-detail, kie.ai/gpt-image-2-5

## Create task
POST https://api.kie.ai/api/v1/jobs/createTask
Header: Authorization: Bearer <KIE_API_KEY>   (n8n credential "GPT Image 2 [DM-Kie]" id w0sDpl2nll4HkF6h is a Header Auth on Authorization — reusable)
Body:
{
  "model": "gpt-image-2-5-sunburst-image-to-image",   // text-only variant: gpt-image-2-5-sunburst-text-to-image
  "callBackUrl": "https://n8n.srv1202488.hstgr.cloud/webhook-waiting/<resumeUrl>",   // optional
  "input": {
    "prompt": "<= 20000 chars",
    "input_urls": ["https://...signed..."],          // max 16, JPEG/PNG/WEBP, <= 30 MB each; MUST be publicly fetchable → use Supabase signed URLs (1 h)
    "aspect_ratio": "1:1 | 3:2 | 2:3 | 4:3 | 3:4 | 5:4 | 4:5 | 16:9 | 9:16 | 2:1 | 1:2 | 3:1 | 1:3 | 21:9 | 9:21 | auto",
    "resolution": "1K | 2K | 4K",                     // 27:16, 16:27, 9:8, 8:9 are 1K only
    "background": "opaque"                            // we generate on flat grey; transparency comes from the finisher
  }
}
Response: { "code": 200, "msg": "success", "data": { "taskId": "..." } }
Errors: 401 unauthorized, 402 quota, 422 validation, 429 rate limit, 455 unavailable, 500, 501 generation failed, 505 disabled

## Poll
GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId=<taskId>
data.state: waiting | queuing | generating | success | fail
data.resultJson: JSON string → { "resultUrls": ["https://..."] }
data.failCode / data.failMsg on fail; data.progress 0-100

## Callback payload (same as poll data): { code, msg, data: { taskId, state, resultJson, creditsConsumed, costTime, createTime, completeTime } }

## Placement → aspect ratio (studio default)
front_chest 1:1 · full_front 4:5 · back 4:5 · pocket 1:1 · tote 4:5 · mug 3:2
