import { ALL_KPI_METRICS, DEFAULT_KPI_CARDS, isValidKpiMetric, type KpiMetricId } from "./metrics";
import type { DailyRangePreset } from "./types";

export const PREFS_STORAGE_KEY = "ccusage-web:preferences";
const PREFS_EVENT = "ccusage-web:preferences-change";

export type ThemePreference = "dark" | "light" | "system";

export interface DashboardPreferences {
  defaultDailyRange: DailyRangePreset;
  theme: ThemePreference;
  kpiCards: KpiMetricId[];
}

export const DEFAULT_PREFERENCES: DashboardPreferences = {
  defaultDailyRange: "all",
  theme: "dark",
  kpiCards: DEFAULT_KPI_CARDS,
};

export const THEME_OPTIONS: ReadonlyArray<{
  value: ThemePreference;
  label: string;
}> = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
];

export const DAILY_RANGE_OPTIONS: ReadonlyArray<{
  value: DailyRangePreset;
  label: string;
  description: string;
  days?: number;
}> = [
  { value: "1d", label: "1D", description: "1 day", days: 1 },
  { value: "7d", label: "7D", description: "7 days", days: 7 },
  { value: "14d", label: "14D", description: "14 days", days: 14 },
  { value: "30d", label: "30D", description: "30 days", days: 30 },
  { value: "all", label: "All", description: "All time" },
];

const VALID_PRESETS = new Set<string>(DAILY_RANGE_OPTIONS.map((o) => o.value));
const VALID_THEMES = new Set<string>(THEME_OPTIONS.map((o) => o.value));
const VALID_KPI_SET = new Set<string>(ALL_KPI_METRICS);

let cachedRaw: string | null = null;
let cachedSnapshot: DashboardPreferences = DEFAULT_PREFERENCES;

function normalizeKpiCards(rawCards: unknown): KpiMetricId[] {
  if (!Array.isArray(rawCards)) return DEFAULT_KPI_CARDS;
  const seen = new Set<KpiMetricId>();
  const valid: KpiMetricId[] = [];
  for (const item of rawCards) {
    if (typeof item === "string" && VALID_KPI_SET.has(item) && isValidKpiMetric(item) && !seen.has(item)) {
      seen.add(item);
      valid.push(item);
    }
  }
  return valid.length > 0 ? valid : DEFAULT_KPI_CARDS;
}

export function readPreferences(): DashboardPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
    if (raw === cachedRaw) return cachedSnapshot;
    cachedRaw = raw;
    if (!raw) {
      cachedSnapshot = DEFAULT_PREFERENCES;
      return cachedSnapshot;
    }
    const parsed = JSON.parse(raw) as Partial<DashboardPreferences>;
    const defaultDailyRange =
      typeof parsed.defaultDailyRange === "string" && VALID_PRESETS.has(parsed.defaultDailyRange)
        ? (parsed.defaultDailyRange as DailyRangePreset)
        : "all";
    const theme =
      typeof parsed.theme === "string" && VALID_THEMES.has(parsed.theme)
        ? (parsed.theme as ThemePreference)
        : "dark";
    const kpiCards = normalizeKpiCards(parsed.kpiCards);
    cachedSnapshot = { defaultDailyRange, theme, kpiCards };
    return cachedSnapshot;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function getServerPreferencesSnapshot(): DashboardPreferences {
  return DEFAULT_PREFERENCES;
}

export function subscribePreferences(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => onStoreChange();
  window.addEventListener("storage", handler);
  window.addEventListener(PREFS_EVENT, handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(PREFS_EVENT, handler);
  };
}

export function writePreferences(prefs: DashboardPreferences): void {
  if (typeof window === "undefined") return;
  try {
    const normalized: DashboardPreferences = {
      defaultDailyRange: VALID_PRESETS.has(prefs.defaultDailyRange) ? prefs.defaultDailyRange : "all",
      theme: VALID_THEMES.has(prefs.theme) ? prefs.theme : "dark",
      kpiCards: normalizeKpiCards(prefs.kpiCards),
    };
    const serialized = JSON.stringify(normalized);
    cachedRaw = serialized;
    cachedSnapshot = normalized;
    window.localStorage.setItem(PREFS_STORAGE_KEY, serialized);
    window.dispatchEvent(new Event(PREFS_EVENT));
  } catch {
    // Ignore quota/storage errors in restricted contexts
  }
}

export function resolveIsDark(theme: ThemePreference): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyThemeClass(theme: ThemePreference): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", resolveIsDark(theme));
}

export function shiftDateString(dateStr: string, daysDelta: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return dateStr;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const dt = new Date(Date.UTC(year, month - 1, day + daysDelta));
  return dt.toISOString().slice(0, 10);
}

export function getPresetDateRange(
  preset: DailyRangePreset,
  maxDate?: string
): { from: string; to: string } {
  if (preset === "all" || !maxDate) {
    return { from: "", to: "" };
  }
  const opt = DAILY_RANGE_OPTIONS.find((o) => o.value === preset);
  const days = opt?.days ?? 1;
  return {
    from: days <= 1 ? maxDate : shiftDateString(maxDate, -(days - 1)),
    to: maxDate,
  };
}

export function detectActivePreset(
  from: string,
  to: string,
  maxDate?: string
): DailyRangePreset | null {
  if (!from && !to) return "all";
  if (!maxDate) return null;
  for (const opt of DAILY_RANGE_OPTIONS) {
    if (opt.value === "all") continue;
    const expected = getPresetDateRange(opt.value, maxDate);
    if (from === expected.from && to === expected.to) {
      return opt.value;
    }
  }
  return null;
}
