import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { ApiRequestError, readJsonObject } from "../../../lib/api-request";
import {
  createStoredProfile,
  MAX_STORED_TOML_BYTES,
  StoredProfileError,
} from "../../../lib/stored-profile";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const rateLimitKey = request.headers.get("cf-connecting-ip") ?? "local-development";
    const { success } = await env.PROFILE_CREATE_RATE_LIMITER.limit({ key: rateLimitKey });
    if (!success) {
      return Response.json(
        { error: "Too many profiles were created. Try again in a minute." },
        { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "60" } },
      );
    }
    const body = await readJsonObject(request, MAX_STORED_TOML_BYTES);
    if (typeof body.toml !== "string") {
      return Response.json({ error: "The toml field is required." }, { status: 400 });
    }
    const stored = await createStoredProfile(env.DB, body.toml);
    return Response.json(
      {
        id: stored.id,
        editKey: stored.editKey,
        createdAt: stored.createdAt,
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (cause) {
    if (cause instanceof ApiRequestError) {
      return Response.json({ error: cause.message }, { status: 400 });
    }
    if (cause instanceof StoredProfileError) {
      const status = cause.code === "too_large" ? 413 : 422;
      return Response.json({ error: cause.message, code: cause.code }, { status });
    }
    console.error(JSON.stringify({ message: "profile creation failed", error: String(cause) }));
    return Response.json({ error: "Unable to save the profile." }, { status: 500 });
  }
};
