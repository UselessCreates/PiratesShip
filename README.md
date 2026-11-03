# PiratesShip

Recreate anything — a site, an app, a game, another kind of thing — from research instead of guesswork.

A Windows desktop app: **Rust** owns the window, **Node** owns the work. No build step, no npm
dependencies in the engine, no telemetry, no account.

```
PiratesShip.exe ──> webview window (ui/) ──> local engine (host/) ──> your model
                                                  │
                                                  ├─ pageshot.site      screenshots
                                                  ├─ proxy.cors.dev     real HTML + CSS
                                                  └─ web search         design research
```

## Run it

Two ways, same app.

**From source (works today, no Rust needed)**

```powershell
npm start          # or: node host/host.mjs
```

It opens the window in your browser at a loopback URL. Add `--no-open` to keep it headless,
`--port 8791` to pin the port.

**As a real Windows app**

```powershell
winget install --exact --id Rustlang.Rustup     # if you don't have Rust
build.bat                                       # compile + package into dist\
run.bat                                         # launch dist\PiratesShip.exe
```

`build.bat` is the double-clickable wrapper around `tools/build-windows.ps1`: it regenerates
the icon when `ui\assets\ship.png` is present, closes a running copy so `dist\` can be
replaced, then compiles and packages. Pass `nopause` to skip the final keypress, and
`/y` to close a running app without being asked. `run.bat` just launches the packaged exe
and tells you to build first when `dist\` is empty.

If `cargo` is not on `PATH`, or `link.exe` is missing outside a developer prompt, run
`tools\build-native.bat` instead — it locates Visual Studio with `vswhere`, enters the MSVC
environment, and builds with the full cargo path. The window is a normal Windows window
(native title bar, resizable, minimisable); nothing is drawn to imitate one.

The script compiles `native/` with cargo, then assembles `dist/` with `PiratesShip.exe`,
`host/`, `ui/`, and a copy of `node.exe` in `runtime/`. The exe looks for Node in this order:
`PIRATESHIP_NODE`, `runtime\node.exe`, `PATH`, then the usual install folders.

If the exe can't find Node it still opens a window, explains what's missing, and links the
installer — it never dies silently.

## First run

1. **Prerequisites.** Live checks for Node, npm, Git, winget, WebView2, Ollama and the REA
   inspection kit from [rea.tools/get-started](https://rea.tools/get-started). Every missing
   item has a one-click install (winget or `npm -g`) and you are never blocked from continuing.
   REA is genuinely used, not decoration: during recon the engine connects to `rea mcp` over
   stdio, lists the tools that build actually advertises, and calls its website analysis to
   observe the reference in a real browser (page structure, scripts, network activity). That
   evidence is attached to the dossier as `_recon/rea-evidence.md` and injected into the plans.
   REA needs Node 22.23.4+ / 24.22.1+ / 26.12.1+, so on an older runtime the setup row says so
   and recon simply proceeds without it.
2. **AI.** 42 presets:
   - **33 cloud** — OpenAI, Anthropic, Gemini, xAI, DeepSeek, Mistral, Groq, Together,
     Fireworks, OpenRouter, Perplexity, Cerebras, SambaNova, Hyperbolic, DeepInfra, Novita,
     NVIDIA NIM, GitHub Models, Meta Llama, Qwen, Moonshot, Z.AI, MiniMax, Baidu, Upstage,
     AI/ML API, Requesty, Chutes, Kluster, Lambda, Hugging Face, Azure OpenAI, Cloudflare.
   - **8 free** — Pollinations (no key at all), Ollama, LM Studio, llama.cpp, vLLM, Jan,
     text-generation-webui, and **No model** (offline builder).
   - **1 custom** — any OpenAI-compatible endpoint.
   Paste a key, hit *test connection*, pick a model (or type any model id, or hit *refresh* to
   ask the provider what it actually serves). Ollama gets a model downloader with the four
   models worth pulling, with live progress.
3. **Style.** Dark or bright. Change it later with `/theme`.

Keys are encrypted with AES-256-GCM under a per-install key in
`%APPDATA%\PiratesShip\machine.key`. They are never logged and never leave your machine
except to the provider you selected. `/keys` rotates them, and the wizard can clear them.

## Using it

The target kind sits next to the model selector:

```
recreate   [site] [app] [game] [other]              OpenAI gpt-4.1
> https://stripe.com/checkout________________________
enter send · /help for commands
```

Type a URL, a name, or a description and press Enter.

**Pipeline**

1. **Recon.** Screenshots at desktop, mobile, tablet, dark mode and full page via
   `pageshot.site`; real HTML, stylesheets and robots.txt via `proxy.cors.dev`; up to 6
   same-origin pages discovered from the sitemap and nav; palette and font statistics pulled
   from the actual CSS; web research from search. Everything is written to disk:
   `_recon/shots/*.webp`, `_recon/html/*.html`, `_recon/dossier.md`, `_recon/dossier.json`.
2. **Plan.** The model turns the dossier into a reconstruction plan: structure map, visual
   tokens, components and states, behaviour, responsive rules, file list, risks. You approve it
   (Enter) or cancel it (Escape). It's saved as `plan.md`.
3. **Build.** Files are generated in a strict `===FILE: path===` format, path-checked, size
   checked and written to `site/`.
4. **Verify.** `index.html` must exist, local assets must resolve, no placeholders, no lorem
   ipsum, and the page must declare a viewport. Failures get one automatic repair pass, then
   get reported honestly. A fidelity audit then reports how much of the recon evidence the
   build actually used — how many extracted palette colours and typefaces appear, how many
   landmarks and sections it has, and how many media queries it ships — so a weak
   reconstruction is visible instead of being presented as a faithful one.

**Free mode.** Choose *No model* and the whole pipeline still runs: real screenshots, real
HTML, real palette, a real plan, and a real responsive site generated from that evidence
deterministically. Zero API calls, zero cost, useful output.

**Commands**

| command | what it does |
| --- | --- |
| `/help` | list commands |
| `/model` | open the model dropdown (free · provider · custom) |
| `/target site\|app\|game\|other` | what you're rebuilding |
| `/url <url>` | pin the reference URL |
| `/theme` | dark ⇄ light |
| `/sessions` | recent builds |
| `/open` | open the last build folder |
| `/logo reset` | drop an imported logo |
| `/clear` | wipe the screen and reset the session state |
| `/clear history` | forget the recent-build list (build folders stay on disk) |
| `/discord` | open the Discord invite in your browser |
| `/new`, `/exit` | clear the feed, quit |

**Startup check.** Every launch re-checks the required pieces (Node, npm, WebView2) before
the main screen appears. If one is missing — not just on first run — setup opens on the check
step with one-click installs. Optional extras (Git, Ollama, REA) never block startup.

**Model dropdown.** The model chip in the dock opens a three-column menu: free (no key),
provider (cloud keys), custom (your own OpenAI-compatible endpoint). Pick a preset and it is
saved immediately; a cloud preset that has no key yet shows a key field in the same menu.
`all options` opens the fuller wizard with base URLs, extra fields and connection tests.

**Where builds land**

```
%USERPROFILE%\PiratesShip\<date>-<slug>\
  plan.md            approved plan
  recon-summary.md   evidence digest
  _recon\            screenshots, html, dossier
  site\              index.html styles.css app.js README.md
  SESSION.md         prompt, model, file list
```

Builds are plain static files. Double-click `site\index.html` — no server required.

## The private prompt

`host/prompt.mjs` holds the doctrine the model is held to: evidence-first rules, token
derivation, state coverage, the craft bar, the output contract, and originality limits. It is
not user-editable and not exposed: no API route, screen or log line serves it, and it is only
ever sent to the model you selected. Three variants ship: plan, build and repair.

## Your logo

The ship artwork ships as `ui/assets/ship.png` and is drawn as a mask, recoloured for the
current theme (light ink on dark, dark ink on bright), so it holds up in both modes. Any
white-on-black render works as a replacement. The built-in 7×9 pixel wordmark is only the
fallback when no artwork is present.

The same PNG becomes the Windows icon in one step:

```powershell
powershell -ExecutionPolicy Bypass -File tools/make-icon.ps1 ui\assets\ship.png
powershell -ExecutionPolicy Bypass -File tools/build-windows.ps1
```

`make-icon.ps1` crops to the artwork, tints it onto a dark tile and writes `native/app.ico`
at 16, 24, 32, 48, 64, 128 and 256 px. `native/build.rs` compiles that resource into the
exe, so the window, taskbar and Explorer all show the ship.

To use the ASCII-art HTML you have instead, either:

- drag the `.html` file anywhere onto the window, or
- `node tools/import-art.mjs path\to\ascii-art.html`

Both parse the coloured `<span>` grid, store it in `%APPDATA%\PiratesShip\logo-art.json`, and
draw it pixel for pixel. If the grid is almost pure black it is lifted for contrast and you are
told so. `/logo reset` returns to the built-in wordmark.

## Development

```powershell
node tools/doctor.mjs                        # environment + API reachability
node host/host.mjs --no-open --port 8791     # engine only
node tools/smoke.mjs "http://127.0.0.1:8791/?t=<token>" example.com site
```

The engine has no dependencies, so there is nothing to `npm install`. `node --check` the
files, run the doctor, run a smoke session.

## Limitations

- `proxy.cors.dev` is a proxy, not a browser: it does not run JavaScript, caps responses at
  6 MiB, times out at 30s, and only does GET/HEAD. Client-rendered apps will give thin HTML —
  the screenshots still carry the layout.
- `pageshot.site` is a public screenshot service. Some sites block it.
- Robots.txt `Disallow` rules are respected for crawling; only public pages are read.
- Search providers rate-limit. Recon continues without web research if they do.
- Generated code is only as good as the model you attach. Free/local models produce simpler
  builds than frontier models — that is why verify and repair exist.
- Windows only for the native shell. The engine and UI run anywhere Node runs.

## Recreating things responsibly

PiratesShip rebuilds **structure, hierarchy, motion and craft**. It is built not to copy
trademarks, logos, brand names, proprietary illustrations or verbatim marketing copy: the
prompt requires a neutral name, an original SVG mark, and fresh copy in the same voice. Output
uses CSS and inline SVG stand-ins instead of hotlinking the reference's assets, and nothing in
the generated site calls back to the reference at runtime.

Use it for learning, for speed, for rebuilding your own products, and for interfaces you have
the right to reproduce.
