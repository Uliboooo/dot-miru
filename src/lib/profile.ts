import { parse } from "smol-toml";
import { z } from "zod";

const MAX_SOURCE_BYTES = 1_000_000;
const CACHE_TTL_MS = 60 * 1000;
const allowedHosts = new Set(["raw.githubusercontent.com", "gist.githubusercontent.com"]);

export type Dotfile = {
  id: string;
  name: string;
  desc: string;
  images: string[];
};

export type Profile = {
  name: string;
  summary?: string;
  repository?: string;
  sns?: { github?: string; x?: string };
  info?: {
    os?: string;
    kernel?: string;
    shell?: string;
    wm?: string;
    de?: string;
    cursorTheme?: string;
    terminal?: string;
    fonts?: string[];
    gpu?: string;
    theme?: string;
    extra?: Record<string, string>;
    ramGb?: number;
    ssdTb?: number[];
    hddTb?: number[];
    logo?: string;
  };
  dotfiles: Dotfile[];
};

export class ProfileError extends Error {
  constructor(
    public readonly code: "invalid_source" | "fetch_failed" | "invalid_toml" | "invalid_profile",
    message: string,
  ) {
    super(message);
  }
}

/** Turn GitHub Gist's revision-pinned Raw links into their stable latest-file form. */
export function canonicalizeSource(source: string): string {
  try {
    const url = new URL(source);
    if (url.hostname !== "gist.githubusercontent.com") return source;
    const parts = url.pathname.split("/").filter(Boolean);
    // /<user>/<gist-id>/raw/<revision>/<filename> → /<user>/<gist-id>/raw/<filename>
    if (parts.length >= 5 && parts[2] === "raw") {
      url.pathname = `/${parts[0]}/${parts[1]}/raw/${parts.slice(4).join("/")}`;
      url.search = "";
      url.hash = "";
      return url.toString();
    }
  } catch {
    // Validation is handled by isAllowedSource.
  }
  return source;
}

const httpsUrl = z.url().refine((value) => new URL(value).protocol === "https:", {
  message: "must be an HTTPS URL",
});

const profileSchema = z.object({
  name: z.string().trim().min(1).max(100),
  summary: z.string().trim().max(2_000).optional(),
  repository: httpsUrl.optional(),
  sns: z
    .object({
      github: z.string().trim().min(1).max(100).optional(),
      x: z.string().trim().min(1).max(100).optional(),
    })
    .optional(),
  info: z
    .object({
      os: z.string().trim().min(1).max(100).optional(),
      kernel: z.string().trim().min(1).max(100).optional(),
      shell: z.string().trim().min(1).max(100).optional(),
      wm: z.string().trim().min(1).max(100).optional(),
      de: z.string().trim().min(1).max(100).optional(),
      cursor_theme: z.string().trim().min(1).max(100).optional(),
      terminal: z.string().trim().min(1).max(100).optional(),
      fonts: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
      gpu: z.string().trim().min(1).max(100).optional(),
      theme: z.string().trim().min(1).max(100).optional(),
      extra: z
        .record(
          z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),
          z.string().trim().min(1).max(200),
        )
        .refine((extra) => Object.keys(extra).length <= 10, "may contain at most 10 items")
        .optional(),
      ram_gb: z.number().positive().max(4_096).optional(),
      ssd_tb: z.array(z.number().positive().max(1_000)).max(20).optional(),
      hdd_tb: z.array(z.number().positive().max(1_000)).max(20).optional(),
      logo: httpsUrl.optional(),
    })
    .optional(),
  dotfiles: z
    .record(
      z.string().regex(/^[a-zA-Z0-9_-]+$/),
      z.object({
        name: z.string().trim().min(1).max(100),
        desc: z.string().trim().min(1).max(5_000),
        images: z.array(httpsUrl).max(20).default([]),
        hidden: z.boolean().default(false),
      }),
    )
    .default({}),
});

export function isAllowedSource(source: string): boolean {
  try {
    const url = new URL(source);
    return url.protocol === "https:" && allowedHosts.has(url.hostname) && url.pathname.endsWith(".toml");
  } catch {
    return false;
  }
}

