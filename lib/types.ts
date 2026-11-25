export interface ModelBreakdown {
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  cost: number;
  missingPricing?: boolean;
}

export interface DailyEntry {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  totalCost: number;
  modelsUsed: string[];
  modelBreakdowns: ModelBreakdown[];
}

export interface MonthlyEntry {
  month: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  totalCost: number;
  modelsUsed: string[];
  modelBreakdowns: ModelBreakdown[];
}

export interface WeeklyEntry {
  week: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  totalCost: number;
  modelsUsed: string[];
  modelBreakdowns: ModelBreakdown[];
}

export interface SessionEntry {
  sessionId: string;
  agent?: string;
  startTime: string | null;
  endTime?: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  totalCost: number;
  modelsUsed: string[];
  modelBreakdowns: ModelBreakdown[];
  projectPath?: string;
}

export interface BlockEntry {
  startTime: string;
  endTime: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  totalCost: number;
  modelsUsed: string[];
  modelBreakdowns: ModelBreakdown[];
  isActive?: boolean;
  durationMinutes?: number;
}

export interface Totals {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  totalCost: number;
}

export interface DailyResponse {
  daily: DailyEntry[];
  totals?: Totals;
}

export interface MonthlyResponse {
  monthly: MonthlyEntry[];
  totals?: Totals;
}

export interface WeeklyResponse {
  weekly: WeeklyEntry[];
  totals?: Totals;
}

export interface SessionResponse {
  sessions: SessionEntry[];
  totals?: Totals;
}

export interface BlocksResponse {
  blocks: BlockEntry[];
  totals?: Totals;
}

export type ViewType = "daily" | "monthly" | "weekly" | "session" | "blocks";

export type DailyRangePreset = "all" | "1d" | "7d" | "14d" | "30d";

export type CcusageCostMode = "auto" | "calculate" | "display";

export interface PricingOverride {
  inputCostPerToken?: number;
  outputCostPerToken?: number;
  cacheCreationInputTokenCost?: number;
  cacheReadInputTokenCost?: number;
  inputCostPerTokenAbove200kTokens?: number;
  outputCostPerTokenAbove200kTokens?: number;
  cacheCreationInputTokenCostAbove200kTokens?: number;
  cacheCreationInputTokenCostAbove1hr?: number;
  cacheReadInputTokenCostAbove200kTokens?: number;
  maxInputTokens?: number;
  fastMultiplier?: number;
  flexMultiplier?: number;
}

export interface CcusageDefaults {
  timezone?: string;
  mode?: CcusageCostMode;
  offline?: boolean;
  startOfWeek?: string;
  pricingOverrides?: Record<string, PricingOverride>;
  [key: string]: unknown;
}

export interface CcusageConfig {
  $schema?: string;
  defaults?: CcusageDefaults;
  [key: string]: unknown;
}

export interface CatalogModelPricing {
  id: string;
  provider: string;
  source: "models.dev" | "litellm" | "builtin";
  pricing: PricingOverride;
}

export interface SettingsResponse {
  configPath: string;
  configExists: boolean;
  config: CcusageConfig;
  rawJson: string;
  catalogModels: CatalogModelPricing[];
}
