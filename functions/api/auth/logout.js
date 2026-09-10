import { logoutUser } from '../../_lib/auth.js';
import { json } from '../../_lib/http.js';

export async function onRequestPost(context) {
  return json({ authenticated:false }, 200, { 'Set-Cookie':await logoutUser(context.request, context.env) });
}
