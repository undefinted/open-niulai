import { registerUser } from '../../_lib/auth.js';
import { errorResponse, json, readJson } from '../../_lib/http.js';

export async function onRequestPost(context) {
  try {
    const result = await registerUser(context.request, context.env, await readJson(context.request, 4 * 1024));
    return json({ authenticated:true, user:result.user }, 201, result.session.cookie ? { 'Set-Cookie':result.session.cookie } : {});
  } catch (error) {
    return errorResponse(error);
  }
}
