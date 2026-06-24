/**
 * Host adapters — the harness running OVER an existing agent host.
 *
 * Unlike a raw-model `Provider` (which the harness drives with its own loop), a HOST is a
 * full agent CLI that runs its own loop (Codex, Claude Code, Antigravity). The harness
 * "runs over" it: it wraps the host with durable context (hydration), persistence and
 * telemetry — the cognitive layer around someone else's agent. See `runOnHost`.
 *
 * Each known host is invoked headlessly via its CLI; the prompt is fed on stdin so it
 * never has to be shell-escaped. Commands are overridable via
 * `AITL_HOST_CMD_<NAME>` (e.g. AITL_HOST_CMD_CLAUDE_CODE=/usr/local/bin/claude).
 */

import { spawn } from "node:child_process";

export interface HostResult {
  text: string;
  raw: string; // stdout+stderr, for the durable transcript
  exitCode: number;
}

export interface HostRunOpts {
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
}

export interface HostAdapter {
  readonly name: string;
  runTask(prompt: string, opts?: HostRunOpts): Promise<HostResult>;
}

export interface CliHostSpec {
  command: string;
  args: string[];
  /** How the prompt reaches the host: piped on stdin (default) or appended as an argv. */
  promptVia?: "stdin" | "arg";
  /** Run through a shell (needed on Windows to resolve `.cmd` shims). */
  shell?: boolean;
}

/** Default headless invocations for known agent hosts (override via AITL_HOST_CMD_<NAME>). */
export const HOST_SPECS: Record<string, CliHostSpec> = {
  "claude-code": { command: "claude", args: ["-p"], promptVia: "stdin" },
  codex: { command: "codex", args: ["exec", "-"], promptVia: "stdin" },
  antigravity: { command: "agy", args: ["run"], promptVia: "stdin" },
};

/** A host backed by a headless CLI invocation. */
export class CliHostAdapter implements HostAdapter {
  constructor(
    readonly name: string,
    private spec: CliHostSpec,
  ) {}

  runTask(prompt: string, opts: HostRunOpts = {}): Promise<HostResult> {
    const via = this.spec.promptVia ?? "stdin";
    const shell = this.spec.shell ?? process.platform === "win32";
    const args = via === "arg" ? [...this.spec.args, prompt] : this.spec.args;

    return new Promise<HostResult>((resolve, reject) => {
      const child = spawn(this.spec.command, args, {
        cwd: opts.cwd,
        env: { ...process.env, ...opts.env },
        shell,
      });
      let out = "";
      let err = "";
      const timer =
        opts.timeoutMs && opts.timeoutMs > 0
          ? setTimeout(() => child.kill("SIGKILL"), opts.timeoutMs)
          : null;
      child.stdout.on("data", (d) => {
        out += d;
      });
      child.stderr.on("data", (d) => {
        err += d;
      });
      child.on("error", (e) => {
        if (timer) clearTimeout(timer);
        reject(e);
      });
      child.on("close", (code) => {
        if (timer) clearTimeout(timer);
        resolve({ text: out.trim(), raw: `${out}${err}`, exitCode: code ?? -1 });
      });
      if (via === "stdin") {
        child.stdin.write(prompt);
        child.stdin.end();
      }
    });
  }
}

/** Resolve a known host by name, honoring an `AITL_HOST_CMD_<NAME>` command override. */
export function getHost(name: string): HostAdapter {
  const spec = HOST_SPECS[name];
  if (!spec) {
    throw new Error(`Unknown host '${name}'. Known hosts: ${Object.keys(HOST_SPECS).join(", ")}.`);
  }
  const override = process.env[`AITL_HOST_CMD_${name.toUpperCase().replace(/-/g, "_")}`];
  return new CliHostAdapter(name, override ? { ...spec, command: override } : spec);
}
