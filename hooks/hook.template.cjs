#!/usr/bin/env node
"use strict";

// LLM Pets hook. Fail-open: write an event file and exit 0.
// Generated from the root hooks definitions and shared by every renderer.

const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const MAX_INPUT_BYTES = 1024 * 1024;
const EVENT_ALIASES = /*__EVENT_ALIASES__*/;
const EVENT_RETENTION_MS = 10 * 60 * 1000;
const RENDERER_NAMES = ["kitty", "sixel", "foot", "mlterm", "wezterm", "ghostty"];

let size = 0;
const chunks = [];
process.stdin.on("data", (chunk) => {
  size += chunk.length;
  if (size > MAX_INPUT_BYTES) {
    process.stdin.destroy();
    return;
  }
  chunks.push(chunk);
});

process.stdin.on("end", () => {
  try {
    if (size > MAX_INPUT_BYTES) return;
    const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const eventName = EVENT_ALIASES[stringValue(input.hook_event_name, 64)]
      || EVENT_ALIASES[stringValue(input.hookEventName, 64)];
    const sessionId = stringValue(input.conversation_id, 256)
      || stringValue(input.session_id, 256);
    const cwd = stringValue(input.cwd, 8192)
      || firstWorkspaceRoot(input.workspace_roots);
    if (!eventName || !sessionId || !cwd) {
      return;
    }

    const eventDirectory = eventDirectoryPath();
    fs.mkdirSync(eventDirectory, { recursive: true });

    const event = {
      version: 1,
      eventName,
      sessionId,
      cwd,
      occurredAt: Date.now()
    };
    const tty = controllingTty();
    if (tty) event.tty = tty;
    const term = stringValue(process.env.TERM, 256);
    if (term) event.term = term;
    const turnId = stringValue(input.turn_id, 256);
    if (turnId) event.turnId = turnId;

    writeEvent(eventDirectory, event);
    pruneEvents(eventDirectory);
    maybeStartRenderer(tty, term);
  } catch {
    // Fail open: never block, deny, or rewrite agent tool calls.
  }
});

function stateHome() {
  const configured = process.env.XDG_STATE_HOME?.trim();
  return configured ? path.resolve(configured) : path.join(os.homedir(), ".local", "state");
}

function eventDirectoryPath() {
  const configured = process.env.LLM_PETS_EVENT_DIR?.trim()
    || process.env.CURSOR_PET_EVENT_DIR?.trim();
  if (configured) return path.resolve(configured);
  return path.join(stateHome(), "llm-pets", "events");
}

function writeEvent(eventDirectory, event) {
  const stem = `${Date.now()}-${process.pid}-${crypto.randomBytes(8).toString("hex")}`;
  const temporaryPath = path.join(eventDirectory, `${stem}.tmp`);
  const finalPath = path.join(eventDirectory, `${stem}.json`);
  fs.writeFileSync(temporaryPath, JSON.stringify(event), { encoding: "utf8", flag: "wx" });
  fs.renameSync(temporaryPath, finalPath);
}

function pruneEvents(eventDirectory) {
  if (Math.random() > 0.05) return;
  const cutoff = Date.now() - EVENT_RETENTION_MS;
  try {
    for (const name of fs.readdirSync(eventDirectory)) {
      const stem = Number.parseInt(name, 10);
      if (!Number.isInteger(stem) || stem >= cutoff) continue;
      try {
        fs.unlinkSync(path.join(eventDirectory, name));
      } catch {
        // Another hook process may have removed it already.
      }
    }
  } catch {
    // Pruning is best effort; never fail the hook over it.
  }
}

function stringValue(value, maximumLength) {
  return typeof value === "string" && value.length > 0 && value.length <= maximumLength
    ? value
    : undefined;
}

function firstWorkspaceRoot(value) {
  return Array.isArray(value) ? stringValue(value[0], 8192) : undefined;
}

function controllingTty() {
  let pid = process.pid;
  const visited = new Set();
  while (pid > 1 && !visited.has(pid)) {
    visited.add(pid);
    for (const fd of [0, 1, 2]) {
      try {
        const target = fs.readlinkSync(`/proc/${pid}/fd/${fd}`);
        if (/^\/dev\/(pts\/\d+|tty\d+)$/.test(target)) return target;
      } catch {
        // Continue through the process ancestry.
      }
    }
    pid = parentPid(pid);
  }

  for (const name of ["GPG_TTY", "SSH_TTY"]) {
    const candidate = stringValue(process.env[name], 256);
    if (
      candidate &&
      /^\/dev\/(pts\/\d+|tty\d+)$/.test(candidate) &&
      fs.existsSync(candidate)
    ) {
      return candidate;
    }
  }
  return undefined;
}

function parentPid(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    const separator = stat.lastIndexOf(") ");
    if (separator < 0) return 0;
    const fields = stat.slice(separator + 2).split(" ");
    const parent = Number.parseInt(fields[1], 10);
    return Number.isInteger(parent) ? parent : 0;
  } catch {
    return 0;
  }
}

function rendererPath() {
  const configured = process.env.LLM_PETS_BIN?.trim();
  if (configured) return path.resolve(configured);
  return path.join(os.homedir(), ".local", "bin", "llm-pet");
}

function maybeStartRenderer(tty, term) {
  const renderer = rendererPath();
  if (!fs.existsSync(renderer)) return;

  if (process.env.TMUX) {
    const child = spawn(renderer, ["pane", "--watch"], {
      detached: true,
      env: process.env,
      stdio: "ignore"
    });
    child.on("error", () => {});
    child.unref();
    return;
  }

  if (!tty) return;
  const hint = `${term || ""} ${process.env.TERM_PROGRAM || ""}`;
  if (RENDERER_NAMES.some((name) => hint.toLowerCase().includes(name))) return;

  const runtimeDirectory = path.join(stateHome(), "llm-pets", "runtime");
  fs.mkdirSync(runtimeDirectory, { recursive: true });
  const key = crypto.createHash("sha256").update(tty).digest("hex").slice(0, 16);
  const heartbeat = path.join(runtimeDirectory, `${key}.heartbeat`);
  try {
    if (Date.now() - fs.statSync(heartbeat).mtimeMs < 3000) return;
  } catch {
    // A missing or stale heartbeat means the renderer should be started.
  }

  const child = spawn(renderer, ["run", "--tty", tty], {
    detached: true,
    env: process.env,
    stdio: "ignore"
  });
  child.on("error", () => {});
  child.unref();
}
