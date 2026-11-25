"use client";

import { useState, useEffect, useCallback, useMemo, useSyncExternalStore } from "react";
import { Moon, Settings, Sun } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DailyView } from "@/components/dashboard/daily-view";
import { MonthlyView } from "@/components/dashboard/monthly-view";
import { SessionView } from "@/components/dashboard/session-view";
import { BlocksView } from "@/components/dashboard/blocks-view";
import { SettingsView } from "@/components/dashboard/settings-view";
import {
  applyThemeClass,
  getServerPreferencesSnapshot,
  readPreferences,
  subscribePreferences,
  writePreferences,
  type DashboardPreferences,
} from "@/lib/preferences";
import type { KpiMetricId } from "@/lib/metrics";
import { aggregateModelBreakdowns } from "@/lib/utils";
import type {
  DailyResponse,
  MonthlyResponse,
  SessionResponse,
  BlocksResponse,
  ModelBreakdown,
  ViewType,
} from "@/lib/types";

type TabValue = ViewType | "settings";

const USAGE_VIEWS: { value: ViewType; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "monthly", label: "Monthly" },
  { value: "session", label: "Sessions" },
  { value: "blocks", label: "Blocks" },
];

const AUTO_REFRESH_MS = 2 * 60 * 1000;

type ViewData = DailyResponse | MonthlyResponse | SessionResponse | BlocksResponse | null;

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-[260px] rounded-lg" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Skeleton className="h-[260px] rounded-lg" />
        <Skeleton className="h-[260px] rounded-lg" />
      </div>
      <Skeleton className="h-[132px] rounded-lg" />
    </div>
  );
}

