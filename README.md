# dot-miru

An Astro site for presenting dotfiles from public TOML files. It deploys to Cloudflare Pages with the Cloudflare adapter.

## Local development

```sh
bun install
bun run dev
```

Run the checks with `bun run build` and `bun test`.

## Register a profile

Add an entry to `src/data/profiles.toml`:

```toml
[[profile]]
slug = "your-name"
source = "https://raw.githubusercontent.com/you/dotfiles/main/dot-miru.toml"
```

Only HTTPS raw URLs from `raw.githubusercontent.com` and `gist.githubusercontent.com` are accepted. A profile source needs `name` and may provide `repository` (recommended), `summary`, `[sns]`, `[info]`, and `[dotfiles.<id>]` sections. `info` supports `os`, `host`, `kernel`, `shell`, `wm`, `de`, `cursor_theme`, `terminal`, `fonts`, `gpu`, `theme`, `ram_gb`, `ssd_tb`, `hdd_tb`, and `logo`. Use `[info.extra]` for up to 10 additional short string values; keys may contain only letters, numbers, `_`, and `-`.

In `[sns]`, use an account ID rather than a full URL. For example, `github = "@octocat"` generates a link to `github.com/octocat`; `x = "@dot_miru"` generates a link to `x.com/dot_miru`.

Profiles are available at `/u/<slug>`. Any compatible source can be shared with `/?source=<encoded raw URL>`.

## TOML editor

Open `/editor` to create a profile TOML in the browser. It supports all profile fields, additional info, dotfile sections, and public HTTPS image URLs, then downloads the result as `dot-miru.toml`.

## Deploy

Connect this repository to a Cloudflare Pages project with build command `bun run build` and build output directory `dist`. The included `wrangler.jsonc` supplies the project name and compatibility date for local tooling.
