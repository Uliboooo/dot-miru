export type Locale = "en" | "ja";

export function localeFromUrl(url: URL): Locale {
  return url.searchParams.get("lang") === "ja" ? "ja" : "en";
}

export function localizedPath(path: string, locale: Locale): string {
  if (locale === "en") return path;
  const url = new URL(path, "https://dot-miru.invalid");
  url.searchParams.set("lang", "ja");
  return `${url.pathname}${url.search}${url.hash}`;
}
