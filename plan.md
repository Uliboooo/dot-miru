- this web page introduce users dotfiles with images and text.
- load toml files that is written about user dotfiles, then render to web page
    - users can update a information to edit toml file, dot-miru only read file by path(or internet page(e.g. gist))
- 各情報は適切かつシンプルに表示できるように

- toml structs 👇

```toml
summary = "summary of dotfiles"

[info]
os = "os"
host = "host"
kernel = "kernel"
shell = "shell"
wm = "window manager"
de = "desktop environment"
cursor_theme = "cursor theme"
terminal = "terminal"
fonts = ["font 1", "font 2"]
gpu = "GPU"
theme = "theme"
ram_gb = 32
ssd_tb = [0.5, 1]
hdd_tb = [2]
logo = ["path/to/image", "path/to/screen_shot"]

[dotfiles.nvim]
name = "nvim"
desc = """
description of nvim
nvim config is written in lua
"""
images = ["path", "path2"]
hidden = false // default is false

[dotfiles.niri]
name = "niri"
desc = """
description of niri
niri config is written in kdl
"""
images = ["path", "path2"]
hidden = false // default is false
```
