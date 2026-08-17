import { describe, expect, it } from "vitest";
import { canonicalizeSource, isAllowedSource, loadProfile, parseProfile } from "../src/lib/profile";

const validToml = `
name = "Seli"
summary = "A tidy setup."
repository = "https://github.com/seli/dotfiles"

[sns]
github = "seli"

[info]
os = "NixOS"
kernel = "6.16"
shell = "zsh"
wm = "niri"
de = "none"
cursor_theme = "Bibata Modern Ice"
terminal = "ghostty"
fonts = ["Iosevka", "Noto Sans JP"]
gpu = "AMD Radeon 780M"
theme = "Catppuccin Mocha"
ram_gb = 32
ssd_tb = [0.5, 1]

[info.extra]
display = "2560×1600"
keyboard = "US ANSI"

[dotfiles.nvim]
name = "Neovim"
desc = "Lua config"
images = [{ url = "https://gist.githubusercontent.com/seli/abc/raw/revision/nvim.webp", alt = "Neovim setup" }]

[dotfiles.private]
name = "Private"
desc = "Not published"
hidden = true
`;

describe("source validation", () => {
  it("accepts GitHub and Gist raw TOML URLs", () => {
    expect(isAllowedSource("https://raw.githubusercontent.com/a/b/main/dot-miru.toml")).toBe(true);
    expect(isAllowedSource("https://gist.githubusercontent.com/a/id/raw/dot-miru.toml")).toBe(true);
    expect(canonicalizeSource("https://gist.githubusercontent.com/a/id/raw/123abc/dot-miru.toml")).toBe("https://gist.githubusercontent.com/a/id/raw/dot-miru.toml");
  });

  it("follows redirects only to allowed raw TOML hosts", async () => {
    const target = "https://gist.githubusercontent.com/a/id/raw/dot-miru.toml";
    const fetcher = async (input: string | URL | Request) => {
      if (String(input).includes("start.toml")) return new Response(null, { status: 302, headers: { location: target } });
      return new Response('name = "Redirected"');
    };
    await expect(loadProfile("https://gist.githubusercontent.com/a/id/raw/start.toml", fetcher as typeof fetch)).resolves.toMatchObject({ name: "Redirected" });
    const unsafeRedirect = async () => new Response(null, { status: 302, headers: { location: "https://example.com/profile.toml" } });
    await expect(loadProfile("https://gist.githubusercontent.com/a/id/raw/start.toml", unsafeRedirect as typeof fetch)).rejects.toThrow("unsupported host");
  });

  it("rejects non-raw, non-HTTPS, and non-TOML URLs", () => {
    expect(isAllowedSource("https://github.com/a/b/blob/main/dot-miru.toml")).toBe(false);
    expect(isAllowedSource("http://raw.githubusercontent.com/a/b/main/dot-miru.toml")).toBe(false);
    expect(isAllowedSource("https://raw.githubusercontent.com/a/b/main/readme.md")).toBe(false);
  });
});

describe("profile TOML", () => {
  it("normalizes machine keys and excludes hidden dotfiles", () => {
    const profile = parseProfile(validToml);
    expect(profile.info?.ramGb).toBe(32);
    expect(profile.info?.cursorTheme).toBe("Bibata Modern Ice");
    expect(profile.info?.fonts).toEqual(["Iosevka", "Noto Sans JP"]);
    expect(profile.info?.gpu).toBe("AMD Radeon 780M");
    expect(profile.info?.extra).toEqual({ display: "2560×1600", keyboard: "US ANSI" });
    expect(profile.info?.ssdTb).toEqual([0.5, 1]);
    expect(profile.dotfiles).toEqual([{ id: "nvim", name: "Neovim", desc: "Lua config", images: [{ url: "https://gist.githubusercontent.com/seli/abc/raw/nvim.webp", alt: "Neovim setup" }] }]);
  });

  it("requires a name and accepts an optional HTTPS repository", () => {
    expect(() => parseProfile('name = "X"\nrepository = "http://example.com"')).toThrow();
    expect(parseProfile('name = "X"').repository).toBeUndefined();
    expect(() => parseProfile('repository = "https://example.com"')).toThrow();
  });
});
