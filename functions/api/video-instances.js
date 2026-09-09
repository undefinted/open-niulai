import { errorResponse, json } from '../_lib/http.js';
import { aiAppCatalog, publicAiApp } from '../_lib/runninghub.js';

export function onRequestGet(context) {
  try {
    return json({ instances: aiAppCatalog(context.env).map(publicAiApp) });
  } catch (error) {
    return errorResponse(error, 500);
  }
}
