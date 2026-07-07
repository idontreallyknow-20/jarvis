# JARVIS

A personal, holographic voice assistant — with a memory it draws as glowing, connected lines, just like JARVIS in the movies.

- **Talk mode** — your browser talks to the Anthropic API directly and reads replies aloud.
- **Build mode** — your spoken command goes to a small **local** Node bridge that runs **Claude Code** headless to actually edit files in a project.
- **Memory core** — every exchange becomes a glowing node on a live holographic graph. Related memories connect with lines; new memories spark in with a travelling pulse. It's stored in your browser and rendered on an HTML canvas.

Everything is one static page (`public/index.html`) plus one optional local script (`bridge/server.mjs`). No build step, no frameworks, no accounts.

```
jarvis/
├─ public/
│  └─ index.html      ← the orb UI + memory graph (host this)
├─ bridge/
│  └─ server.mjs      ← local bridge for Build mode (run on your machine)
└─ README.md
```

---

## 1. Try it locally (2 minutes)

Any static file server works. The simplest:

```bash
cd public
python3 -m http.server 5173
#   → open http://localhost:5173
```

or with Node: `npx serve public`.

Then click the **⚙ Settings** gear and paste your **Anthropic API key** (starts with `sk-ant-…`). That's all Talk mode needs.

> Press **Space** (or tap the orb) to speak. Type in the box and hit **Enter** if you'd rather not use the mic. Press **M** to open the **Memory** view.

---

## 2. The memory graph

Every message — yours and JARVIS's — is saved as a **memory** in your browser's `localStorage` and drawn as a node on the canvas behind the orb.

- **Nodes** are memories. Amber = yours / recent, cyan = JARVIS / older. Bigger = more connected.
- **Lines** connect memories that share topics (keywords/entities are extracted automatically) plus a light link to the previous message, so a conversation reads as a thread.
- **New memory** → a node sparks in and a pulse travels down each new line.
- **Hover** a node to read the memory; **click** to focus it and ripple a recall pulse.
- Open the **Memory** view (top bar or **M**) for stats, topic threads, and a search box that highlights matching memories. **Purge memory core** wipes it.

Nothing about the memory graph needs the network — it renders offline and persists across reloads.

---

## 3. Hosting Talk mode (free, on Vercel)

Deploy the `public/` folder as a static site.

1. Push this repo to GitHub.
2. In [Vercel](https://vercel.com), **New Project → Import** the repo.
3. Set **Root Directory** to `public` (or leave root and set the output dir to `public`). No build command needed — it's static.
4. Deploy. Open the URL, add your API key in Settings, and **Talk mode works immediately.**

> Talk mode calls `https://api.anthropic.com` straight from your browser using the `anthropic-dangerous-direct-browser-access` header. Your key lives only in your browser's `localStorage` — it is never sent to Vercel or anyone but Anthropic. Use a scoped key, and remember anyone with access to that browser profile can read it.

Alternatives: Netlify, Cloudflare Pages, GitHub Pages — all work the same way (serve the `public/` folder).

---

## 4. Build mode (runs on your machine)

Build mode lets you **speak a change and have Claude Code make it** in a real project directory.

### Prerequisites
- [Claude Code](https://claude.com/claude-code) installed and logged in (`claude` on your `PATH`).
- Node 18+.

### Run the bridge
```bash
PROJECT_DIR=/path/to/your/project node bridge/server.mjs
#   defaults to the current directory if PROJECT_DIR is unset
```

You'll see it listening on `http://127.0.0.1:8787`. In the orb, switch to **Build**, and try a preset like **▸ + Subscribe section**.

Under the hood each command runs:
```
claude -p "ultrathink <your command>" \
       --model claude-opus-4-8 \
       --permission-mode acceptEdits \
       --output-format json \
       --allowedTools "Read,Edit,Write"
```
`ultrathink` is prepended so it reasons hard; it falls back to `--model opus` if the full model string errors. The console prints every command and a short result so you can watch it work.

### Why your hosted page can still reach `localhost`
Even when the orb is hosted on Vercel, the Build request is made **by your browser, from your machine**, so it can reach `http://localhost:8787`. The request never leaves your computer. (If the bridge URL differs, set it in Settings.)

### Enabling command execution (optional, risky)
By default the agent may only Read/Edit/Write files. To let it run shell commands (`npm`, `git`, build scripts…), open `bridge/server.mjs` and switch the clearly-marked line to:
```js
const ALLOWED_TOOLS = "Read,Edit,Write,Bash";  // ⚠️ command execution enabled
```
Only do this for a **trusted project inside a git repo**, and never with the bridge exposed.

---

## 5. Security — please read

- **The bridge must NEVER be exposed to the public internet.** It runs an agent with file access under your credentials. It binds to `127.0.0.1` on purpose — don't change that, don't tunnel it, don't run it on a shared machine.
- **Keep `PROJECT_DIR` inside a git repo** so every change Claude makes can be reviewed with `git diff` and reverted with `git checkout`.
- **Your API key is a browser secret.** It sits in `localStorage`; use a scoped/limited key.

A fully cloud-hosted Build mode would need a real backend running the [Claude Agent SDK](https://docs.claude.com/en/api/agent-sdk) with per-user sandboxing and auth. That's a separate, larger project — deliberately **not** part of this one.

---

## 6. Handy bits

| Action | How |
| --- | --- |
| Start / stop listening | **Space** or tap the orb |
| Send typed text | type + **Enter** |
| Open Memory graph | **M** or the *Memory* button |
| Close / stop speaking | **Esc** |
| Switch Talk / Build | top-bar toggle |
| Settings (key, model, voice, bridge) | **⚙** |

Talk mode uses `claude-opus-4-8` by default (switchable to `claude-sonnet-5` / `claude-haiku-4-5` in Settings). Speech in/out uses your browser's built-in Web Speech APIs — best support is in Chrome/Edge; other browsers fall back to typing.
