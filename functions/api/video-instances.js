import { errorResponse, json } from '../_lib/http.js';
import { aiAppCatalog, publicAiApp } from '../_lib/runninghub.js';

export function onRequestGet(context) {
  try {
    const instances = aiAppCatalog(context.env)
      .filter(instance => instance.transport === 'dynamic_ai_app')
      .map(publicAiApp);
    return json({ instances });
  } catch (error) {
    return errorResponse(error, 500);
  }
}
