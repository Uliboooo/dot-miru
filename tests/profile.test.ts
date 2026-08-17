import { describe, expect, it } from "vitest";
import { isAllowedSource, parseProfile } from "../src/lib/profile";

const validToml = `
name = "Seli"
summary = "A tidy setup."
repository = "https://github.com/seli/dotfiles"

[sns]
github = "seli"

[info]
os = "NixOS"
host = "ThinkPad X1 Carbon"
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
images = ["https://images.example/nvim.webp"]

[dotfiles.private]
name = "Private"
desc = "Not published"
hidden = true
`;

describe("source validation", () => {
  it("accepts GitHub and Gist raw TOML URLs", () => {
    expect(isAllowedSource("https://raw.githubusercontent.com/a/b/main/dot-miru.toml")).toBe(true);
    expect(isAllowedSource("https://gist.githubusercontent.com/a/id/raw/dot-miru.toml")).toBe(true);
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
    expect(profile.dotfiles).toEqual([{ id: "nvim", name: "Neovim", desc: "Lua config", images: ["https://images.example/nvim.webp"] }]);
  });

  it("requires a name and accepts an optional HTTPS repository", () => {
    expect(() => parseProfile('name = "X"\nrepository = "http://example.com"')).toThrow();
    expect(parseProfile('name = "X"').repository).toBeUndefined();
    expect(() => parseProfile('repository = "https://example.com"')).toThrow();
  });
});
