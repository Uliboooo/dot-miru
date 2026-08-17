import type { APIRoute } from "astro";
import { loadProfile, ProfileError } from "../../lib/profile";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const source = url.searchParams.get("source");
  if (!source) return Response.json({ error: "The source query parameter is required." }, { status: 400 });
  try {
    return Response.json(await loadProfile(source), { headers: { "Cache-Control": "public, max-age=300" } });
  } catch (cause) {
    const error = cause instanceof ProfileError ? cause : new ProfileError("fetch_failed", "Unable to load profile.");
    const status = error.code === "invalid_source" ? 400 : error.code === "fetch_failed" ? 502 : 422;
    return Response.json({ error: error.message, code: error.code }, { status });
  }
};
