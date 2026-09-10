import { loginUser } from '../../_lib/auth.js';
import { errorResponse, json, readJson } from '../../_lib/http.js';

export async function onRequestPost(context) {
  try {
    const result = await loginUser(context.request, context.env, await readJson(context.request, 4 * 1024));
    return json({ authenticated:true, user:result.user }, 200, result.session.cookie ? { 'Set-Cookie':result.session.cookie } : {});
  } catch (error) {
    return errorResponse(error);
  }
}
