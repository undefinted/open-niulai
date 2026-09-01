import { createPack } from '../_lib/pack.js';
import { errorResponse, json, readJson } from '../_lib/http.js';

export async function onRequestPost(context) {
  try {
    return json({ pack: createPack(await readJson(context.request)) });
  } catch (error) {
    return errorResponse(error);
  }
}
