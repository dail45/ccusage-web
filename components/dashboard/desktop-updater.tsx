"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  ArrowUpCircle,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { VersionInfoResponse } from "@/app/api/version/route";

export type DesktopUpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "error"
  | "unsupported";

export interface DesktopUpdateState {
  currentVersion: string;
  canAutoInstall: boolean;
  isPackaged: boolean;
  status: DesktopUpdateStatus;
  version: string | null;
  releaseUrl: string;
  progress: number | null;
  error: string | null;
}

export interface CcusageDesktopBridge {
  getUpdateState: () => Promise<DesktopUpdateState>;
  checkForUpdates: () => Promise<DesktopUpdateState>;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  openReleasesPage: () => Promise<void>;
  onUpdateState: (listener: (state: DesktopUpdateState) => void) => () => void;
}

declare global {
  interface Window {
    ccusageDesktop?: CcusageDesktopBridge;
  }
}

const noopSubscribe = () => () => {};
const getBridgeSnapshot = (): CcusageDesktopBridge | null =>
  typeof window !== "undefined" ? (window.ccusageDesktop ?? null) : null;
const getServerBridgeSnapshot = (): CcusageDesktopBridge | null => null;

let cachedVersionInfo: VersionInfoResponse | null = null;
let inflightVersionFetch: Promise<VersionInfoResponse | null> | null = null;

async function fetchVersionInfo(refresh = false): Promise<VersionInfoResponse | null> {
  if (!refresh && cachedVersionInfo) return cachedVersionInfo;
  if (!refresh && inflightVersionFetch) return inflightVersionFetch;
  const p = fetch(`/api/version${refresh ? "?refresh=1" : ""}`)
    .then(async (res) => {
      if (!res.ok) return null;
      const data = (await res.json()) as VersionInfoResponse;
      cachedVersionInfo = data;
      return data;
    })
    .catch(() => null)
    .finally(() => {
      inflightVersionFetch = null;
    });
  if (!refresh) inflightVersionFetch = p;
  return p;
}

