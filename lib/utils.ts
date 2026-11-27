import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ModelBreakdown, Totals } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function sumUsageTotals(entries: readonly Totals[]): Totals {
  return {
    inputTokens: entries.reduce((s, d) => s + d.inputTokens, 0),
    outputTokens: entries.reduce((s, d) => s + d.outputTokens, 0),
    cacheCreationTokens: entries.reduce((s, d) => s + d.cacheCreationTokens, 0),
    cacheReadTokens: entries.reduce((s, d) => s + d.cacheReadTokens, 0),
    totalTokens: entries.reduce((s, d) => s + d.totalTokens, 0),
    totalCost: entries.reduce((s, d) => s + d.totalCost, 0),
  };
}

export function filterEntryByModels<
  T extends Totals & { modelsUsed: string[]; modelBreakdowns: ModelBreakdown[] },
>(entry: T, excludedModels: ReadonlySet<string>): T {
  if (excludedModels.size === 0) return entry;
  const modelBreakdowns = (entry.modelBreakdowns ?? []).filter(
    (b) => !excludedModels.has(b.modelName)
  );
  const inputTokens = modelBreakdowns.reduce((s, b) => s + b.inputTokens, 0);
  const outputTokens = modelBreakdowns.reduce((s, b) => s + b.outputTokens, 0);
  const cacheCreationTokens = modelBreakdowns.reduce((s, b) => s + b.cacheCreationTokens, 0);
  const cacheReadTokens = modelBreakdowns.reduce((s, b) => s + b.cacheReadTokens, 0);
  const totalTokens = inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens;
  const totalCost = modelBreakdowns.reduce((s, b) => s + b.cost, 0);
  const modelsUsed = (entry.modelsUsed ?? []).filter((m) => !excludedModels.has(m));
  return {
    ...entry,
    inputTokens,
    outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
    totalTokens,
    totalCost,
    modelsUsed,
    modelBreakdowns,
  };
}

