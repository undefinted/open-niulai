import { requireUser } from '../../_lib/auth.js';
import { errorResponse, json } from '../../_lib/http.js';
import { verifySeedanceConnection } from '../../_lib/seedance.js';

export async function onRequestPost(context) {
  try {
    await requireUser(context.request, context.env);
    const provider = String(context.request.headers.get('X-Provider-Id') || '').trim();
    if (provider !== 'seedance') return json({error:'该服务暂不支持连接检测。'}, 400);
    return json(await verifySeedanceConnection(context.request));
  } catch (error) {
    return errorResponse(error);
  }
}
