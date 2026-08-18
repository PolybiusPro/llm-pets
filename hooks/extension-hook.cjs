#!/usr/bin/env node
"use strict";

// LLM Pets hook. Fail-open: write an event file and exit 0.
// Generated from the root hook definitions for one renderer integration.

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const MAX_INPUT_BYTES = 1024 * 1024;
const EVENT_ALIASES = {
  "sessionStart": "SessionStart",
  "SessionStart": "SessionStart",
  "beforeSubmitPrompt": "UserPromptSubmit",
  "UserPromptSubmit": "UserPromptSubmit",
  "preToolUse": "PreToolUse",
  "PreToolUse": "PreToolUse",
  "postToolUse": "PostToolUse",
  "PostToolUse": "PostToolUse",
  "postToolUseFailure": "PostToolUseFailure",
  "PostToolUseFailure": "PostToolUseFailure",
  "afterAgentThought": "AfterAgentThought",
  "AfterAgentThought": "AfterAgentThought",
  "afterAgentResponse": "AfterAgentResponse",
  "AfterAgentResponse": "AfterAgentResponse",
  "permissionRequest": "PermissionRequest",
  "PermissionRequest": "PermissionRequest",
  "stop": "Stop",
  "Stop": "Stop",
  "sessionEnd": "SessionEnd",
  "SessionEnd": "SessionEnd",
  "PreCompact": "PreCompact",
  "PostCompact": "PostCompact",
  "SubagentStart": "SubagentStart",
  "SubagentStop": "SubagentStop",
  "Notification": "Notification"
};
const EVENT_RETENTION_MS = 10 * 60 * 1000;
const HOOK_KIND = "extension";
const HOOK_PROVIDERS = new Set(["cursor", "codex", "claude"]);

function handleHookInput(rawInput, provider, environment = process.env) {
  try {
    if (!HOOK_PROVIDERS.has(provider)) return;
    const text = typeof rawInput === "string" ? rawInput : JSON.stringify(rawInput);
    if (Buffer.byteLength(text, "utf8") > MAX_INPUT_BYTES) return;
    const input = JSON.parse(text);
    const eventName = EVENT_ALIASES[stringValue(input.hook_event_name, 64)]
      || EVENT_ALIASES[stringValue(input.hookEventName, 64)];
    const sessionId = stringValue(input.conversation_id, 256)
      || stringValue(input.session_id, 256);
    const cwd = stringValue(input.cwd, 8192)
      || firstWorkspaceRoot(input.workspace_roots);
    if (!eventName || !sessionId || !cwd) {
      return;
    }

    const eventDirectory = eventDirectoryPath(provider, environment);
    if (!eventDirectory) return;
    fs.mkdirSync(eventDirectory, { recursive: true });

    const event = {
      version: 2,
      provider,
      eventName,
      sessionId,
      cwd,
      occurredAt: Date.now()
    };
    const tty = controllingTty();
    if (tty) event.tty = tty;
    const term = stringValue(environment.TERM, 256);
    if (term) event.term = term;
    const turnId = stringValue(input.turn_id, 256);
    if (turnId) event.turnId = turnId;

    writeEvent(eventDirectory, event);
    pruneEvents(eventDirectory);
  } catch {
    // Fail open: never block, deny, or rewrite agent tool calls.
  }
}

if (require.main === module) {
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
    if (size <= MAX_INPUT_BYTES) {
      handleHookInput(Buffer.concat(chunks).toString("utf8"), process.argv[2]);
    }
  });
}

module.exports = { handleHookInput };

function stateHome(environment) {
  const configured = environment.XDG_STATE_HOME?.trim();
  return configured ? path.resolve(configured) : path.join(os.homedir(), ".local", "state");
}

function eventDirectoryPath(provider, environment) {
  if (HOOK_KIND === "terminal") {
    const configured = environment.LLM_PETS_EVENT_DIR?.trim();
    return configured ? path.resolve(configured) : undefined;
  }
  const configured = environment.LLM_PETS_EXTENSION_EVENT_DIR?.trim()
    || environment.CURSOR_PET_EVENT_DIR?.trim();
  const root = configured
    ? path.resolve(configured)
    : path.join(stateHome(environment), "llm-pets", "extension-events");
  return path.join(root, provider);
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
