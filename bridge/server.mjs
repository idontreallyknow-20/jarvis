// ============================================================================
// JARVIS · Build bridge
// ----------------------------------------------------------------------------
// A tiny local server that lets the hosted JARVIS orb run Claude Code headless
// against a project directory on THIS machine. Zero external dependencies —
// just Node's built-in `http` + `child_process`.
//
//   POST /build   { "prompt": "add a subscribe section" }
//     -> runs:  claude -p "ultrathink <prompt>" --model claude-opus-5 \
//                       --permission-mode acceptEdits --output-format json \
//                       --allowedTools "Read,Edit,Write"
//     -> returns { summary, result, raw }
//
// ⚠️  SECURITY — READ THIS ⚠️
//   This process runs an AI agent that can READ and EDIT files under your own
//   user account and credentials. NEVER expose it to the public internet, put
//   it behind a tunnel, or run it on a shared box. It binds to 127.0.0.1 on
//   purpose. Your hosted orb page can still reach it because the fetch happens
//   from YOUR browser, on YOUR machine — the request never leaves localhost.
//   Keep PROJECT_DIR inside a git repo so every change can be reviewed/reverted.
//
//   Only pages from ALLOWED_ORIGINS may call it (localhost + the hosted orb by
//   default), and the Host header must be localhost, so a random website you
//   visit can't drive the agent through your browser.
//
//   Run it:   node bridge/server.mjs
// ============================================================================

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// ─── CONFIG ─────────────────────────────────────────────────────────────────
const HOST        = "127.0.0.1";                 // localhost ONLY — do not change to 0.0.0.0
const PORT        = Number(process.env.PORT) || 8787;
const PROJECT_DIR = resolve(process.env.PROJECT_DIR || process.cwd()); // where Claude Code edits
const MODEL       = process.env.JARVIS_MODEL || "claude-opus-5"; // falls back to "opus" if this string errors
const RUN_TIMEOUT = 5 * 60 * 1000;               // 5 minutes per build, then we kill it

// Web pages allowed to call the bridge from your browser. Any localhost port is
// always allowed; add your own hosted copy with ALLOWED_ORIGINS="https://a.com,https://b.com".
const ALLOWED_ORIGINS = new Set([
  "https://jarvis-joseph-leung.vercel.app",
  ...(process.env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim().replace(/\/+$/, "")).filter(Boolean),
]);
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const LOCAL_HOST   = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const originAllowed = (o) => !o || LOCAL_ORIGIN.test(o) || ALLOWED_ORIGINS.has(o); // no Origin = curl / scripts
const MODEL_NAME = /^[a-z0-9][a-z0-9.\-]{1,63}$/;  // model ids like claude-opus-5; never a --flag

// Tools Claude Code is allowed to use. Read/Edit/Write are safe file ops.
//
// ⚠️  To let JARVIS RUN COMMANDS (npm, git, build scripts, etc.) add "Bash".
//     This lets the agent execute shell commands on your machine. Only do this
//     for a trusted project inside a git repo, and never with the bridge exposed.
//     Flip the line below to enable it:
const ALLOWED_TOOLS = "Read,Edit,Write";         // safe default
// const ALLOWED_TOOLS = "Read,Edit,Write,Bash";  // ⚠️  command execution enabled
// ─────────────────────────────────────────────────────────────────────────────

// CORS headers echo back only an allowed origin. Allow-Private-Network lets
// Chrome's private-network preflight through when the orb is served over HTTPS.
const cors = (origin) => (origin && originAllowed(origin) ? {
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Private-Network": "true",
  "Vary": "Origin",
} : {});

function json(res, code, obj) {
  res.writeHead(code, { "content-type": "application/json", ...cors(res.req.headers.origin) });
  res.end(JSON.stringify(obj));
}