export default function Home() {
  const [activeView, setActiveView] = useState<TabValue>("daily");
  const [lastUsageView, setLastUsageView] = useState<ViewType>("daily");
  const [activeMetric, setActiveMetric] = useState<KpiMetricId>("totalCost");
  const [systemDark, setSystemDark] = useState(true);
  const [cache, setCache] = useState<Partial<Record<ViewType, ViewData>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [modelToEdit, setModelToEdit] = useState<string | null>(null);

  const preferences = useSyncExternalStore(
    subscribePreferences,
    readPreferences,
    getServerPreferencesSnapshot
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setSystemDark(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    applyThemeClass(preferences.theme);
  }, [preferences.theme, systemDark]);

  const isDark =
    preferences.theme === "dark" || (preferences.theme === "system" && systemDark);

  const effectiveMetric = useMemo<KpiMetricId>(() => {
    if (preferences.kpiCards.includes(activeMetric)) return activeMetric;
    if (preferences.kpiCards.includes("totalCost")) return "totalCost";
    return preferences.kpiCards[0] ?? "totalCost";
  }, [preferences.kpiCards, activeMetric]);

  const fetchView = useCallback(async (view: ViewType, bustCache = false) => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/usage?view=${view}${bustCache ? `&t=${Date.now()}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setCache((prev) => ({ ...prev, [view]: data }));
      setLastRefresh(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeView === "settings" || cache[activeView]) return;
    let cancelled = false;
    const url = `/api/usage?view=${activeView}`;
    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((nextData) => {
        if (cancelled) return;
        setCache((prev) => ({ ...prev, [activeView]: nextData }));
        setError(null);
        setLastRefresh(new Date());
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Unknown error");
      });
    return () => {
      cancelled = true;
    };
  }, [activeView, cache]);

  useEffect(() => {
    if (activeView === "settings") return;
    const id = setInterval(() => fetchView(activeView, true), AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [activeView, fetchView]);

  const missingModels = useMemo<ModelBreakdown[]>(() => {
    const collected: ModelBreakdown[] = [];
    const daily = cache.daily as DailyResponse | undefined;
    if (daily?.daily) {
      for (const d of daily.daily) {
        for (const b of d.modelBreakdowns ?? []) {
          if (b.missingPricing) collected.push(b);
        }
      }
    }
    const monthly = cache.monthly as MonthlyResponse | undefined;
    if (collected.length === 0 && monthly?.monthly) {
      for (const m of monthly.monthly) {
        for (const b of m.modelBreakdowns ?? []) {
          if (b.missingPricing) collected.push(b);
        }
      }
    }
    const session = cache.session as SessionResponse | undefined;
    if (collected.length === 0 && session?.sessions) {
      for (const s of session.sessions) {
        for (const b of s.modelBreakdowns ?? []) {
          if (b.missingPricing) collected.push(b);
        }
      }
    }
    return aggregateModelBreakdowns(collected);
  }, [cache]);

  const handleUpdatePreferences = useCallback((next: DashboardPreferences) => {
    writePreferences(next);
  }, []);

  const handleUpdateKpiCards = useCallback(
    (nextCards: KpiMetricId[]) => {
      writePreferences({
        ...preferences,
        kpiCards: nextCards,
      });
    },
    [preferences]
  );

  const handleToggleTheme = useCallback(() => {
    writePreferences({
      ...preferences,
      theme: isDark ? "light" : "dark",
    });
  }, [preferences, isDark]);

  const handleSelectView = useCallback((view: ViewType) => {
    setLastUsageView(view);
    setActiveView(view);
  }, []);

  const handleToggleSettings = useCallback(() => {
    if (activeView === "settings") {
      setActiveView(lastUsageView);
    } else {
      setLastUsageView(activeView);
      setActiveView("settings");
    }
  }, [activeView, lastUsageView]);

  const handleConfigureModel = useCallback(
    (modelName: string) => {
      if (activeView !== "settings") {
        setLastUsageView(activeView);
      }
      setModelToEdit(modelName);
      setActiveView("settings");
    },
    [activeView]
  );

  const handleClearInitialModel = useCallback(() => {
    setModelToEdit(null);
  }, []);

  const handleConfigSaved = useCallback(() => {
    setCache({});
    fetchView("daily", true);
  }, [fetchView]);

  const data = activeView === "settings" ? null : cache[activeView];
  const isInitialLoading = activeView !== "settings" && !data && !error;

  function renderView() {
    if (activeView === "settings") {
      return (
        <SettingsView
          preferences={preferences}
          onUpdatePreferences={handleUpdatePreferences}
          missingModels={missingModels}
          initialModelToEdit={modelToEdit}
          onClearInitialModel={handleClearInitialModel}
          onConfigSaved={handleConfigSaved}
        />
      );
    }

    if (isInitialLoading || (loading && !data)) return <LoadingSkeleton />;
    if (error)
      return (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">
          <p className="font-semibold mb-1">Failed to load usage data</p>
          <p className="font-mono text-xs opacity-80">{error}</p>
          <p className="mt-2 text-xs opacity-70">
            Make sure <code className="font-mono">ccusage</code> is installed or available via npx.
          </p>
        </div>
      );
    if (!data) return null;

    switch (activeView) {
      case "daily":
        return (
          <DailyView
            key={preferences.defaultDailyRange}
            data={data as DailyResponse}
            defaultRange={preferences.defaultDailyRange}
            kpiCards={preferences.kpiCards}
            onUpdateKpiCards={handleUpdateKpiCards}
            activeMetric={effectiveMetric}
            onSelectMetric={setActiveMetric}
            onConfigureModel={handleConfigureModel}
          />
        );
      case "monthly":
        return (
          <MonthlyView
            data={data as MonthlyResponse}
            kpiCards={preferences.kpiCards}
            onUpdateKpiCards={handleUpdateKpiCards}
            activeMetric={effectiveMetric}
            onSelectMetric={setActiveMetric}
            onConfigureModel={handleConfigureModel}
          />
        );
      case "session":
        return (
          <SessionView
            data={data as SessionResponse}
            kpiCards={preferences.kpiCards}
            onUpdateKpiCards={handleUpdateKpiCards}
            onConfigureModel={handleConfigureModel}
          />
        );
      case "blocks":
        return (
          <BlocksView
            data={data as BlocksResponse}
            kpiCards={preferences.kpiCards}
            onUpdateKpiCards={handleUpdateKpiCards}
            activeMetric={effectiveMetric}
            onSelectMetric={setActiveMetric}
          />
        );
    }
  }

  return (
    <Tabs
      value={activeView === "settings" ? null : activeView}
      onValueChange={(v) => {
        if (v) handleSelectView(v as ViewType);
      }}
      className="min-h-screen bg-background gap-0"
    >
      <header className="border-b border-border sticky top-0 z-10 bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:items-center">
          <div className="flex items-center gap-2.5 shrink-0 lg:justify-self-start">
            <span className="text-lg font-semibold tracking-tight">ccusage</span>
            <Badge variant="secondary" className="text-xs font-normal">
              local dashboard
            </Badge>
          </div>

          <nav
            aria-label="Dashboard views"
            className="order-3 w-full max-w-full overflow-x-auto overflow-y-hidden py-1.5 -my-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden flex md:order-none md:w-auto lg:justify-self-center"
          >
            <TabsList className="w-full sm:w-fit mx-auto">
              {USAGE_VIEWS.map((v) => (
                <TabsTrigger
                  key={v.value}
                  value={v.value}
                  className="flex-1 sm:flex-none px-3 shrink-0"
                >
                  {v.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </nav>

          <div className="flex items-center gap-3 shrink-0 lg:justify-self-end">
            {loading && (
              <span className="text-xs text-muted-foreground animate-pulse">Refreshing…</span>
            )}
            {lastRefresh && !loading && (
              <span className="text-xs text-muted-foreground hidden lg:block">
                Updated {lastRefresh.toLocaleTimeString()}
              </span>
            )}
            {activeView !== "settings" && (
              <button
                type="button"
                onClick={() => fetchView(activeView, true)}
                disabled={loading}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
              >
                Refresh
              </button>
            )}
            <button
              type="button"
              onClick={handleToggleTheme}
              aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
              title={isDark ? "Switch to light theme" : "Switch to dark theme"}
              className="inline-flex items-center justify-center rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              {isDark ? (
                <Sun className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Moon className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={handleToggleSettings}
              aria-label={
                missingModels.length > 0
                  ? `Settings (${missingModels.length} models missing pricing)`
                  : "Settings"
              }
              aria-pressed={activeView === "settings"}
              className={[
                "relative inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors",
                activeView === "settings"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/60",
              ].join(" ")}
            >
              <Settings className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Settings</span>
              {missingModels.length > 0 && (
                <span
                  className={[
                    "inline-flex h-4 min-w-4 items-center justify-center rounded-full border px-1 font-mono text-[10px] font-semibold",
                    activeView === "settings"
                      ? "bg-amber-500/25 text-amber-200 border-amber-400/40 dark:bg-amber-950/15 dark:text-amber-900 dark:border-amber-900/30"
                      : "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40",
                  ].join(" ")}
                >
                  {missingModels.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        {activeView === "settings"
          ? renderView()
          : USAGE_VIEWS.map((v) => (
              <TabsContent key={v.value} value={v.value} className="mt-0">
                {activeView === v.value && renderView()}
              </TabsContent>
            ))}
      </main>
    </Tabs>
  );
}
