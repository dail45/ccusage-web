import { spawnSync } from "child_process";
import { existsSync } from "fs";
import path from "path";
import { resolveCcusageConfigPath } from "./ccusage-config";

type Command = "daily" | "monthly" | "weekly" | "session" | "blocks";

interface ResolvedCcusage {
  bin: string;
  leadArgs: string[];
  /** Spawn through a shell (needed for .cmd shims on Windows). */
  shell: boolean;
}

let cached: ResolvedCcusage | null = null;

const IS_WIN = process.platform === "win32";

/** Find the native ccusage binary shipped by the bundled `ccusage` dependency. */
function findBundledBinary(): string | null {
  const exe = IS_WIN ? "ccusage.exe" : "ccusage";
  const rel = path.join(
    "node_modules",
    "@ccusage",
    `ccusage-${process.platform}-${process.arch}`,
    "bin",
    exe,
  );
  let dir = process.cwd();
  for (;;) {
    const candidate = path.join(dir, rel);
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function resolveCcusage(): ResolvedCcusage {
  if (cached) return cached;

  const envBin = process.env.CCUSAGE_BIN;
  if (envBin && existsSync(envBin)) {
    return (cached = { bin: envBin, leadArgs: [], shell: false });
  }

  const bundled = findBundledBinary();
  if (bundled) {
    return (cached = { bin: bundled, leadArgs: [], shell: false });
  }

  const probe = spawnSync("ccusage", ["--version"], { stdio: "ignore", shell: IS_WIN });
  if (probe.status === 0) {
    return (cached = { bin: "ccusage", leadArgs: [], shell: IS_WIN });
  }
  return (cached = { bin: "npx", leadArgs: ["ccusage@latest"], shell: IS_WIN });
}

/** Quote an argument for cmd.exe when running with `shell: true` on Windows. */
function quoteArg(arg: string): string {
  if (arg !== "" && !/[\s"&|<>^%()]/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '""')}"`;
}

export function runCcusage(command: Command, extraArgs: string[] = []): unknown {
  const { bin, leadArgs, shell } = resolveCcusage();
  const configPath = resolveCcusageConfigPath();
  const configArgs =
    !extraArgs.includes("--config") && existsSync(configPath)
      ? ["--config", configPath]
      : [];

  let args = [...leadArgs, command, "--json", ...configArgs, ...extraArgs];
  if (shell) args = args.map(quoteArg);

  // Without a shell, args are never interpreted as shell tokens. A shell is only
  // used on Windows for .cmd shims (global ccusage / npx); args are internal.
  const result = spawnSync(bin, args, {
    timeout: 60_000,
    maxBuffer: 50 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: "1" },
    shell,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr?.toString() ?? `ccusage exited with code ${result.status}`);
  }
  return JSON.parse(result.stdout.toString());
}
