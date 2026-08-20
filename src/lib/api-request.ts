const JSON_OVERHEAD_BYTES = 2_048;

export class ApiRequestError extends Error {}

export async function readJsonObject(
  request: Request,
  payloadLimit: number,
): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new ApiRequestError("Send an application/json request.");
  }

  // JSON escaping can nearly double a TOML string containing quotes or backslashes.
  const limit = payloadLimit * 2 + JSON_OVERHEAD_BYTES;
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    throw new ApiRequestError("The request body is too large.");
  }

  const reader = request.body?.getReader();
  if (!reader) throw new ApiRequestError("The request body is required.");
  const decoder = new TextDecoder();
  let byteLength = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > limit) {
      await reader.cancel();
      throw new ApiRequestError("The request body is too large.");
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ApiRequestError("The request body is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ApiRequestError("The request body must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

export function readEditKey(request: Request): string {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization);
  if (!match) throw new ApiRequestError("A valid edit key is required.");
  return match[1];
}
