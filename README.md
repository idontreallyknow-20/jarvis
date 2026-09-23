# JARVIS

A holographic AI voice assistant with a memory you can see. Talk to it, hear it answer, and watch every exchange become a glowing node in a live memory graph.

**Live:** https://jarvis-joseph-leung.vercel.app · **About:** https://jarvis-joseph-leung.vercel.app/about

- **Talk mode:** speak or type, JARVIS answers out loud. It thinks with your Claude Pro/Max subscription through a small local bridge (no API key), or with an Anthropic API key if you have one.
- **Build mode:** say a change and the bridge runs Claude Code headless to edit files in a project on your machine.
- **Memory core:** messages are saved in your browser and drawn on a canvas. Related memories connect with lines. Press **M** to explore, search or purge it.

No build step, no frameworks, no dependencies.

```
public/          static site (deploys as-is)
  index.html     the orb UI + memory graph
  about.html     project page
  404.html
bridge/
  server.mjs     local bridge for Talk and Build (run on your machine)
```

## Run it

Needs Node 18+ and [Claude Code](https://claude.com/claude-code) logged in with your Claude subscription.

```bash
node bridge/server.mjs                     # start JARVIS's brain on http://127.0.0.1:8787
npx serve public                           # or: cd public && python3 -m http.server 5173
```

Open the page, press **Space** (or tap the orb) and talk. Chrome and Edge have the best speech support; other browsers can type.

Bridge options (all optional environment variables):

| Variable | Default | What it does |
| --- | --- | --- |
| `PROJECT_DIR` | current directory | Folder Build mode edits. Keep it in git. |
| `PORT` | `8787` | Bridge port |
| `JARVIS_MODEL` | `claude-opus-5` | Model for Build mode (falls back to `opus`) |
| `ALLOWED_ORIGINS` | none | Extra sites allowed to call the bridge, comma separated, e.g. your own hosted copy |

Prefer an API key? Open **⚙ Settings**, set **Talk brain** to *Anthropic API key* and paste a key. Talk mode then calls the API straight from your browser and doesn't need the bridge.

## Deploy

`public/` is a static site. On Vercel, set the project **Root Directory** to `public` (no build command). `public/vercel.json` adds clean URLs and security headers.

The hosted page can still reach your local bridge because the request comes from your own browser on your own machine.

## Security

- The bridge binds to `127.0.0.1`, rejects any Host that isn't localhost, and only answers pages from localhost, the hosted site, or `ALLOWED_ORIGINS`. Other websites can't drive it through your browser. Never expose it to the internet.
- Build mode can only Read/Edit/Write files. To allow shell commands, flip the marked `ALLOWED_TOOLS` line in `bridge/server.mjs`, and only for a trusted repo.
- An API key (if you use one) lives only in your browser's localStorage. Use a scoped key.

## Keys

| Action | Key |
| --- | --- |
| Start / stop listening | Space, or tap the orb |
| Memory graph | M |
| Close / stop speaking | Esc |

---

Built by [Joseph Leung](https://josephleung-site.vercel.app/).
