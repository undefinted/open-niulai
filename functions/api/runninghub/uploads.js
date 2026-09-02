import { errorResponse, json, readJson } from '../../_lib/http.js';
import { uploadDataUrl } from '../../_lib/runninghub.js';

export async function onRequestPost(context) {
  try {
    const apiKey = context.request.headers.get('X-Provider-Key') || '';
    const payload = await readJson(context.request, 16 * 1024 * 1024);
    const fileName = await uploadDataUrl(apiKey, payload.data_url, payload.filename);
    return json({ file_name: fileName });
  } catch (error) {
    return errorResponse(error);
  }
}