// JARVIS's spoken persona for Talk mode (replaces the default coding system prompt).
const TALK_SYSTEM =
  "You are JARVIS, a witty, precise personal AI assistant in the spirit of Tony Stark's assistant. " +
  "You are in a spoken voice conversation, so keep replies concise (1-4 sentences), natural and lightly urbane. " +
  "Address the user as 'sir' occasionally but sparingly. Reply in plain spoken prose only — no markdown, " +
  "lists, code, or emoji. Do not use any tools; simply answer from what you know.";

const summarize = (r = "") => r.split("\n").filter(Boolean).slice(-4).join(" ").slice(0, 600) || "Done.";

// Low-level: run `claude` with an arbitrary argv, resolve the parsed result.
function runClaudeArgs(args, label) {
  return new Promise((done) => {
    const shown = args.map(a => (a.includes(" ") ? `"${a.length > 64 ? a.slice(0, 61) + "…" : a}"` : a)).join(" ");
    console.log(`\n\x1b[36m▸ ${label}\x1b[0m claude ${shown}`);
    console.log(`  \x1b[2mcwd: ${PROJECT_DIR}\x1b[0m`);

    let out = "", err = "";
    const child = spawn("claude", args, { cwd: PROJECT_DIR, env: process.env });

    const killer = setTimeout(() => {
      child.kill("SIGKILL");
      done({ ok: false, error: `Timed out after ${RUN_TIMEOUT / 1000}s` });
    }, RUN_TIMEOUT);

    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));

    child.on("error", (e) => {
      clearTimeout(killer);
      done({ ok: false, spawnError: true, error: e.code === "ENOENT"
        ? "`claude` CLI not found on PATH. Install Claude Code and log in with your Claude subscription first."
        : String(e.message) });
    });

    child.on("close", (code) => {
      clearTimeout(killer);
      // --output-format json prints a single JSON object with a `result` field.
      let parsed = null;
      try { parsed = JSON.parse(out); } catch { /* not json (e.g. an error) */ }

      if (parsed && (parsed.result != null || parsed.text != null)) {
        const result = parsed.result || parsed.text || "";
        console.log(`  \x1b[32m✓ done\x1b[0m ${String(result).slice(0, 120)}${result.length > 120 ? "…" : ""}`);
        done({ ok: true, result, raw: parsed });
      } else {
        const msg = (err || out || `exit ${code}`).trim().slice(0, 600);
        console.log(`  \x1b[31m✗ failed\x1b[0m ${msg.slice(0, 160)}`);
        done({ ok: false, error: msg, exitCode: code });
      }
    });
  });
}

// Build mode: let Claude Code edit files with maximum thinking.
const buildArgs = (prompt, model) => ([
  "-p", `ultrathink ${prompt}`,                 // prepend ultrathink → max reasoning
  "--model", model,
  "--permission-mode", "acceptEdits",
  "--output-format", "json",
  "--allowedTools", ALLOWED_TOOLS,
]);

// Talk mode: a plain spoken conversation — no file tools, no ultrathink.
const talkArgs = (composed, model) => ([
  "-p", composed,
  "--model", model,
  "--system-prompt", TALK_SYSTEM,
  "--allowedTools", "",                         // no tools → pure conversation, never touches files
  "--output-format", "json",
]);

