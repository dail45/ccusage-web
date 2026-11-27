import fs from "node:fs";
import path from "node:path";

export type InstallMethodId =
  | "electron-nsis"
  | "electron-portable"
  | "electron-mac"
  | "electron-appimage"
  | "electron-dev"
  | "bun-global"
  | "bunx"
  | "npm-global"
  | "npx"
  | "pnpm-global"
  | "pnpm-dlx"
  | "yarn-global"
  | "yarn-dlx"
  | "volta"
  | "mise"
  | "git-source"
  | "unknown";

export interface InstallMethodInfo {
  id: InstallMethodId;
  label: string;
  primarySource: "github" | "npm";
  canSelfUpdate: boolean;
  updateCommand: string;
}

const ELECTRON_METHODS: Record<string, InstallMethodInfo> = {
  "electron-nsis": {
    id: "electron-nsis",
    label: "Desktop · Windows Installer",
    primarySource: "github",
    canSelfUpdate: false,
    updateCommand: "",
  },
  "electron-portable": {
    id: "electron-portable",
    label: "Desktop · Portable",
    primarySource: "github",
    canSelfUpdate: false,
    updateCommand: "",
  },
  "electron-mac": {
    id: "electron-mac",
    label: "Desktop · macOS",
    primarySource: "github",
    canSelfUpdate: false,
    updateCommand: "",
  },
  "electron-appimage": {
    id: "electron-appimage",
    label: "Desktop · AppImage",
    primarySource: "github",
    canSelfUpdate: false,
    updateCommand: "",
  },
  "electron-dev": {
    id: "electron-dev",
    label: "Desktop · Dev",
    primarySource: "github",
    canSelfUpdate: false,
    updateCommand: "git pull && npm install",
  },
};

export function detectInstallMethod(): InstallMethodInfo {
  const electronMethod = process.env.CCUSAGE_INSTALL_METHOD;
  if (electronMethod && electronMethod in ELECTRON_METHODS) {
    return ELECTRON_METHODS[electronMethod];
  }

  const cwd = process.cwd();
  const normCwd = cwd.replace(/\\/g, "/").toLowerCase();
  const normBin = (process.env.CCUSAGE_BIN_ENTRY ?? "").replace(/\\/g, "/").toLowerCase();
  const ua = (process.env.npm_config_user_agent ?? "").toLowerCase();
  const execPath = (process.env.npm_execpath ?? "").replace(/\\/g, "/").toLowerCase();
  const pathHint = `${normCwd} ${normBin}`;
  const isBunRuntime =
    Boolean((process.versions as Record<string, string | undefined>).bun) ||
    ua.startsWith("bun/") ||
    execPath.includes("bun");

  if (pathHint.includes("/.volta/")) {
    return {
      id: "volta",
      label: "Web UI · Volta",
      primarySource: "npm",
      canSelfUpdate: true,
      updateCommand: "volta install ccusage-webui@latest",
    };
  }

  if (pathHint.includes("/mise/installs/")) {
    return {
      id: "mise",
      label: "Web UI · mise",
      primarySource: "npm",
      canSelfUpdate: true,
      updateCommand: "mise use -g npm:ccusage-webui@latest",
    };
  }

  if (pathHint.includes("/.bun/install/cache/") || pathHint.includes("/bunx-")) {
    return {
      id: "bunx",
      label: "Web UI · bunx",
      primarySource: "npm",
      canSelfUpdate: false,
      updateCommand: "bunx ccusage-webui@latest",
    };
  }

  if (pathHint.includes("/pnpm/") && pathHint.includes("/dlx/")) {
    return {
      id: "pnpm-dlx",
      label: "Web UI · pnpm dlx",
      primarySource: "npm",
      canSelfUpdate: false,
      updateCommand: "pnpm dlx ccusage-webui@latest",
    };
  }

  if (pathHint.includes("/xfs-") && (ua.startsWith("yarn/") || execPath.includes("yarn"))) {
    return {
      id: "yarn-dlx",
      label: "Web UI · yarn dlx",
      primarySource: "npm",
      canSelfUpdate: false,
      updateCommand: "yarn dlx ccusage-webui@latest",
    };
  }

  if (pathHint.includes("/_npx/") || process.env.npm_command === "exec") {
    return {
      id: isBunRuntime ? "bunx" : "npx",
      label: isBunRuntime ? "Web UI · bunx" : "Web UI · npx",
      primarySource: "npm",
      canSelfUpdate: false,
      updateCommand: isBunRuntime ? "bunx ccusage-webui@latest" : "npx ccusage-webui@latest",
    };
  }

  if (
    pathHint.includes("/.bun/install/global/") ||
    pathHint.includes("/.bun/bin/") ||
    (isBunRuntime && normCwd.includes("/node_modules/"))
  ) {
    return {
      id: "bun-global",
      label: "Web UI · bun global",
      primarySource: "npm",
      canSelfUpdate: true,
      updateCommand: "bun add -g ccusage-webui@latest",
    };
  }

  if (pathHint.includes("/pnpm/") || pathHint.includes("/pnpm-global/") || ua.startsWith("pnpm/")) {
    return {
      id: "pnpm-global",
      label: "Web UI · pnpm",
      primarySource: "npm",
      canSelfUpdate: true,
      updateCommand: "pnpm add -g ccusage-webui@latest",
    };
  }

  if (pathHint.includes("/yarn/") || ua.startsWith("yarn/")) {
    return {
      id: "yarn-global",
      label: "Web UI · yarn",
      primarySource: "npm",
      canSelfUpdate: true,
      updateCommand: "yarn global add ccusage-webui@latest",
    };
  }

  if (normCwd.includes("/node_modules/")) {
    return {
      id: "npm-global",
      label: "Web UI · npm global",
      primarySource: "npm",
      canSelfUpdate: true,
      updateCommand: "npm i -g ccusage-webui@latest",
    };
  }

  if (fs.existsSync(path.join(/*turbopackIgnore: true*/ cwd, ".git"))) {
    return {
      id: "git-source",
      label: "Web UI · Local source",
      primarySource: "github",
      canSelfUpdate: false,
      updateCommand: "git pull && npm install",
    };
  }

  return {
    id: "unknown",
    label: "Web UI",
    primarySource: "npm",
    canSelfUpdate: false,
    updateCommand: "npm i -g ccusage-webui@latest",
  };
}
