import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync, writeSync } from "node:fs";
import { stdin, stdout } from "node:process";
import path from "node:path";
import { cacheRoot } from "./paths.js";
import { flushInput, terminalSize } from "./posix.js";

export const CELL_WIDTH_PX = 8;
export const CELL_HEIGHT_PX = 15;
export const BOTTOM_MARGIN_ROWS = 3;

export const SYNC_BEGIN = Buffer.from("\x1b[?2026h");
export const SYNC_END = Buffer.from("\x1b[?2026l");
export const SAVE_CURSOR = Buffer.from("\x1b7");
export const RESTORE_CURSOR = Buffer.from("\x1b8");
export const SGR_RESET = Buffer.from("\x1b[0m");

const KITTY_ENV_HINTS = ["KITTY_WINDOW_ID", "GHOSTTY_RESOURCES_DIR", "WEZTERM_EXECUTABLE"] as const;
const KITTY_TERM_PATTERN = /kitty|ghostty|wezterm/i;

export function region(
  ttyFd: number,
  widthPx: number,
  heightPx: number
): [number, number, number, number] | undefined {
  const terminal = terminalSize(ttyFd);
  const imageColumns = Math.ceil(widthPx / CELL_WIDTH_PX);
  const imageRows = Math.ceil(heightPx / CELL_HEIGHT_PX);
  if (terminal.columns < imageColumns || terminal.rows <= imageRows + BOTTOM_MARGIN_ROWS) {
    return undefined;
  }
  const column = Math.max(1, terminal.columns - imageColumns + 1);
  const row = Math.max(1, terminal.rows - imageRows - BOTTOM_MARGIN_ROWS + 1);
  return [row, column, imageRows, imageColumns];
}

export function clearSequence(row: number, column: number, imageRows: number, imageColumns: number): Buffer {
  const parts = [SGR_RESET];
  for (let offset = 0; offset < imageRows; offset += 1) {
    parts.push(Buffer.from(`\x1b[${row + offset};${column}H\x1b[${imageColumns}X`));
  }
  return Buffer.concat(parts);
}

export function writeAll(ttyFd: number, payload: Buffer): void {
  let offset = 0;
  while (offset < payload.length) {
    const n = writeSync(ttyFd, payload.subarray(offset));
    if (n <= 0) {
      throw new Error("terminal write returned no bytes");
    }
    offset += n;
  }
}

export function terminalKey(environment: NodeJS.Dict<string> = process.env): string {
  const identity = ["TERM", "TERM_PROGRAM", "KONSOLE_VERSION", "WEZTERM_EXECUTABLE"]
    .map((name) => environment[name] ?? "")
    .join("|");
  return createHash("sha256").update(identity).digest("hex").slice(0, 16);
}

function probeCachePath(environment: NodeJS.Dict<string> = process.env): string {
  return path.join(cacheRoot(), `graphics-${terminalKey(environment)}.json`);
}

export function cachedProbe(environment: NodeJS.Dict<string> = process.env): boolean | undefined {
  try {
    const data = JSON.parse(readFileSync(probeCachePath(environment), "utf8")) as { kitty?: unknown };
    return typeof data.kitty === "boolean" ? data.kitty : undefined;
  } catch {
    return undefined;
  }
}

export function storeProbe(supported: boolean, environment: NodeJS.Dict<string> = process.env): void {
  try {
    const filePath = probeCachePath(environment);
    mkdirSync(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify({ kitty: supported }));
    renameSync(temporary, filePath);
  } catch {
    // Cache is optional.
  }
}

export async function probeKittyGraphics(timeout = 0.5): Promise<boolean | undefined> {
  if (!stdin.isTTY || !stdout.isTTY) {
    return undefined;
  }
  const query = Buffer.concat([
    Buffer.from("\x1b_Gi=4294967295,s=1,v=1,a=q,t=d,f=24;AAAA\x1b\\"),
    Buffer.from("\x1b[c")
  ]);
  const previous = stdin.isRaw;
  try {
    stdin.setRawMode(true);
    stdout.write(query);
    const reply = await readReply(stdin, timeout);
    if (reply.includes("_G")) {
      return reply.includes(";OK");
    }
    if (reply.includes("\x1b[?")) {
      return false;
    }
    return undefined;
  } catch {
    return undefined;
  } finally {
    // Whatever we didn't manage to read (a slow DA reply after we already
    // classified the graphics reply, or the whole thing after a timeout) is
    // still sitting in the kernel's input queue for this fd. Left alone, it
    // surfaces later as literal text to whichever process reads next -
    // codex's prompt, or the shell once codex exits. Discard it here instead.
    try {
      flushInput(typeof stdin.fd === "number" ? stdin.fd : 0);
    } catch {
      // Best effort; not fatal if the platform binding is unavailable.
    }
    try {
      stdin.setRawMode(previous);
    } catch {
      // Ignore restore failures.
    }
  }
}

// Drains a terminal reply asynchronously, event-driven, instead of busy-polling.
// A busy `while` loop never yields to the event loop, so it can only see bytes
// that were already buffered before it started; anything the terminal sends
// mid-probe arrives after the caller gives up and leaks into whatever reads
// the tty next. Waiting on "readable" lets libuv deliver each chunk as it lands.
export function readReply(source: NodeJS.ReadableStream, timeout: number): Promise<string> {
  return new Promise((resolve) => {
    let reply = Buffer.alloc(0);
    let timer: NodeJS.Timeout;
    const onReadable = (): void => {
      let chunk: Buffer | null;
      while ((chunk = source.read() as Buffer | null) !== null) {
        reply = Buffer.concat([reply, chunk]);
        const text = reply.toString("binary");
        if (text.includes("\x1b[?") && text.trimEnd().endsWith("c")) {
          finish();
          return;
        }
      }
    };
    const finish = (): void => {
      clearTimeout(timer);
      source.off("readable", onReadable);
      source.pause();
      resolve(reply.toString("binary"));
    };
    timer = setTimeout(finish, timeout * 1000);
    source.on("readable", onReadable);
  });
}

// Probes at most once per terminal identity: a cached answer (written by an
// earlier probe, or by the explicit `llm-pet probe` command) is trusted as-is
// instead of re-querying the tty on every invocation.
export async function ensureProbed(
  environment: NodeJS.Dict<string> = process.env,
  probe: (timeout?: number) => Promise<boolean | undefined> = probeKittyGraphics
): Promise<boolean | undefined> {
  const cached = cachedProbe(environment);
  if (cached !== undefined) {
    return cached;
  }
  const result = await probe();
  if (result !== undefined) {
    storeProbe(result, environment);
  }
  return result;
}

export function kittySupported(environment: NodeJS.Dict<string> = process.env): boolean {
  if (environment.TMUX) {
    return false;
  }
  const probed = cachedProbe(environment);
  if (probed !== undefined) {
    return probed;
  }
  if (KITTY_ENV_HINTS.some((name) => environment[name])) {
    return true;
  }
  if (KITTY_TERM_PATTERN.test(`${environment.TERM ?? ""} ${environment.TERM_PROGRAM ?? ""}`)) {
    return true;
  }
  const konsole = environment.KONSOLE_VERSION ?? "";
  if (/^\d+$/.test(konsole)) {
    return Number.parseInt(konsole, 10) >= 220400;
  }
  return false;
}

export function selectBackend(environment: NodeJS.Dict<string> = process.env): "kitty" | "none" {
  return kittySupported(environment) ? "kitty" : "none";
}
