import { generateScriptCandidates } from '../_lib/script-providers.js';
import { errorResponse, json, readJson } from '../_lib/http.js';

export async function onRequestPost(context) {
  try {
    const payload = await readJson(context.request);
    const suppliedKey = context.request.headers.get('X-Script-Provider-Key') || '';
    const result = await generateScriptCandidates(payload, context.env, suppliedKey);
    return json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
