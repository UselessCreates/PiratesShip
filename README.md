<p align="center">
  <img src="./ascii-art.png" alt="PiratesShip logo" width="420">
</p>

<h1 align="center">PiratesShip</h1>

<p align="center">
  Recreate anything — a site, an app, a game, or something entirely different —<br>
  using research instead of guesswork.
</p>

<p align="center">
  <strong>Evidence-first reconstruction. Your model. Your machine.</strong>
</p>

> [!WARNING]
> **PiratesShip is currently in beta.**
>
> This project is still under active development. Some features may be incomplete, unstable, or not work to their fullest extent. You may encounter bugs, unexpected behaviour, or functionality that changes between releases. Use it with that in mind, and please report any issues you run into.

---

<details>
<summary><strong> About PiratesShip</strong></summary>

PiratesShip is a Windows desktop app: **Rust owns the window, Node owns the work.**

- No build step required to run from source.
- No npm dependencies in the engine.
- No telemetry.
- No account required.

### How it works

```text
PiratesShip.exe ──> webview window (ui/) ──> local engine (host/) ──> your model
                                                    │
                                                    ├─ pageshot.site     screenshots
                                                    ├─ proxy.cors.dev    real HTML + CSS
                                                    └─ web search        design research
```

</details>

<details>
<summary><strong> Run it</strong></summary>

There are two ways to run PiratesShip.

### From source (works today — no Rust needed)

```powershell
npm start
# or:
node host/host.mjs
```

It opens the app in your browser at a loopback URL.

- Add `--no-open` to keep it headless.
- Add `--port 8791` to pin the port.

### As a native Windows app

Install Rust if you don't already have it, then build and launch:

```powershell
winget install --exact --id Rustlang.Rustup
build.bat
run.bat
```

`build.bat` compiles and packages the app into `dist/`. `run.bat` launches `dist/PiratesShip.exe`.

### Build details

`build.bat` is a double-clickable wrapper around `tools/build-windows.ps1`. It:

- Regenerates the icon when `ui/assets/ship.png` is present.
- Closes a running copy so `dist/` can be replaced.
- Compiles and packages the application.

Pass `nopause` to skip the final keypress, and `/y` to close a running app without being asked.

If `cargo` is not on `PATH`, or `link.exe` is missing outside a developer prompt, run:

```powershell
tools\build-native.bat
```

This locates Visual Studio with `vswhere`, enters the MSVC environment, and builds using the full Cargo path.

The native window is a normal Windows window with a native title bar. It can be resized and minimised; nothing is drawn to imitate a Windows window.

### What gets packaged

The build script compiles `native/` with Cargo, then assembles `dist/` with:

- `PiratesShip.exe`
- `host/`
- `ui/`
- A copy of `node.exe` in `runtime/`

The executable looks for Node in this order:

1. `PIRATESHIP_NODE`
2. `runtime\node.exe`
3. `PATH`
4. The usual installation folders

If the executable can't find Node, it still opens a window, explains what's missing, and links to the installer instead of failing silently.

</details>

<details>
<summary><strong> First-time setup</strong></summary>

### 1. Prerequisites

On first run, PiratesShip checks for:

- Node
- npm
- Git
- winget
- WebView2
- Ollama
- The REA inspection kit