export function parseProfile(toml: string): Profile {
  let parsed: unknown;
  try {
    parsed = parse(toml);
  } catch {
    throw new ProfileError("invalid_toml", "The source is not valid TOML.");
  }

  const result = profileSchema.safeParse(parsed);
  if (!result.success) {
    throw new ProfileError("invalid_profile", "The TOML does not match the dot-miru profile format.");
  }

  const { info, dotfiles, ...profile } = result.data;
  return {
    ...profile,
    info: info && {
      os: info.os,
      kernel: info.kernel,
      shell: info.shell,
      wm: info.wm,
      de: info.de,
      cursorTheme: info.cursor_theme,
      terminal: info.terminal,
      fonts: info.fonts,
      gpu: info.gpu,
      theme: info.theme,
      extra: info.extra,
      ramGb: info.ram_gb,
      ssdTb: info.ssd_tb,
      hddTb: info.hdd_tb,
      logo: info.logo && canonicalizeSource(info.logo),
    },
    dotfiles: Object.entries(dotfiles)
      .filter(([, dotfile]) => !dotfile.hidden)
      .map(([id, dotfile]) => ({ id, name: dotfile.name, desc: dotfile.desc, images: dotfile.images.map(canonicalizeSource) })),
  };
}

function cacheKey(source: string): Request {
  return new Request(`https://dot-miru-cache.invalid/profile?source=${encodeURIComponent(source)}`);
}

type CachedProfile = { cachedAt: number; profile: Profile };

async function fetchTomlSource(source: string, fetcher: typeof fetch): Promise<Response> {
  let current = source;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetcher(current, {
      redirect: "manual",
      headers: { Accept: "application/toml,text/plain" },
    });
    if (response.status < 300 || response.status >= 400) return response;

    const location = response.headers.get("location");
    if (!location) throw new ProfileError("fetch_failed", "The TOML source redirected without a destination.");
    const next = new URL(location, current).toString();
    if (!isAllowedSource(next)) {
      throw new ProfileError("fetch_failed", "The TOML source redirected to an unsupported host.");
    }
    current = next;
  }
  throw new ProfileError("fetch_failed", "The TOML source redirected too many times.");
}

export async function loadProfile(source: string, fetcher: typeof fetch = fetch): Promise<Profile> {
  const canonicalSource = canonicalizeSource(source);
  if (!isAllowedSource(canonicalSource)) {
    throw new ProfileError("invalid_source", "Use an HTTPS raw TOML URL from GitHub or Gist.");
  }

  const cache = (globalThis as typeof globalThis & { caches?: CacheStorage & { default?: Cache } }).caches?.default;
  const key = cacheKey(canonicalSource);
  if (cache) {
    const hit = await cache.match(key);
    if (hit) {
      const cached = (await hit.json()) as CachedProfile;
      if (Date.now() - cached.cachedAt < CACHE_TTL_MS) return cached.profile;
    }
  }

  let response: Response;
  try {
    response = await fetchTomlSource(canonicalSource, fetcher);
  } catch (error) {
    if (error instanceof ProfileError) throw error;
    throw new ProfileError("fetch_failed", "The TOML source could not be reached.");
  }
  if (!response.ok) {
    throw new ProfileError("fetch_failed", `The TOML source returned HTTP ${response.status}.`);
  }
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_SOURCE_BYTES) {
    throw new ProfileError("fetch_failed", "The TOML source is too large.");
  }
  const body = await response.arrayBuffer();
  if (body.byteLength > MAX_SOURCE_BYTES) {
    throw new ProfileError("fetch_failed", "The TOML source is too large.");
  }
  const profile = parseProfile(new TextDecoder().decode(body));

  if (cache) {
    const cached: CachedProfile = { cachedAt: Date.now(), profile };
    await cache.put(key, new Response(JSON.stringify(cached), { headers: { "Cache-Control": "max-age=60" } }));
  }
  return profile;
}
