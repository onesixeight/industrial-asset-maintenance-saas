import { registerIdentityRequest } from "./auth/identity-generation";

export async function apiRequest(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const request = registerIdentityRequest(init.signal);
  try {
    return await fetch(input, { ...init, signal: request.signal });
  } finally {
    request.release();
  }
}