Get the REA inspection kit at [rea.tools/get-started](https://rea.tools/get-started).

Every missing item has a one-click install option (winget or `npm -g`). Missing optional tools won't block you from continuing.

**REA is actually used during reconnaissance.** The engine connects to `rea mcp` over stdio, lists the tools the installed build advertises, and calls its website analysis to inspect the reference in a real browser. This includes page structure, scripts, and network activity.

That evidence is saved to `_recon/rea-evidence.md` and included in the plans.

REA requires Node **22.23.4+**, **24.22.1+**, or **26.12.1+**. If you're using an older runtime, setup will tell you and reconnaissance will continue without REA.

### 2. Choose an AI model

PiratesShip includes **42 model presets**.

**33 cloud providers:**

OpenAI, Anthropic, Gemini, xAI, DeepSeek, Mistral, Groq, Together, Fireworks, OpenRouter, Perplexity, Cerebras, SambaNova, Hyperbolic, DeepInfra, Novita, NVIDIA NIM, GitHub Models, Meta Llama, Qwen, Moonshot, Z.AI, MiniMax, Baidu, Upstage, AI/ML API, Requesty, Chutes, Kluster, Lambda, Hugging Face, Azure OpenAI, and Cloudflare.

**8 free/local options:**

- Pollinations (no API key required)
- Ollama
- LM Studio
- llama.cpp
- vLLM
- Jan
- text-generation-webui
- No model (offline builder)

**1 custom option:**

Any OpenAI-compatible endpoint.

Paste your API key, select **Test connection**, and choose a model. You can also type any model ID or refresh the list to ask the provider what it actually serves.

Ollama includes a model downloader with four recommended models and live download progress.

### 3. Choose a theme

Choose either **Dark** or **Bright**. You can change this later with `/theme`.

### API key security

Keys are encrypted using **AES-256-GCM** with a per-install key stored at:

```text
%APPDATA%\PiratesShip\machine.key
```

Keys are never logged and never leave your machine except when sent to the provider you selected.

Use `/keys` to rotate keys. The setup wizard can also clear them.

</details>

<details>
<summary><strong> Using PiratesShip</strong></summary>

The target type sits next to the model selector.

```text
recreate   [site] [app] [game] [other]             OpenAI gpt-4.1
> https://stripe.com/checkout______________________
enter send · /help for commands
```

Type a URL, a name, or a description, then press Enter.

### The reconstruction pipeline

#### 1. Reconnaissance

PiratesShip gathers evidence about the reference:

- Screenshots at desktop, mobile, tablet, dark mode, and full-page sizes through `pageshot.site`.
- Real HTML, stylesheets, and `robots.txt` through `proxy.cors.dev`.
- Up to six same-origin pages discovered through the sitemap and navigation.
- Palette and font statistics extracted from actual CSS.
- Web search results for design research.

Everything is written to disk:

```text
_recon/
├── shots/*.webp
├── html/*.html
├── dossier.md
└── dossier.json
```

#### 2. Planning

The model turns the gathered evidence into a reconstruction plan containing:

- Structure map
- Visual tokens
- Components and states
- Behaviour
- Responsive rules
- File list
- Risks

You can approve the plan with **Enter** or cancel it with **Escape**. The plan is saved as `plan.md`.

#### 3. Building

Files are generated using a strict `===FILE: path===` format. Paths and file sizes are checked before files are written to `site/`.

#### 4. Verification

PiratesShip checks that:

- `index.html` exists.
- Local assets resolve.
- There are no placeholders or Lorem Ipsum.
- The page declares a viewport.

If verification fails, one automatic repair pass is attempted. Remaining failures are reported honestly.

A fidelity audit then measures how much of the reconnaissance evidence the build actually used, including extracted palette colours, typefaces, landmarks, sections, and media queries.

This makes weak reconstructions visible instead of presenting them as faithful results.

### Free mode

Choose **No model** and the pipeline still runs:

- Real screenshots
- Real HTML
- Real colour palette
- A real reconstruction plan
- A responsive site generated deterministically from the gathered evidence

**Zero API calls. Zero cost. Useful output.**

</details>

<details>
<summary><strong> Commands</strong></summary>

| Command | Description |
| --- | --- |
| `/help` | List available commands |
| `/model` | Open the model dropdown (free, provider, custom) |
| `/target site\|app\|game\|other` | Choose what you're rebuilding |
| `/url <url>` | Pin the reference URL |
| `/theme` | Switch between dark and bright themes |
| `/sessions` | View recent builds |
| `/open` | Open the last build folder |
| `/logo reset` | Remove an imported logo |
| `/clear` | Clear the screen and reset session state |
| `/clear history` | Clear the recent-build list (build folders stay on disk) |
| `/discord` | Open the Discord invite in your browser |
| `/new`, `/exit` | Clear the feed or quit |

### Startup checks

Every launch checks for Node, npm, and WebView2 before the main screen appears.

If something is missing, setup opens on the check step and offers one-click installation options. Optional extras (Git, Ollama, and REA) never block startup.

### Model dropdown

The model chip in the dock opens a three-column menu:

- **Free:** no API key required.
- **Provider:** cloud providers and their API keys.
- **Custom:** your own OpenAI-compatible endpoint.

Your selection is saved immediately. If a cloud preset has no key configured, its key field appears in the same menu.

Select **All options** to open the full wizard with base URLs, extra fields, and connection tests.

</details>

<details>
<summary><strong> Where builds are saved</strong></summary>

Builds are saved under your user profile:

```text
%USERPROFILE%\PiratesShip\<date>-<slug>\
```

Each build contains:

| File / Folder | Contents |
| --- | --- |
| `plan.md` | Approved reconstruction plan |
| `recon-summary.md` | Evidence digest |
| `_recon/` | Screenshots, HTML, and dossier |
| `site/` | `index.html`, `styles.css`, `app.js`, `README.md` |
| `SESSION.md` | Prompt, model, and file list |

Builds are plain static files. You can double-click `site\index.html` to open the result — no server required.

</details>

<details>
<summary><strong> The private prompt</strong></summary>

`host/prompt.mjs` contains the doctrine the model is held to:

- Evidence-first rules
- Token derivation
- State coverage
- The craft bar
- The output contract
- Originality limits

It is not user-editable or exposed through an API route, screen, or log line. It is only sent to the model you selected.

Three prompt variants ship with PiratesShip: **plan**, **build**, and **repair**.

</details>

<details>
<summary><strong> Logo and branding</strong></summary>

The ship artwork ships as `ui/assets/ship.png` and is drawn as a mask, recoloured for the current theme (light ink on dark, dark ink on bright). This keeps it readable in both themes.

Any white-on-black render works as a replacement. The built-in 7×9 pixel wordmark is used only as a fallback when no artwork is present.

### Windows icon

The same PNG can become the Windows application icon:

```powershell
powershell -ExecutionPolicy Bypass -File tools/make-icon.ps1 ui\assets\ship.png
powershell -ExecutionPolicy Bypass -File tools/build-windows.ps1
```

`make-icon.ps1` crops the artwork, tints it onto a dark tile, and writes `native/app.ico` at 16, 24, 32, 48, 64, 128, and 256 px.

`native/build.rs` compiles that resource into the executable, so the window, taskbar, and Explorer all show the ship.

### Importing ASCII-art HTML

If you have ASCII-art HTML, you can:

- Drag the `.html` file anywhere onto the window, or
- Run:

```powershell
node tools/import-art.mjs path\to\ascii-art.html
```

Both methods parse the coloured `<span>` grid, store it in `%APPDATA%\PiratesShip\logo-art.json`, and draw it pixel for pixel.

If the grid is almost pure black, it is lifted for contrast and you'll be notified. Use `/logo reset` to return to the built-in wordmark.

</details>

<details>
<summary><strong> Development and testing</strong></summary>

Run the environment checks:

```powershell
node tools/doctor.mjs
```

Run the engine without opening a browser:

```powershell
node host/host.mjs --no-open --port 8791
```

Run a smoke session:

```powershell
node tools/smoke.mjs "http://127.0.0.1:8791/?t=<token>" example.com site
```

The engine has no dependencies, so there is nothing to `npm install`.

You can also run `node --check` on the files, run the doctor, and run a smoke session.

</details>

<details>
<summary><strong> Limitations</strong></summary>

- `proxy.cors.dev` is a proxy, not a browser. It does not run JavaScript, caps responses at 6 MiB, times out after 30 seconds, and only supports GET/HEAD. Client-rendered apps may return thin HTML; screenshots still capture the layout.
- `pageshot.site` is a public screenshot service. Some sites block it.
- `robots.txt` `Disallow` rules are respected for crawling; only public pages are read.
- Search providers may rate-limit requests. Reconnaissance continues without web research if they do.
- Generated code is only as good as the model you attach. Free/local models produce simpler builds than frontier models — that's why verification and repair exist.
- The native shell is Windows-only. The engine and UI run anywhere Node runs.

</details>

<details>
<summary><strong> Recreating things responsibly</strong></summary>

PiratesShip recreates **structure, hierarchy, motion, and craft**. It is designed not to copy trademarks, logos, brand names, proprietary illustrations, or verbatim marketing copy.

The prompt requires:

- A neutral name.
- An original SVG mark.
- Fresh copy in the same general voice.

Generated output uses CSS and inline SVG stand-ins instead of hotlinking the reference's assets. Nothing in the generated site calls back to the reference at runtime.

Use PiratesShip for learning, speed, rebuilding your own products, and interfaces you have the right to reproduce.

</details>

---

<p align="center">
  <sub>Made for curious builders. Reconstruct with evidence, not guesswork.</sub>
</p>