// Run, and if the model string is rejected, retry with the "opus" alias.
async function runWithFallback(makeArgs, model, label) {
  let r = await runClaudeArgs(makeArgs(model), label);
  if (!r.ok && !r.spawnError && /model|not.?found|invalid/i.test(r.error || "")) {
    console.log("  \x1b[33m↻ retrying with --model opus\x1b[0m");
    r = await runClaudeArgs(makeArgs("opus"), label);
  }
  return r;
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  // Reject DNS-rebinding (Host isn't localhost) and pages that aren't on the allowlist.
  if (!LOCAL_HOST.test(req.headers.host || "")) return json(res, 403, { error: "Bridge only answers on localhost." });
  if (!originAllowed(origin)) {
    console.log(`  \x1b[33m⊘ blocked request from ${origin}\x1b[0m (add it to ALLOWED_ORIGINS if it's yours)`);
    return json(res, 403, { error: `Origin ${origin} is not allowed. Start the bridge with ALLOWED_ORIGINS=${origin} to permit it.` });
  }
  if (req.method === "OPTIONS") { res.writeHead(204, cors(origin)); return res.end(); }

  if (req.method === "GET" && req.url === "/health") {
    return json(res, 200, { ok: true, project: PROJECT_DIR, model: MODEL, tools: ALLOWED_TOOLS, endpoints: ["/talk", "/build"] });
  }

  const readBody = (cb) => {
    let raw = "";
    req.on("data", (c) => { raw += c; if (raw.length > 1e6) { json(res, 413, { error: "Body too large" }); req.destroy(); } });
    req.on("end", () => { let o; try { o = JSON.parse(raw || "{}"); } catch { return json(res, 400, { error: "Bad JSON body" }); } cb(o); });
  };

  // Talk mode — a spoken conversation powered by your Claude subscription (no API key).
  if (req.method === "POST" && req.url === "/talk") {
    return readBody(async (o) => {
      const prompt = (o.prompt || "").trim();
      if (!prompt) return json(res, 400, { error: "Missing 'prompt'." });
      const model = MODEL_NAME.test(o.model || "") ? o.model : MODEL;
      const transcript = (Array.isArray(o.history) ? o.history : []).slice(-12)
        .map(m => `${m.role === "user" ? "User" : "JARVIS"}: ${m.content}`).join("\n");
      const composed = (transcript ? transcript + "\n" : "") + "User: " + prompt + "\nJARVIS:";
      const r = await runWithFallback((m) => talkArgs(composed, m), model, "talk");
      return json(res, r.ok ? 200 : 500, r.ok ? { ok: true, reply: r.result } : r);
    });
  }

  // Build mode — Claude Code edits files in PROJECT_DIR.
  if (req.method === "POST" && req.url === "/build") {
    return readBody(async (o) => {
      const prompt = (o.prompt || "").trim();
      if (!prompt) return json(res, 400, { error: "Missing 'prompt'." });
      const r = await runWithFallback((m) => buildArgs(prompt, m), MODEL, "build");
      return json(res, r.ok ? 200 : 500, r.ok ? { ok: true, summary: summarize(r.result), result: r.result, raw: r.raw } : r);
    });
  }

  json(res, 404, { error: "Not found. Use POST /talk or POST /build." });
});

server.listen(PORT, HOST, () => {
  if (!existsSync(PROJECT_DIR)) console.warn(`\x1b[31m! PROJECT_DIR does not exist: ${PROJECT_DIR}\x1b[0m`);
  console.log(`\x1b[36m
      ██  █████  ██████  ██    ██ ██ ███████
      ██ ██   ██ ██   ██ ██    ██ ██ ██
      ██ ███████ ██████  ██    ██ ██ ███████
 ██   ██ ██   ██ ██   ██  ██  ██  ██      ██
  █████  ██   ██ ██   ██   ████   ██ ███████  build bridge\x1b[0m
`);
  console.log(`  listening   http://${HOST}:${PORT}`);
  console.log(`  project     ${PROJECT_DIR}`);
  console.log(`  model       ${MODEL}   build tools: ${ALLOWED_TOOLS}`);
  console.log(`  origins     localhost, ${[...ALLOWED_ORIGINS].join(", ")}`);
  console.log(`  \x1b[2mPOST /talk  {"prompt":"…"}   → conversation (no file edits)\x1b[0m`);
  console.log(`  \x1b[2mPOST /build {"prompt":"…"}   → Claude Code edits files\x1b[0m`);
  console.log(`  \x1b[32m✓  uses your Claude subscription via the CLI — no API key needed.\x1b[0m`);
  console.log(`  \x1b[33m⚠  localhost only — never expose this to the internet.\x1b[0m\n`);
});
