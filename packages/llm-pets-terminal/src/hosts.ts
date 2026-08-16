import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export const HOST_PROCESS_NAMES = new Set(["codex", "claude"]);
const PROC = "/proc";

export function parseStat(stat: string): [string, string[]] | undefined {
  const opening = stat.indexOf("(");
  const closing = stat.lastIndexOf(")");
  if (opening < 0 || closing < opening) {
    return undefined;
  }
  return [stat.slice(opening + 1, closing), stat.slice(closing + 2).split(" ")];
}

function statFields(pid: string | number): [string, string[]] | undefined {
  try {
    return parseStat(readFileSync(path.join(PROC, String(pid), "stat"), "utf8"));
  } catch {
    return undefined;
  }
}

export function processName(pid: number): string | undefined {
  return statFields(pid)?.[0];
}

export function parentPid(pid: number): number | undefined {
  const fields = statFields(pid);
  if (!fields || fields[1].length < 2) {
    return undefined;
  }
  const value = Number.parseInt(fields[1][1] ?? "", 10);
  return Number.isInteger(value) ? value : undefined;
}

export function isAgent(pid: number): boolean {
  const name = processName(pid);
  if (name && HOST_PROCESS_NAMES.has(name)) {
    return true;
  }
  try {
    const command = readFileSync(path.join(PROC, String(pid), "cmdline"));
    const first = command.subarray(0, Math.max(0, command.indexOf(0))).toString();
    return Boolean(first) && HOST_PROCESS_NAMES.has(path.basename(first));
  } catch {
    return false;
  }
}

export function hostRunning(ttyRdev: number): boolean {
  let entries: string[];
  try {
    entries = readdirSync(PROC);
  } catch {
    return false;
  }
  for (const name of entries) {
    if (!/^\d+$/.test(name)) {
      continue;
    }
    const fields = statFields(name);
    if (!fields) {
      continue;
    }
    const [process, rest] = fields;
    if (!HOST_PROCESS_NAMES.has(process)) {
      continue;
    }
    if (rest.length > 4 && rest[4] === String(ttyRdev)) {
      return true;
    }
  }
  return false;
}

export function agentInProcessTree(rootPid: number): boolean {
  const children = new Map<number, number[]>();
  let entries: string[];
  try {
    entries = readdirSync(PROC);
  } catch {
    return false;
  }
  for (const name of entries) {
    if (!/^\d+$/.test(name)) {
      continue;
    }
    const pid = Number.parseInt(name, 10);
    const parent = parentPid(pid);
    if (parent !== undefined) {
      const list = children.get(parent) ?? [];
      list.push(pid);
      children.set(parent, list);
    }
  }
  const pending = [rootPid];
  const visited = new Set<number>();
  while (pending.length > 0) {
    const pid = pending.pop() as number;
    if (visited.has(pid)) {
      continue;
    }
    visited.add(pid);
    if (isAgent(pid)) {
      return true;
    }
    pending.push(...(children.get(pid) ?? []));
  }
  return false;
}
