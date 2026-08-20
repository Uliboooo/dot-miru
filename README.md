# dot-miru

An Astro site for presenting dotfiles from public TOML files. It deploys to Cloudflare Workers with the Cloudflare adapter.

## Local development

```sh
bun install
bun run dev
```

Run the checks with `bun run build` and `bun test`.

## TOML format

Use the browser-based [Editor](/editor) to create or load a TOML file, or write one directly:

```toml
name = "Your name"
summary = "A short introduction to your setup."
repository = "https://github.com/you/dotfiles" # recommended

[sns]
github = "@octocat"
x = "@dot_miru"

[info]
os = "NixOS"
kernel = "6.16"
shell = "fish"
wm = "niri"
terminal = "ghostty"
fonts = ["Iosevka", "Noto Sans JP"]
cpu = "AMD Ryzen 7 7840U"
gpu = "AMD Radeon 780M"
theme = "Catppuccin Mocha"
ram_gb = 32
ssd_tb = [0.5, 1]

[info.extra]
display = "2560×1600"

[dotfiles.nvim]
name = "Neovim"
desc = "Lua configuration for Neovim."
images = [{ url = "https://example.com/nvim.webp", alt = "Neovim configuration" }]
```

Only HTTPS raw URLs from `raw.githubusercontent.com` and `gist.githubusercontent.com` are accepted. A profile needs `name` and may provide `repository` (recommended), `summary`, `[sns]`, `[info]`, and `[dotfiles.<id>]` sections. `info` supports `os`, `kernel`, `shell`, `wm`, `de`, `cursor_theme`, `terminal`, `fonts`, `cpu`, `gpu`, `theme`, `ram_gb`, `ssd_tb`, `hdd_tb`, and `logo`. Use `[info.extra]` for up to 10 additional short string values; keys may contain only letters, numbers, `_`, and `-`.

In `[sns]`, use an account ID rather than a full URL. For example, `github = "@octocat"` generates a link to `github.com/octocat`; `x = "@dot_miru"` generates a link to `x.com/dot_miru`.

## Share a profile

The easiest option is the browser-based [Editor](/editor). Select **Publish profile** and dot-miru stores the validated TOML in Cloudflare D1, then returns:

- a short public URL such as `/p/<id>`;
- a private editor URL whose `#key=` fragment contains the edit key.

The edit key is generated in the Worker. Only its SHA-256 digest is stored. Keep the editor URL safe: the key cannot be recovered, and it is required to update or delete the profile.

Anonymous profile creation is limited to five requests per minute per client address at each Cloudflare location. Updates and deletes still require the edit key.

Existing GitHub and Gist profiles remain supported. To load one directly, publish the TOML to a GitHub repository or Gist and open it with its raw URL:


```text
https://dot-miru.uliboooo.workers.dev/?source=https%3A%2F%2Fraw.githubusercontent.com%2Fyou%2Fdotfiles%2Fmain%2Fdot-miru.toml
```

Gist's **Raw** button may copy a revision-pinned URL. That URL is accepted and automatically normalized to the stable, latest-file form when dot-miru loads it or prepares a directory entry.

Profile TOML changes appear within about one minute. If you replace an image without changing its URL, use a version query such as `?v=2` to bypass the image host and browser caches.

Small public images may also live in a Gist. Paste the image's Raw URL into `logo` or `images`; revision-pinned Gist Raw URLs are automatically normalized to their stable latest-file form.

## Register a profile in the directory

To have a profile listed at `/u/<slug>` and on the top-page directory, open a pull request adding an entry to [`src/data/profiles.toml`](https://github.com/Uliboooo/dot-miru/edit/main/src/data/profiles.toml):

```toml
[[profile]]
slug = "your-name"
source = "https://raw.githubusercontent.com/you/dotfiles/main/dot-miru.toml"
```

The PR should include a public HTTPS raw TOML URL. Profiles are then available at `/u/<slug>`.

## TOML editor

Open `/editor` to create, publish, update, delete, or load a local profile TOML in the browser. It supports all profile fields, additional info, dotfile sections, and public HTTPS image URLs. A local `dot-miru.toml` download remains available.

## D1 setup

The Worker uses separate D1 databases for production and Git preview versions. Their bindings are checked into `wrangler.jsonc`:

- `dot-miru-profiles` for the active deployment from `main`;
- `dot-miru-profiles-preview` shared by non-production branches.

Apply the checked-in migrations before the corresponding deployment:

```sh
bun run migrate:production
bun run migrate:preview
```

For local development, apply migrations to Wrangler's local D1 database:

```sh
wrangler d1 migrations apply dot-miru-profiles --local
```

## Deploy

Deploy the Worker after logging in to Cloudflare:

```sh
bun run deploy
```

This command checks, builds, and deploys the generated Worker. The first deployment creates the Worker named in `wrangler.jsonc`. Configure a custom domain afterwards in the Worker settings in the Cloudflare dashboard.

## Continuous deployment

Connect this repository in the Cloudflare Workers dashboard using Git integration. In **Settings → Build → Branch control**, select `main` as the production branch and enable builds for non-production branches.

Use these build commands:

```text
Build command:
bun run build

Deploy command:
bunx wrangler deploy

Non-production branch deploy command:
bunx wrangler versions upload
```

Pushes to `main` deploy the production D1 binding. Other branches use the shared preview D1 and upload a version with a preview URL without promoting it to the active deployment. Database migrations remain an explicit step (`bun run migrate:production` or `bun run migrate:preview`) so a schema change is reviewed and applied deliberately before its matching deployment.
