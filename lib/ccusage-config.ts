import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import type { CatalogModelPricing, CcusageConfig, PricingOverride } from "./types";

const CONFIG_SCHEMA_URL = "https://ccusage.com/config-schema.json";

const VALID_MODES = new Set(["auto", "calculate", "display"]);
const VALID_START_OF_WEEK = new Set([
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
]);

const PRICING_NUMBER_KEYS: ReadonlyArray<keyof PricingOverride> = [
  "inputCostPerToken",
  "outputCostPerToken",
  "cacheCreationInputTokenCost",
  "cacheReadInputTokenCost",
  "inputCostPerTokenAbove200kTokens",
  "outputCostPerTokenAbove200kTokens",
  "cacheCreationInputTokenCostAbove200kTokens",
  "cacheCreationInputTokenCostAbove1hr",
  "cacheReadInputTokenCostAbove200kTokens",
  "maxInputTokens",
  "fastMultiplier",
  "flexMultiplier",
];

const PREFERRED_PROVIDERS = new Map<string, number>([
  ["anthropic", 1],
  ["google", 2],
  ["openai", 3],
  ["xai", 4],
  ["deepseek", 5],
  ["mistral", 6],
  ["cohere", 7],
  ["qwen", 8],
  ["zhipu", 9],
  ["moonshotai", 10],
  ["minimax", 11],
  ["groq", 12],
]);

const BUILTIN_FALLBACK_CATALOG: CatalogModelPricing[] = [
  {
    id: "claude-opus-4-7",
    provider: "anthropic",
    source: "builtin",
    pricing: {
      inputCostPerToken: 5e-6,
      outputCostPerToken: 2.5e-5,
      cacheCreationInputTokenCost: 6.25e-6,
      cacheReadInputTokenCost: 5e-7,
    },
  },
  {
    id: "claude-sonnet-4-6",
    provider: "anthropic",
    source: "builtin",
    pricing: {
      inputCostPerToken: 3e-6,
      outputCostPerToken: 1.5e-5,
      cacheCreationInputTokenCost: 3.75e-6,
      cacheReadInputTokenCost: 3e-7,
    },
  },
  {
    id: "claude-haiku-4-5",
    provider: "anthropic",
    source: "builtin",
    pricing: {
      inputCostPerToken: 8e-7,
      outputCostPerToken: 4e-6,
      cacheCreationInputTokenCost: 1e-6,
      cacheReadInputTokenCost: 8e-8,
    },
  },
];

let catalogCache: { signature: string; models: CatalogModelPricing[] } | null = null;

