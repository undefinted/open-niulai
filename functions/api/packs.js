import { createPack } from '../_lib/pack.js';
import { evaluatePack } from '../_lib/quality.js';
import { errorResponse, json, readJson } from '../_lib/http.js';

export async function onRequestPost(context) {
  try {
    const pack = createPack(await readJson(context.request));
    pack.quality_report = evaluatePack(pack);
    return json({ pack });
  } catch (error) {
    return errorResponse(error);
  }
}
