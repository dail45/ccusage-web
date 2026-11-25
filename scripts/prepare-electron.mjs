// Run after `next build` with NEXT_OUTPUT=standalone.
// Completes .next/standalone so it can be run / packaged on its own.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const standalone = path.join(root, ".next", "standalone");

function fail(msg) {
  console.error(`[prepare-electron] ERROR: ${msg}`);
  process.exit(1);
}

function copyDir(from, to) {
  if (!existsSync(from)) fail(`Missing source directory: ${from}`);
  rmSync(to, { recursive: true, force: true });
  mkdirSync(path.dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
  console.log(`[prepare-electron] copied ${path.relative(root, from)} -> ${path.relative(root, to)}`);
}

if (!existsSync(path.join(standalone, "server.js"))) {
  fail(
    `${path.join(standalone, "server.js")} not found. ` +
      "Run `next build` with NEXT_OUTPUT=standalone first (npm run electron:build-next).",
  );
}

// public/ and .next/static are not copied by Next's standalone output.
copyDir(path.join(root, "public"), path.join(standalone, "public"));
copyDir(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"));

// Native ccusage binary (not statically traceable).
const pkgName = `ccusage-${process.platform}-${process.arch}`;
const exe = process.platform === "win32" ? "ccusage.exe" : "ccusage";
const binPath = path.join(standalone, "node_modules", "@ccusage", pkgName, "bin", exe);

if (existsSync(binPath)) {
  console.log(`[prepare-electron] native ccusage binary present: ${path.relative(root, binPath)}`);
} else {
  const srcPlatform = path.join(root, "node_modules", "@ccusage", pkgName);
  const srcWrapper = path.join(root, "node_modules", "ccusage");
  if (!existsSync(path.join(srcPlatform, "bin", exe))) {
    fail(
      `Native ccusage binary not found at ${path.join(srcPlatform, "bin", exe)}. ` +
        "Run `npm install` so the optional platform package is installed.",
    );
  }
  copyDir(srcPlatform, path.join(standalone, "node_modules", "@ccusage", pkgName));
  if (existsSync(srcWrapper)) {
    copyDir(srcWrapper, path.join(standalone, "node_modules", "ccusage"));
  }
  console.log(
    "[prepare-electron] NOTE: file tracing missed the ccusage binary; copied it manually.",
  );
  if (!existsSync(binPath)) fail(`Binary still missing after copy: ${binPath}`);
}

console.log("[prepare-electron] done.");