/** Resolve the ccusage config file path, preferring existing standard locations. */
export function resolveCcusageConfigPath(): string {
  const envPath = process.env.CCUSAGE_CONFIG?.trim();
  if (envPath) return envPath;

  const home = homedir();
  const candidates = [
    join(home, ".config", "ccusage", "ccusage.json"),
    join(home, ".claude", "ccusage.json"),
    join(home, ".ccusage.json"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

export function readCcusageConfig(): {
  configPath: string;
  configExists: boolean;
  config: CcusageConfig;
  rawJson: string;
} {
  const configPath = resolveCcusageConfigPath();
  if (!existsSync(configPath)) {
    const empty: CcusageConfig = { $schema: CONFIG_SCHEMA_URL, defaults: {} };
    return {
      configPath,
      configExists: false,
      config: empty,
      rawJson: JSON.stringify(empty, null, 2),
    };
  }

  const rawJson = readFileSync(configPath, "utf-8");
  const parsed = JSON.parse(rawJson) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid ccusage config in ${configPath}: root must be a JSON object`);
  }
  return {
    configPath,
    configExists: true,
    config: parsed as CcusageConfig,
    rawJson,
  };
}

function sanitizePricingOverride(modelName: string, raw: unknown): PricingOverride {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`Pricing override for "${modelName}" must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  const cleaned: PricingOverride = {};

  for (const key of PRICING_NUMBER_KEYS) {
    const val = obj[key];
    if (val === undefined || val === null || val === "") continue;
    if (typeof val !== "number" || !Number.isFinite(val) || val < 0) {
      throw new Error(`Invalid "${key}" for "${modelName}": expected a non-negative finite number`);
    }
    if (key === "maxInputTokens" && !Number.isInteger(val)) {
      throw new Error(`Invalid "maxInputTokens" for "${modelName}": expected an integer`);
    }
    cleaned[key] = val;
  }

  for (const extraKey of Object.keys(obj)) {
    if (!PRICING_NUMBER_KEYS.includes(extraKey as keyof PricingOverride)) {
      throw new Error(`Unsupported pricing key "${extraKey}" for "${modelName}"`);
    }
  }

  return cleaned;
}

export function validateCcusageConfig(input: unknown): CcusageConfig {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Configuration root must be a JSON object");
  }

  const raw = { ...(input as Record<string, unknown>) };
  if (!raw.$schema) {
    raw.$schema = CONFIG_SCHEMA_URL;
  }

  if (raw.defaults !== undefined) {
    if (!raw.defaults || typeof raw.defaults !== "object" || Array.isArray(raw.defaults)) {
      throw new Error('"defaults" must be a JSON object');
    }
    const defaults = { ...(raw.defaults as Record<string, unknown>) };

    if (defaults.mode !== undefined && defaults.mode !== "") {
      if (typeof defaults.mode !== "string" || !VALID_MODES.has(defaults.mode)) {
        throw new Error('"defaults.mode" must be one of: auto, calculate, display');
      }
    } else if (defaults.mode === "") {
      delete defaults.mode;
    }

    if (defaults.offline !== undefined && typeof defaults.offline !== "boolean") {
      throw new Error('"defaults.offline" must be a boolean');
    }

    if (defaults.timezone !== undefined) {
      if (typeof defaults.timezone !== "string") {
        throw new Error('"defaults.timezone" must be a string');
      }
      const tz = defaults.timezone.trim();
      if (tz) {
        try {
          new Intl.DateTimeFormat(undefined, { timeZone: tz });
        } catch {
          throw new Error(`Invalid IANA timezone: "${tz}"`);
        }
        defaults.timezone = tz;
      } else {
        delete defaults.timezone;
      }
    }

    if (defaults.startOfWeek !== undefined) {
      if (typeof defaults.startOfWeek !== "string") {
        throw new Error('"defaults.startOfWeek" must be a string');
      }
      const sow = defaults.startOfWeek.trim().toLowerCase();
      if (sow) {
        if (!VALID_START_OF_WEEK.has(sow)) {
          throw new Error(`Invalid startOfWeek: "${sow}"`);
        }
        defaults.startOfWeek = sow;
      } else {
        delete defaults.startOfWeek;
      }
    }

    if (defaults.pricingOverrides !== undefined) {
      if (
        !defaults.pricingOverrides ||
        typeof defaults.pricingOverrides !== "object" ||
        Array.isArray(defaults.pricingOverrides)
      ) {
        throw new Error('"defaults.pricingOverrides" must be an object');
      }
      const nextOverrides: Record<string, PricingOverride> = {};
      for (const [modelName, override] of Object.entries(defaults.pricingOverrides)) {
        const trimmedName = modelName.trim();
        if (!trimmedName) {
          throw new Error("Model name in pricingOverrides cannot be empty");
        }
        nextOverrides[trimmedName] = sanitizePricingOverride(trimmedName, override);
      }
      defaults.pricingOverrides = nextOverrides;
    }

    raw.defaults = defaults;
  }

  return raw as CcusageConfig;
}

export function writeCcusageConfig(config: CcusageConfig): {
  configPath: string;
  config: CcusageConfig;
  rawJson: string;
} {
  const validated = validateCcusageConfig(config);
  const configPath = resolveCcusageConfigPath();
  mkdirSync(dirname(configPath), { recursive: true });
  const rawJson = `${JSON.stringify(validated, null, 2)}\n`;
  writeFileSync(configPath, rawJson, "utf-8");
  return { configPath, config: validated, rawJson };
}

function parseCachedJson(filePath: string): unknown | null {
  try {
    const text = readFileSync(filePath, "utf-8");
    const jsonStart = text.indexOf("{");
    if (jsonStart === -1) return null;
    return JSON.parse(text.slice(jsonStart)) as unknown;
  } catch {
    return null;
  }
}

function extractModelsDevCatalog(data: unknown, into: Map<string, { rank: number; item: CatalogModelPricing }>) {
  if (!data || typeof data !== "object") return;
  const M = 1_000_000;

  for (const [providerKey, providerVal] of Object.entries(data as Record<string, unknown>)) {
    if (!providerVal || typeof providerVal !== "object") continue;
    const models = (providerVal as { models?: Record<string, unknown> }).models;
    if (!models || typeof models !== "object") continue;

    const providerRank = PREFERRED_PROVIDERS.get(providerKey) ?? 50;

    for (const [modelKey, modelVal] of Object.entries(models)) {
      if (!modelVal || typeof modelVal !== "object") continue;
      const m = modelVal as {
        cost?: {
          input?: number;
          output?: number;
          cache_read?: number;
          cache_write?: number;
        };
        limit?: { context?: number };
      };
      if (!m.cost) continue;
      const hasAny =
        typeof m.cost.input === "number" ||
        typeof m.cost.output === "number" ||
        typeof m.cost.cache_read === "number" ||
        typeof m.cost.cache_write === "number";
      if (!hasAny) continue;

      const shortId = modelKey.includes("/") ? modelKey.split("/").pop() ?? modelKey : modelKey;
      const pricing: PricingOverride = {};
      if (typeof m.cost.input === "number") pricing.inputCostPerToken = m.cost.input / M;
      if (typeof m.cost.output === "number") pricing.outputCostPerToken = m.cost.output / M;
      if (typeof m.cost.cache_write === "number") pricing.cacheCreationInputTokenCost = m.cost.cache_write / M;
      if (typeof m.cost.cache_read === "number") pricing.cacheReadInputTokenCost = m.cost.cache_read / M;
      if (typeof m.limit?.context === "number" && m.limit.context > 0) {
        pricing.maxInputTokens = Math.round(m.limit.context);
      }

      const rank = providerRank + (modelKey.includes("/") ? 20 : 0);
      const existing = into.get(shortId);
      if (!existing || rank < existing.rank) {
        into.set(shortId, {
          rank,
          item: {
            id: shortId,
            provider: providerKey,
            source: "models.dev",
            pricing,
          },
        });
      }
    }
  }
}

function extractLitellmCatalog(data: unknown, into: Map<string, { rank: number; item: CatalogModelPricing }>) {
  if (!data || typeof data !== "object") return;

  for (const [modelKey, val] of Object.entries(data as Record<string, unknown>)) {
    if (modelKey === "sample_spec" || !val || typeof val !== "object") continue;
    const v = val as Record<string, unknown>;
    const hasAny =
      typeof v.input_cost_per_token === "number" ||
      typeof v.output_cost_per_token === "number";
    if (!hasAny) continue;

    const shortId = modelKey.includes("/") ? modelKey.split("/").pop() ?? modelKey : modelKey;
    const pricing: PricingOverride = {};
    if (typeof v.input_cost_per_token === "number") pricing.inputCostPerToken = v.input_cost_per_token;
    if (typeof v.output_cost_per_token === "number") pricing.outputCostPerToken = v.output_cost_per_token;
    if (typeof v.cache_creation_input_token_cost === "number") {
      pricing.cacheCreationInputTokenCost = v.cache_creation_input_token_cost;
    }
    if (typeof v.cache_read_input_token_cost === "number") {
      pricing.cacheReadInputTokenCost = v.cache_read_input_token_cost;
    }
    if (typeof v.input_cost_per_token_above_200k_tokens === "number") {
      pricing.inputCostPerTokenAbove200kTokens = v.input_cost_per_token_above_200k_tokens;
    }
    if (typeof v.output_cost_per_token_above_200k_tokens === "number") {
      pricing.outputCostPerTokenAbove200kTokens = v.output_cost_per_token_above_200k_tokens;
    }
    if (typeof v.cache_creation_input_token_cost_above_200k_tokens === "number") {
      pricing.cacheCreationInputTokenCostAbove200kTokens = v.cache_creation_input_token_cost_above_200k_tokens;
    }
    if (typeof v.cache_creation_input_token_cost_above_1hr === "number") {
      pricing.cacheCreationInputTokenCostAbove1hr = v.cache_creation_input_token_cost_above_1hr;
    }
    if (typeof v.cache_read_input_token_cost_above_200k_tokens === "number") {
      pricing.cacheReadInputTokenCostAbove200kTokens = v.cache_read_input_token_cost_above_200k_tokens;
    }
    if (typeof v.max_input_tokens === "number" && v.max_input_tokens > 0) {
      pricing.maxInputTokens = Math.round(v.max_input_tokens);
    }

    const provider = typeof v.litellm_provider === "string" ? v.litellm_provider : "litellm";
    const rank = (modelKey.includes("/") ? 90 : 30) + (PREFERRED_PROVIDERS.get(provider) ?? 40);
    const existing = into.get(shortId);
    if (!existing || rank < existing.rank) {
      into.set(shortId, {
        rank,
        item: {
          id: shortId,
          provider,
          source: "litellm",
          pricing,
        },
      });
    }
  }
}

/** Read cached pricing catalogs from ccusage's http-cache for base-model cloning. */
export function getPricingCatalog(): CatalogModelPricing[] {
  const cacheDir = join(homedir(), ".cache", "ccusage", "http-cache");
  if (!existsSync(cacheDir)) {
    return BUILTIN_FALLBACK_CATALOG;
  }

  let files: string[];
  try {
    files = readdirSync(cacheDir).filter((f) => f.endsWith(".cache")).sort();
  } catch {
    return BUILTIN_FALLBACK_CATALOG;
  }

  if (files.length === 0) {
    return BUILTIN_FALLBACK_CATALOG;
  }

  const signature = files
    .map((f) => {
      try {
        return `${f}:${statSync(join(cacheDir, f)).mtimeMs}`;
      } catch {
        return f;
      }
    })
    .join("|");

  if (catalogCache && catalogCache.signature === signature) {
    return catalogCache.models;
  }

  const byId = new Map<string, { rank: number; item: CatalogModelPricing }>();

  for (const file of files) {
    const parsed = parseCachedJson(join(cacheDir, file));
    if (!parsed) continue;
    if (file.includes("models.dev")) {
      extractModelsDevCatalog(parsed, byId);
    } else if (file.includes("litellm")) {
      extractLitellmCatalog(parsed, byId);
    }
  }

  if (byId.size === 0) {
    return BUILTIN_FALLBACK_CATALOG;
  }

  const models = Array.from(byId.values())
    .sort((a, b) => a.rank - b.rank || a.item.id.localeCompare(b.item.id))
    .map((entry) => entry.item);

  catalogCache = { signature, models };
  return models;
}