export function useDesktopUpdateState(): {
  bridge: CcusageDesktopBridge | null;
  state: DesktopUpdateState | null;
} {
  const bridge = useSyncExternalStore(
    noopSubscribe,
    getBridgeSnapshot,
    getServerBridgeSnapshot
  );
  const [state, setState] = useState<DesktopUpdateState | null>(null);

  useEffect(() => {
    if (!bridge) return;
    let mounted = true;
    bridge
      .getUpdateState()
      .then((initial) => {
        if (mounted) setState(initial);
      })
      .catch(() => {});
    const unsubscribe = bridge.onUpdateState((next) => {
      if (mounted) setState(next);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [bridge]);

  return { bridge, state };
}

export function useAppVersionInfo() {
  const { bridge, state: desktopState } = useDesktopUpdateState();
  const [versionInfo, setVersionInfo] = useState<VersionInfoResponse | null>(
    () => cachedVersionInfo
  );
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetchVersionInfo(false).then((info) => {
      if (mounted && info) setVersionInfo(info);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const refreshAll = useCallback(async () => {
    setChecking(true);
    try {
      const [info] = await Promise.all([
        fetchVersionInfo(true),
        bridge ? bridge.checkForUpdates().catch(() => null) : Promise.resolve(null),
      ]);
      if (info) setVersionInfo(info);
    } finally {
      setChecking(false);
    }
  }, [bridge]);

  const currentVersion = desktopState?.currentVersion ?? versionInfo?.currentVersion ?? null;
  const isElectron = Boolean(bridge);

  return {
    bridge,
    desktopState,
    versionInfo,
    currentVersion,
    isElectron,
    checking: checking || desktopState?.status === "checking",
    refreshAll,
  };
}

export function AppVersionPill({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const { currentVersion } = useAppVersionInfo();
  if (!currentVersion) return null;

  return (
    <button
      type="button"
      onClick={onOpenSettings}
      title="View current, GitHub, and npm versions in Settings"
      className="hidden sm:inline-flex items-center rounded border border-border/70 bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
    >
      v{currentVersion}
    </button>
  );
}

export function DesktopUpdateHeaderBadge({
  onOpenSettings,
}: {
  onOpenSettings?: () => void;
}) {
  const { bridge, desktopState, versionInfo, isElectron } = useAppVersionInfo();

  if (isElectron && bridge && desktopState) {
    if (desktopState.status === "downloaded" && desktopState.version) {
      return (
        <button
          type="button"
          onClick={() => bridge.installUpdate()}
          title={`Restart and install v${desktopState.version}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/45 bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25 transition-colors"
        >
          <ArrowUpCircle className="h-3.5 w-3.5" />
          <span>Update v{desktopState.version}</span>
        </button>
      );
    }

    if (desktopState.status === "downloading") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
          <Download className="h-3 w-3 animate-bounce" />
          <span className="font-mono">
            {desktopState.progress !== null ? `${desktopState.progress}%` : "Updating…"}
          </span>
        </span>
      );
    }

    if (desktopState.status === "available" && desktopState.version) {
      return (
        <button
          type="button"
          onClick={() => bridge.downloadUpdate()}
          title={`Download v${desktopState.version} from GitHub Releases`}
          className="inline-flex items-center gap-1.5 rounded-md border border-blue-500/45 bg-blue-500/15 px-2.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-500/25 transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          <span>v{desktopState.version} available</span>
        </button>
      );
    }
  }

  if (!isElectron && versionInfo) {
    const newerVersion = versionInfo.npm.hasUpdate
      ? versionInfo.npm.version
      : versionInfo.github.hasUpdate
        ? versionInfo.github.version
        : null;
    if (newerVersion) {
      return (
        <button
          type="button"
          onClick={onOpenSettings}
          title={`v${newerVersion} available — open Settings for update details`}
          className="inline-flex items-center gap-1.5 rounded-md border border-blue-500/45 bg-blue-500/15 px-2.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-500/25 transition-colors"
        >
          <ArrowUpCircle className="h-3.5 w-3.5" />
          <span>v{newerVersion} available</span>
        </button>
      );
    }
  }

  return null;
}

export function DesktopUpdateSettingsCard() {
  const { bridge, desktopState, versionInfo, currentVersion, isElectron, checking, refreshAll } =
    useAppVersionInfo();
  const [copiedCmd, setCopiedCmd] = useState(false);

  const isDownloading = desktopState?.status === "downloading";

  function handleCopyNpmCmd() {
    const cmd = "npm i -g ccusage-webui@latest";
    navigator.clipboard?.writeText(cmd).then(() => {
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 1800);
    }).catch(() => {});
  }

  function renderDesktopStatus() {
    if (!desktopState) return null;
    switch (desktopState.status) {
      case "checking":
        return <span className="text-muted-foreground">Checking GitHub Releases…</span>;
      case "available":
        return (
          <span className="text-blue-600 dark:text-blue-400 font-medium">
            Desktop update v{desktopState.version} is available
          </span>
        );
      case "downloading":
        return (
          <span className="text-blue-600 dark:text-blue-400 font-medium">
            Downloading v{desktopState.version}
            {desktopState.progress !== null ? ` (${desktopState.progress}%)` : "…"}
          </span>
        );
      case "downloaded":
        return (
          <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
            <CheckCircle2 className="h-3.5 w-3.5" />
            v{desktopState.version} downloaded and ready to install
          </span>
        );
      case "not-available":
        return (
          <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Desktop app is on the latest release
          </span>
        );
      case "unsupported":
        return (
          <span className="text-muted-foreground">
            Electron auto-install runs in packaged desktop builds.
          </span>
        );
      case "error":
        return (
          <span className="text-destructive">
            Desktop updater error: {desktopState.error ?? "Unknown error"}
          </span>
        );
      default:
        return (
          <span className="text-muted-foreground">
            Automatically checks GitHub Releases on launch.
          </span>
        );
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-medium">Version &amp; Updates</CardTitle>
            <Badge variant="secondary" className="text-[11px] font-normal">
              {isElectron ? "Desktop (Electron)" : "Web UI (npm)"}
            </Badge>
          </div>
          <span className="font-mono text-xs font-medium">
            {currentVersion ? `v${currentVersion}` : "…"}
          </span>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {/* GitHub Releases status */}
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/25 px-3 py-2 text-xs">
            <div className="min-w-0">
              <div className="text-muted-foreground">GitHub Releases</div>
              <div className="mt-0.5 flex items-center gap-1.5 font-mono font-medium">
                {versionInfo ? (
                  versionInfo.github.version ? (
                    <span>v{versionInfo.github.version}</span>
                  ) : versionInfo.github.error ? (
                    <span className="text-muted-foreground font-sans font-normal">
                      Unavailable ({versionInfo.github.error})
                    </span>
                  ) : (
                    <span className="text-muted-foreground font-sans font-normal">
                      No published release
                    </span>
                  )
                ) : (
                  <span className="text-muted-foreground">Checking…</span>
                )}
                {versionInfo?.github.hasUpdate && (
                  <Badge className="bg-blue-500/15 text-blue-600 dark:text-blue-300 border-blue-500/30 text-[10px]">
                    Update
                  </Badge>
                )}
                {versionInfo?.github.version && !versionInfo.github.hasUpdate && (
                  <span className="text-[10px] font-sans font-normal text-emerald-600 dark:text-emerald-400">
                    Up to date
                  </span>
                )}
              </div>
            </div>
            <a
              href={versionInfo?.github.url ?? "https://github.com/dail45/ccusage-web/releases"}
              target="_blank"
              rel="noreferrer"
              aria-label="Open GitHub Releases"
              className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>

          {/* npm registry status */}
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/25 px-3 py-2 text-xs">
            <div className="min-w-0">
              <div className="text-muted-foreground">npm (ccusage-webui)</div>
              <div className="mt-0.5 flex items-center gap-1.5 font-mono font-medium">
                {versionInfo ? (
                  versionInfo.npm.version ? (
                    <span>v{versionInfo.npm.version}</span>
                  ) : (
                    <span className="text-muted-foreground font-sans font-normal">
                      Unavailable ({versionInfo.npm.error ?? "error"})
                    </span>
                  )
                ) : (
                  <span className="text-muted-foreground">Checking…</span>
                )}
                {versionInfo?.npm.hasUpdate && (
                  <Badge className="bg-blue-500/15 text-blue-600 dark:text-blue-300 border-blue-500/30 text-[10px]">
                    Update
                  </Badge>
                )}
                {versionInfo?.npm.version && !versionInfo.npm.hasUpdate && (
                  <span className="text-[10px] font-sans font-normal text-emerald-600 dark:text-emerald-400">
                    Up to date
                  </span>
                )}
              </div>
            </div>
            <a
              href={versionInfo?.npm.url ?? "https://www.npmjs.com/package/ccusage-webui"}
              target="_blank"
              rel="noreferrer"
              aria-label="Open npm package page"
              className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>

        {/* Web UI npm update command hint when npm has a newer version */}
        {!isElectron && versionInfo?.npm.hasUpdate && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-500/35 bg-blue-500/10 px-3 py-2 text-xs">
            <span className="text-blue-700 dark:text-blue-300">
              New npm version <code className="font-mono font-semibold">v{versionInfo.npm.version}</code> available:
            </span>
            <div className="flex items-center gap-1.5">
              <code className="rounded bg-background/80 border border-border px-2 py-0.5 font-mono text-[11px]">
                npm i -g ccusage-webui@latest
              </code>
              <Button type="button" size="xs" variant="outline" onClick={handleCopyNpmCmd}>
                {copiedCmd ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                <span>{copiedCmd ? "Copied" : "Copy"}</span>
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs">
            {isElectron
              ? renderDesktopStatus()
              : versionInfo?.checkedAt && (
                  <span className="text-muted-foreground">
                    Checked {new Date(versionInfo.checkedAt).toLocaleTimeString()}
                  </span>
                )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isElectron && bridge && desktopState?.status === "downloaded" && (
              <Button type="button" size="sm" onClick={() => bridge.installUpdate()}>
                <ArrowUpCircle className="h-3.5 w-3.5" />
                Restart &amp; Install
              </Button>
            )}
            {isElectron && bridge && desktopState?.status === "available" && (
              <Button type="button" size="sm" onClick={() => bridge.downloadUpdate()}>
                <Download className="h-3.5 w-3.5" />
                {desktopState.canAutoInstall ? "Download Update" : "Download Release"}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={checking || isDownloading}
              onClick={refreshAll}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} />
              Check for updates
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
