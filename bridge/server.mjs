// ============================================================================
// JARVIS · Build bridge
// ----------------------------------------------------------------------------
// A tiny local server that lets the hosted JARVIS orb run Claude Code headless
// against a project directory on THIS machine. Zero external dependencies —
// just Node's built-in `http` + `child_process`.
//
//   POST /build   { "prompt": "add a subscribe section" }
//     -> runs:  claude -p "ultrathink <prompt>" --model claude-opus-4-8 \
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
//   Run it:   node bridge/server.mjs
// ============================================================================

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// ─── CONFIG ─────────────────────────────────────────────────────────────────
const HOST        = "127.0.0.1";                 // localhost ONLY — do not change to 0.0.0.0
const PORT        = 8787;
const PROJECT_DIR = resolve(process.env.PROJECT_DIR || process.cwd()); // where Claude Code edits
const MODEL       = "claude-opus-4-8";           // falls back to "opus" if this string errors
const RUN_TIMEOUT = 5 * 60 * 1000;               // 5 minutes per build, then we kill it

// Tools Claude Code is allowed to use. Read/Edit/Write are safe file ops.
//
// ⚠️  To let JARVIS RUN COMMANDS (npm, git, build scripts, etc.) add "Bash".
//     This lets the agent execute shell commands on your machine. Only do this
//     for a trusted project inside a git repo, and never with the bridge exposed.
//     Flip the line below to enable it:
const ALLOWED_TOOLS = "Read,Edit,Write";         // safe default
// const ALLOWED_TOOLS = "Read,Edit,Write,Bash";  // ⚠️  command execution enabled
// ─────────────────────────────────────────────────────────────────────────────

const CORS = {
  "Access-Control-Allow-Origin": "*",            // your own hosted orb calls this from your browser
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

function json(res, code, obj) {
  res.writeHead(code, { "content-type": "application/json", ...CORS });
  res.end(JSON.stringify(obj));
}

// Run one `claude -p ...` build. Resolves with the parsed JSON result.
function runClaude(prompt, model) {
  return new Promise((done) => {
    const args = [
      "-p", `ultrathink ${prompt}`,              // prepend ultrathink → max reasoning
      "--model", model,
      "--permission-mode", "acceptEdits",
      "--output-format", "json",
      "--allowedTools", ALLOWED_TOOLS,
    ];

    console.log(`\n\x1b[36m▸ claude\x1b[0m ${args.map(a => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`);
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
        ? "`claude` CLI not found on PATH. Install Claude Code and log in first."
        : String(e.message) });
    });

    child.on("close", (code) => {
      clearTimeout(killer);
      // --output-format json prints a single JSON object with a `result` field.
      let parsed = null;
      try { parsed = JSON.parse(out); } catch { /* not json (e.g. an error) */ }

      if (parsed) {
        const result = parsed.result || parsed.text || "";
        const summary = result.split("\n").filter(Boolean).slice(-4).join(" ").slice(0, 600) || "Done.";
        console.log(`  \x1b[32m✓ done\x1b[0m ${summary.slice(0, 120)}${summary.length > 120 ? "…" : ""}`);
        done({ ok: true, summary, result, raw: parsed });
      } else {
        const msg = (err || out || `exit ${code}`).trim().slice(0, 600);
        console.log(`  \x1b[31m✗ failed\x1b[0m ${msg.slice(0, 160)}`);
        done({ ok: false, error: msg, exitCode: code });
      }
    });
  });
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, CORS); return res.end(); }

  if (req.method === "GET" && req.url === "/health") {
    return json(res, 200, { ok: true, project: PROJECT_DIR, model: MODEL, tools: ALLOWED_TOOLS });
  }

  if (req.method === "POST" && req.url === "/build") {
    let raw = "";
    req.on("data", (c) => { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on("end", async () => {
      let prompt = "";
      try { prompt = (JSON.parse(raw).prompt || "").trim(); } catch { return json(res, 400, { error: "Bad JSON body" }); }
      if (!prompt) return json(res, 400, { error: "Missing 'prompt'." });

      // primary attempt with the full model string; fall back to the "opus" alias
      let r = await runClaude(prompt, MODEL);
      if (!r.ok && !r.spawnError && /model|not.?found|invalid/i.test(r.error || "")) {
        console.log("  \x1b[33m↻ retrying with --model opus\x1b[0m");
        r = await runClaude(prompt, "opus");
      }
      return json(res, r.ok ? 200 : 500, r);
    });
    return;
  }

  json(res, 404, { error: "Not found. Use POST /build." });
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
  console.log(`  model       ${MODEL}   tools: ${ALLOWED_TOOLS}`);
  console.log(`  \x1b[2mPOST /build {"prompt":"…"}   ·   GET /health\x1b[0m`);
  console.log(`  \x1b[33m⚠  localhost only — never expose this to the internet.\x1b[0m\n`);
});
