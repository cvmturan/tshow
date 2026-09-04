import { handleApiRequest } from '../../cloudflare/edge-proxy.mjs';

export function onRequest(context) {
  return handleApiRequest(context);
}
