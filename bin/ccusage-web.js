#!/usr/bin/env node
"use strict";

const { spawnSync, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const appDir = path.join(__dirname, "..");
const port = process.env.PORT ?? "4242";

// resolve next's CLI entry relative to where npm installed it (handles hoisting)
let nextCli;
try {
  nextCli = require.resolve("next/dist/bin/next");
} catch {
  nextCli = path.join(appDir, "node_modules", ".bin", "next");
}

function open(url) {
  try {
    if (process.platform === "win32") {
      spawnSync("cmd", ["/c", "start", "", url], { stdio: "ignore" });
    } else {
      const cmd = process.platform === "darwin" ? "open" : "xdg-open";
      spawnSync(cmd, [url], { stdio: "ignore" });
    }
  } catch {}
}

const buildDir = path.join(appDir, ".next");
const needsBuild = !fs.existsSync(buildDir);

if (needsBuild) {
  console.log("Building ccusage-webui (first run — this takes ~30s)…");
  const build = spawnSync(process.execPath, [nextCli, "build"], { cwd: appDir, stdio: "inherit" });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

console.log(`\nStarting ccusage-webui on http://localhost:${port}\n`);

const server = spawn(process.execPath, [nextCli, "start", "--port", port], {
  cwd: appDir,
  env: {
    ...process.env,
    ...(process.argv[1] ? { CCUSAGE_BIN_ENTRY: process.argv[1] } : {}),
  },
  stdio: "inherit",
});

setTimeout(() => open(`http://localhost:${port}`), 1500);

process.on("SIGINT", () => server.kill("SIGINT"));
process.on("SIGTERM", () => server.kill("SIGTERM"));