export function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export function aggregateModelBreakdowns(breakdowns: ModelBreakdown[]): ModelBreakdown[] {
  const map = new Map<string, ModelBreakdown>();
  for (const b of breakdowns) {
    const existing = map.get(b.modelName);
    if (existing) {
      existing.inputTokens += b.inputTokens;
      existing.outputTokens += b.outputTokens;
      existing.cacheCreationTokens += b.cacheCreationTokens;
      existing.cacheReadTokens += b.cacheReadTokens;
      existing.cost += b.cost;
      if (b.missingPricing) {
        existing.missingPricing = true;
      }
    } else {
      map.set(b.modelName, { ...b });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.cost - a.cost);
}

export const MODEL_COLORS: Record<string, string> = {
  "claude-opus-4-7": "#8b5cf6",
  "claude-opus-4-6": "#7c3aed",
  "claude-sonnet-4-6": "#3b82f6",
  "claude-sonnet-4-5": "#2563eb",
  "claude-haiku-4-5-20251001": "#10b981",
  "claude-haiku-4-5": "#059669",
};

interface FamilyPalette {
  hue: number;
  hueSpread: number;
  sat: number;
  light: number;
  lightSpread: number;
}

const FAMILY_RULES: Array<{ test: (model: string) => boolean; palette: FamilyPalette }> = [
  // Anthropic Claude
  { test: (m) => m.includes("opus"), palette: { hue: 263, hueSpread: 14, sat: 82, light: 60, lightSpread: 8 } },
  { test: (m) => m.includes("sonnet"), palette: { hue: 217, hueSpread: 14, sat: 85, light: 56, lightSpread: 8 } },
  { test: (m) => m.includes("haiku"), palette: { hue: 158, hueSpread: 14, sat: 78, light: 44, lightSpread: 8 } },
  { test: (m) => m.includes("fable") || m.includes("claude"), palette: { hue: 239, hueSpread: 12, sat: 80, light: 62, lightSpread: 7 } },

  // Third-party & open-weight providers (checked before generic tier keywords like flash/pro)
  { test: (m) => m.includes("minimax"), palette: { hue: 330, hueSpread: 10, sat: 80, light: 58, lightSpread: 7 } },
  { test: (m) => m.includes("nemotron"), palette: { hue: 126, hueSpread: 10, sat: 72, light: 44, lightSpread: 7 } },
  { test: (m) => m.includes("deepseek"), palette: { hue: 235, hueSpread: 12, sat: 78, light: 58, lightSpread: 7 } },
  { test: (m) => m.includes("qwen") || m.includes("qwq"), palette: { hue: 280, hueSpread: 14, sat: 78, light: 58, lightSpread: 8 } },
  { test: (m) => m.includes("grok"), palette: { hue: 0, hueSpread: 10, sat: 82, light: 56, lightSpread: 7 } },
  {
    test: (m) =>
      m.includes("mistral") ||
      m.includes("mixtral") ||
      m.includes("codestral") ||
      m.includes("devstral") ||
      m.includes("pixtral"),
    palette: { hue: 14, hueSpread: 12, sat: 86, light: 56, lightSpread: 7 },
  },
  { test: (m) => m.includes("glm"), palette: { hue: 295, hueSpread: 12, sat: 78, light: 58, lightSpread: 7 } },
  { test: (m) => m.includes("kimi") || m.includes("moonshot"), palette: { hue: 348, hueSpread: 10, sat: 82, light: 57, lightSpread: 7 } },
  { test: (m) => m.includes("doubao") || m.includes("seed"), palette: { hue: 342, hueSpread: 10, sat: 78, light: 54, lightSpread: 7 } },
  { test: (m) => m.includes("hermes"), palette: { hue: 46, hueSpread: 10, sat: 88, light: 48, lightSpread: 7 } },
  { test: (m) => m.includes("command"), palette: { hue: 142, hueSpread: 10, sat: 70, light: 45, lightSpread: 7 } },
  { test: (m) => m.includes("llama"), palette: { hue: 210, hueSpread: 12, sat: 82, light: 58, lightSpread: 8 } },

  // Google Gemini & Gemma (Hydrogen, Neon, Carbon, Flash, Pro)
  { test: (m) => m.includes("hydrogen"), palette: { hue: 199, hueSpread: 10, sat: 88, light: 52, lightSpread: 7 } },
  { test: (m) => m.includes("neon"), palette: { hue: 92, hueSpread: 12, sat: 85, light: 50, lightSpread: 6 } },
  { test: (m) => m.includes("carbon"), palette: { hue: 22, hueSpread: 10, sat: 88, light: 52, lightSpread: 7 } },
  {
    test: (m) => m.includes("flash-lite") || m.includes("flash_lite") || (m.includes("gemini") && m.includes("nano")),
    palette: { hue: 194, hueSpread: 8, sat: 84, light: 60, lightSpread: 6 },
  },
  { test: (m) => m.includes("flash"), palette: { hue: 186, hueSpread: 10, sat: 84, light: 46, lightSpread: 7 } },
  { test: (m) => m.includes("gemini"), palette: { hue: 38, hueSpread: 10, sat: 90, light: 50, lightSpread: 7 } },
  { test: (m) => m.includes("gemma"), palette: { hue: 172, hueSpread: 10, sat: 76, light: 46, lightSpread: 7 } },

  // OpenAI
  { test: (m) => m.includes("gpt-oss") || m.includes("codex"), palette: { hue: 204, hueSpread: 10, sat: 84, light: 48, lightSpread: 7 } },
  { test: (m) => m.includes("gpt-") || m.includes("chatgpt"), palette: { hue: 170, hueSpread: 10, sat: 76, light: 42, lightSpread: 7 } },
  { test: (m) => /(?:^|\/)o[134](?:-|$)/.test(m), palette: { hue: 178, hueSpread: 10, sat: 74, light: 38, lightSpread: 6 } },
];

function hashModelName(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function normalizeModelForMatching(name: string): string {
  return name
    .toLowerCase()
    .replace(/^\[[^\]]+\]\s*/, "")
    .replace(/^(?:llama-?cpp|ollama|vllm|lmstudio)\//, "");
}

function shiftedFamilyColor(name: string, palette: FamilyPalette): string {
  const hash = hashModelName(name);
  const hueUnit = (hash % 1000) / 999 - 0.5;
  const lightUnit = ((hash >>> 10) % 1000) / 999 - 0.5;
  const hue = Math.round((palette.hue + hueUnit * 2 * palette.hueSpread + 360) % 360);
  const light = Math.round(
    Math.max(36, Math.min(68, palette.light + lightUnit * 2 * palette.lightSpread))
  );
  return `hsl(${hue}, ${palette.sat}%, ${light}%)`;
}

export function modelColor(name: string): string {
  if (!name) return "#6b7280";
  if (MODEL_COLORS[name]) return MODEL_COLORS[name];

  const normalized = normalizeModelForMatching(name);
  for (const rule of FAMILY_RULES) {
    if (rule.test(normalized)) {
      return shiftedFamilyColor(name, rule.palette);
    }
  }

  // Deterministic vibrant fallback for local/unknown models
  const hash = hashModelName(name);
  const hue = hash % 360;
  const light = 48 + ((hash >>> 9) % 15);
  return `hsl(${hue}, 68%, ${light}%)`;
}

export function shortModelName(name: string): string {
  return name.replace("claude-", "").replace(/-\d{8}$/, "");
}
