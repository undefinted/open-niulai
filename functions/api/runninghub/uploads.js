import { errorResponse, json, readJson } from '../../_lib/http.js';
import { uploadDataUrl } from '../../_lib/runninghub.js';
import { assertPaidRuntime, ensureSession } from '../../_lib/session.js';
import { requireUser } from '../../_lib/auth.js';

export async function onRequestPost(context) {
  try {
    assertPaidRuntime(context.request, context.env);
    const session = await ensureSession(context.request, context.env);
    await requireUser(context.request, context.env);
    const apiKey = context.request.headers.get('X-Provider-Key') || '';
    const payload = await readJson(context.request, 16 * 1024 * 1024);
    const fileName = await uploadDataUrl(apiKey, payload.data_url, payload.filename);
    return json({ file_name: fileName }, 200, session.cookie ? { 'Set-Cookie': session.cookie } : {});
  } catch (error) {
    return errorResponse(error);
  }
}
