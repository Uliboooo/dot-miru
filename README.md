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
gpu = "AMD Radeon 780M"
theme = "Catppuccin Mocha"
ram_gb = 32
ssd_tb = [0.5, 1]

[info.extra]
display = "2560×1600"

[dotfiles.nvim]
name = "Neovim"
desc = "Lua configuration for Neovim."
images = ["https://example.com/nvim.webp"]
```

Only HTTPS raw URLs from `raw.githubusercontent.com` and `gist.githubusercontent.com` are accepted. A profile needs `name` and may provide `repository` (recommended), `summary`, `[sns]`, `[info]`, and `[dotfiles.<id>]` sections. `info` supports `os`, `kernel`, `shell`, `wm`, `de`, `cursor_theme`, `terminal`, `fonts`, `gpu`, `theme`, `ram_gb`, `ssd_tb`, `hdd_tb`, and `logo`. Use `[info.extra]` for up to 10 additional short string values; keys may contain only letters, numbers, `_`, and `-`.

In `[sns]`, use an account ID rather than a full URL. For example, `github = "@octocat"` generates a link to `github.com/octocat`; `x = "@dot_miru"` generates a link to `x.com/dot_miru`.

## Share a profile

Publish the TOML to a GitHub repository or Gist and open it with its raw URL:

```text
https://dot-miru.uliboooo.workers.dev/?source=https%3A%2F%2Fraw.githubusercontent.com%2Fyou%2Fdotfiles%2Fmain%2Fdot-miru.toml
```

## Register a profile in the directory

To have a profile listed at `/u/<slug>` and on the top-page directory, open a pull request adding an entry to [`src/data/profiles.toml`](https://github.com/Uliboooo/dot-miru/edit/main/src/data/profiles.toml):

```toml
[[profile]]
slug = "your-name"
source = "https://raw.githubusercontent.com/you/dotfiles/main/dot-miru.toml"
```

The PR should include a public HTTPS raw TOML URL. Profiles are then available at `/u/<slug>`.

## TOML editor

Open `/editor` to create or load a local profile TOML in the browser. It supports all profile fields, additional info, dotfile sections, and public HTTPS image URLs, then downloads the result as `dot-miru.toml`.

## Deploy

Deploy the Worker after logging in to Cloudflare:

```sh
bun run deploy
```

This command checks, builds, and deploys the generated Worker. The first deployment creates the Worker named in `wrangler.jsonc`. Configure a custom domain afterwards in the Worker settings in the Cloudflare dashboard.

## Continuous deployment

Connect this repository in the Cloudflare Workers dashboard using Git integration. Once `main` is selected as the production branch, Cloudflare deploys each push automatically.
