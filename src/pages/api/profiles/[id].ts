import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import {
  ApiRequestError,
  readEditKey,
  readJsonObject,
} from "../../../lib/api-request";
import {
  deleteStoredProfile,
  getStoredProfile,
  MAX_STORED_TOML_BYTES,
  StoredProfileError,
  updateStoredProfile,
} from "../../../lib/stored-profile";

export const prerender = false;

function idFromParams(id: string | undefined): string {
  if (!id) throw new StoredProfileError("invalid_id", "The profile ID is invalid.");
  return id;
}

function errorResponse(cause: unknown): Response {
  if (cause instanceof ApiRequestError) {
    return Response.json({ error: cause.message }, { status: 400 });
  }
  if (cause instanceof StoredProfileError) {
    const status = cause.code === "not_found" || cause.code === "invalid_id"
      ? 404
      : cause.code === "too_large"
        ? 413
        : 422;
    return Response.json({ error: cause.message, code: cause.code }, { status });
  }
  console.error(JSON.stringify({ message: "stored profile request failed", error: String(cause) }));
  return Response.json({ error: "Unable to process the profile." }, { status: 500 });
}

export const GET: APIRoute = async ({ params }) => {
  try {
    const stored = await getStoredProfile(env.DB, idFromParams(params.id));
    return Response.json(
      { id: stored.id, toml: stored.toml, updatedAt: stored.updatedAt },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (cause) {
    return errorResponse(cause);
  }
};

export const PUT: APIRoute = async ({ params, request }) => {
  try {
    const editKey = readEditKey(request);
    const body = await readJsonObject(request, MAX_STORED_TOML_BYTES);
    if (typeof body.toml !== "string") {
      return Response.json({ error: "The toml field is required." }, { status: 400 });
    }
    const stored = await updateStoredProfile(
      env.DB,
      idFromParams(params.id),
      editKey,
      body.toml,
    );
    return Response.json(
      { id: stored.id, updatedAt: stored.updatedAt },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (cause) {
    return errorResponse(cause);
  }
};

export const DELETE: APIRoute = async ({ params, request }) => {
  try {
    await deleteStoredProfile(env.DB, idFromParams(params.id), readEditKey(request));
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    return errorResponse(cause);
  }
};
