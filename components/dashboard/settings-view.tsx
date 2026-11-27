"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DAILY_RANGE_OPTIONS,
  THEME_OPTIONS,
  type DashboardPreferences,
  type ThemePreference,
} from "@/lib/preferences";
import { DesktopUpdateSettingsCard } from "./desktop-updater";
import { formatTokens, modelColor } from "@/lib/utils";
import type {
  CatalogModelPricing,
  CcusageConfig,
  CcusageCostMode,
  DailyRangePreset,
  ModelBreakdown,
  PricingOverride,
  SettingsResponse,
} from "@/lib/types";

interface SettingsViewProps {
  preferences: DashboardPreferences;
  onUpdatePreferences: (next: DashboardPreferences) => void;
  missingModels: ModelBreakdown[];
  initialModelToEdit: string | null;
  onClearInitialModel: () => void;
  onConfigSaved: () => void;
}

interface PricingFormState {
  modelName: string;
  inputPerM: string;
  outputPerM: string;
  cacheWritePerM: string;
  cacheReadPerM: string;
  inputAbove200kPerM: string;
  outputAbove200kPerM: string;
  cacheWriteAbove200kPerM: string;
  cacheWriteAbove1hrPerM: string;
  cacheReadAbove200kPerM: string;
  maxInputTokens: string;
  fastMultiplier: string;
  flexMultiplier: string;
}

const EMPTY_FORM: PricingFormState = {
  modelName: "",
  inputPerM: "",
  outputPerM: "",
  cacheWritePerM: "",
  cacheReadPerM: "",
  inputAbove200kPerM: "",
  outputAbove200kPerM: "",
  cacheWriteAbove200kPerM: "",
  cacheWriteAbove1hrPerM: "",
  cacheReadAbove200kPerM: "",
  maxInputTokens: "",
  fastMultiplier: "",
  flexMultiplier: "",
};

const M = 1_000_000;

const COST_MODES: ReadonlyArray<{ value: CcusageCostMode; label: string; hint: string }> = [
  { value: "auto", label: "Auto", hint: "Use precalculated cost when present, else calculate" },
  { value: "calculate", label: "Calculate", hint: "Always calculate from token counts & pricing" },
  { value: "display", label: "Display", hint: "Use precalculated cost fields only" },
];

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const SCALE_FACTORS = [0.5, 1.25, 1.5, 2];

function formatPerM(perToken?: number): string {
  if (perToken === undefined || !Number.isFinite(perToken)) return "";
  return Number((perToken * M).toPrecision(10)).toString();
}

function formatRawNum(val?: number): string {
  if (val === undefined || !Number.isFinite(val)) return "";
  return Number(val.toPrecision(10)).toString();
}

function pricingToForm(modelName: string, p?: PricingOverride): PricingFormState {
  if (!p) return { ...EMPTY_FORM, modelName };
  return {
    modelName,
    inputPerM: formatPerM(p.inputCostPerToken),
    outputPerM: formatPerM(p.outputCostPerToken),
    cacheWritePerM: formatPerM(p.cacheCreationInputTokenCost),
    cacheReadPerM: formatPerM(p.cacheReadInputTokenCost),
    inputAbove200kPerM: formatPerM(p.inputCostPerTokenAbove200kTokens),
    outputAbove200kPerM: formatPerM(p.outputCostPerTokenAbove200kTokens),
    cacheWriteAbove200kPerM: formatPerM(p.cacheCreationInputTokenCostAbove200kTokens),
    cacheWriteAbove1hrPerM: formatPerM(p.cacheCreationInputTokenCostAbove1hr),
    cacheReadAbove200kPerM: formatPerM(p.cacheReadInputTokenCostAbove200kTokens),
    maxInputTokens: p.maxInputTokens !== undefined ? String(p.maxInputTokens) : "",
    fastMultiplier: formatRawNum(p.fastMultiplier),
    flexMultiplier: formatRawNum(p.flexMultiplier),
  };
}

function parseNonNegativeDecimal(raw: string): number | undefined | null {
  const trimmed = raw.trim().replace(",", ".");
  if (!trimmed) return undefined;
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num < 0) return null;
  return num;
}

function formToPricing(form: PricingFormState): {
  pricing?: PricingOverride;
  errors: Partial<Record<keyof PricingFormState, string>>;
} {
  const errors: Partial<Record<keyof PricingFormState, string>> = {};
  const pricing: PricingOverride = {};

  if (!form.modelName.trim()) {
    errors.modelName = "Enter the exact model identifier (e.g. gemini-4-hydrogen-tiered-high).";
  }

  const perMFields: Array<[keyof PricingFormState, keyof PricingOverride, string]> = [
    ["inputPerM", "inputCostPerToken", "Input"],
    ["outputPerM", "outputCostPerToken", "Output"],
    ["cacheWritePerM", "cacheCreationInputTokenCost", "Cache Write"],
    ["cacheReadPerM", "cacheReadInputTokenCost", "Cache Read"],
    ["inputAbove200kPerM", "inputCostPerTokenAbove200kTokens", "Input >200k"],
    ["outputAbove200kPerM", "outputCostPerTokenAbove200kTokens", "Output >200k"],
    ["cacheWriteAbove200kPerM", "cacheCreationInputTokenCostAbove200kTokens", "Cache Write >200k"],
    ["cacheWriteAbove1hrPerM", "cacheCreationInputTokenCostAbove1hr", "Cache Write >1hr"],
    ["cacheReadAbove200kPerM", "cacheReadInputTokenCostAbove200kTokens", "Cache Read >200k"],
  ];

  let hasAnyRate = false;
  for (const [formKey, targetKey, label] of perMFields) {
    const parsed = parseNonNegativeDecimal(form[formKey]);
    if (parsed === null) {
      errors[formKey] = `${label} must be a non-negative number (e.g. 1.50).`;
    } else if (parsed !== undefined) {
      pricing[targetKey] = Number((parsed / M).toPrecision(12));
      hasAnyRate = true;
    }
  }

  if (form.maxInputTokens.trim()) {
    const maxTok = Number(form.maxInputTokens.trim());
    if (!Number.isInteger(maxTok) || maxTok < 0) {
      errors.maxInputTokens = "Max input tokens must be a non-negative integer.";
    } else {
      pricing.maxInputTokens = maxTok;
    }
  }

  for (const [formKey, targetKey, label] of [
    ["fastMultiplier", "fastMultiplier", "Fast multiplier"],
    ["flexMultiplier", "flexMultiplier", "Flex multiplier"],
  ] as const) {
    const parsed = parseNonNegativeDecimal(form[formKey]);
    if (parsed === null) {
      errors[formKey] = `${label} must be a non-negative number.`;
    } else if (parsed !== undefined) {
      pricing[targetKey] = parsed;
    }
  }

  if (!hasAnyRate && Object.keys(errors).length === 0) {
    errors.inputPerM = "Enter at least one token price ($ per 1M tokens).";
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }
  return { pricing, errors };
}

function scaleDecimalString(raw: string, factor: number): string {
  const parsed = parseNonNegativeDecimal(raw);
  if (parsed === undefined || parsed === null) return raw;
  return Number((parsed * factor).toPrecision(10)).toString();
}

export function SettingsView({
  preferences,
  onUpdatePreferences,
  missingModels,
  initialModelToEdit,
  onClearInitialModel,
  onConfigSaved,
}: SettingsViewProps) {
  const formHeadingId = useId();
  const baseSearchId = useId();
  const modelNameRef = useRef<HTMLInputElement | null>(null);
  const inputPriceRef = useRef<HTMLInputElement | null>(null);

  const [settingsData, setSettingsData] = useState<SettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Model pricing form state
  const [form, setForm] = useState<PricingFormState>(EMPTY_FORM);
  const [editingOriginalName, setEditingOriginalName] = useState<string | null>(null);
  const [touchedFields, setTouchedFields] = useState<Partial<Record<keyof PricingFormState, boolean>>>({});
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof PricingFormState, string>>>({});
  const [baseSearch, setBaseSearch] = useState("");
  const [copiedFromLabel, setCopiedFromLabel] = useState<string | null>(null);
  const [showAdvancedPricing, setShowAdvancedPricing] = useState(false);

  // CLI defaults state
  const [cliMode, setCliMode] = useState<CcusageCostMode>("auto");
  const [cliTimezone, setCliTimezone] = useState("");
  const [cliStartOfWeek, setCliStartOfWeek] = useState("");
  const [cliOffline, setCliOffline] = useState(false);

  // Raw JSON editor state
  const [rawJson, setRawJson] = useState("");

  const syncFromConfig = useCallback((data: SettingsResponse) => {
    setSettingsData(data);
    setRawJson(data.rawJson);
    const d = data.config.defaults;
    setCliMode((d?.mode as CcusageCostMode) || "auto");
    setCliTimezone(typeof d?.timezone === "string" ? d.timezone : "");
    setCliStartOfWeek(typeof d?.startOfWeek === "string" ? d.startOfWeek : "");
    setCliOffline(Boolean(d?.offline));
  }, []);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/settings");
      const body = (await res.json()) as SettingsResponse & { error?: string };
      if (!res.ok) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      syncFromConfig(body);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, [syncFromConfig]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings")
      .then(async (res) => {
        const body = (await res.json()) as SettingsResponse & { error?: string };
        if (!res.ok) {
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        return body;
      })
      .then((body) => {
        if (cancelled) return;
        syncFromConfig(body);
        if (initialModelToEdit) {
          const existing = body.config.defaults?.pricingOverrides?.[initialModelToEdit];
          setForm(pricingToForm(initialModelToEdit, existing));
          setEditingOriginalName(existing ? initialModelToEdit : null);
          setTouchedFields({});
          setFormErrors({});
          setCopiedFromLabel(null);
          const stem = initialModelToEdit.split("-").slice(0, 3).join("-");
          setBaseSearch(stem);
          onClearInitialModel();
          setTimeout(() => {
            inputPriceRef.current?.focus();
          }, 50);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load settings");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [syncFromConfig, initialModelToEdit, onClearInitialModel]);

  const configuredOverrides = useMemo(
    () => settingsData?.config.defaults?.pricingOverrides ?? {},
    [settingsData]
  );

  const combinedCatalog = useMemo<CatalogModelPricing[]>(() => {
    const customEntries: CatalogModelPricing[] = Object.entries(configuredOverrides).map(
      ([id, pricing]) => ({
        id,
        provider: "override",
        source: "builtin",
        pricing,
      })
    );
    const catalog = settingsData?.catalogModels ?? [];
    const seen = new Set(customEntries.map((e) => e.id));
    return [...customEntries, ...catalog.filter((c) => !seen.has(c.id))];
  }, [configuredOverrides, settingsData]);

  const matchingBaseModels = useMemo(() => {
    const q = baseSearch.trim().toLowerCase();
    if (!q) {
      return combinedCatalog.slice(0, 12);
    }
    const tokens = q.split(/\s+/).filter(Boolean);
    const scored: Array<{ score: number; item: CatalogModelPricing }> = [];
    for (const item of combinedCatalog) {
      const hay = `${item.id} ${item.provider}`.toLowerCase();
      if (!tokens.every((t) => hay.includes(t))) continue;
      let score = 10;
      if (item.id.toLowerCase() === q) score = 0;
      else if (item.id.toLowerCase().startsWith(q)) score = 1;
      else if (item.provider === "override") score = 2;
      else if (item.id.toLowerCase().includes(q)) score = 4;
      scored.push({ score, item });
    }
    scored.sort((a, b) => a.score - b.score || a.item.id.length - b.item.id.length);
    return scored.slice(0, 15).map((s) => s.item);
  }, [baseSearch, combinedCatalog]);

  async function saveStructuredConfig(nextConfig: CcusageConfig, successText: string) {
    setSaving(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "structured", config: nextConfig }),
      });
      const body = (await res.json()) as SettingsResponse & { error?: string };
      if (!res.ok) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setSettingsData((prev) =>
        prev
          ? {
              ...prev,
              configPath: body.configPath,
              configExists: true,
              config: body.config,
              rawJson: body.rawJson,
            }
          : body
      );
      setRawJson(body.rawJson);
      setStatusMessage({ type: "success", text: successText });
      onConfigSaved();
    } catch (err) {
      setStatusMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to save settings",
      });
    } finally {
      setSaving(false);
    }
  }

  function handleFieldChange(field: keyof PricingFormState, value: string) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (formErrors[field]) {
        const { errors } = formToPricing(next);
        setFormErrors((prevErr) => ({ ...prevErr, [field]: errors[field] }));
      }
      return next;
    });
  }

  function handleFieldBlur(field: keyof PricingFormState) {
    setTouchedFields((prev) => ({ ...prev, [field]: true }));
    const { errors } = formToPricing(form);
    setFormErrors((prev) => ({ ...prev, [field]: errors[field] }));
  }

  function handleSelectBaseModel(model: CatalogModelPricing) {
    const template = pricingToForm(form.modelName, model.pricing);
    setForm(template);
    setCopiedFromLabel(`${model.id} (${model.provider})`);
    setFormErrors({});
    if (
      model.pricing.inputCostPerTokenAbove200kTokens !== undefined ||
      model.pricing.outputCostPerTokenAbove200kTokens !== undefined ||
      model.pricing.cacheCreationInputTokenCostAbove1hr !== undefined ||
      model.pricing.maxInputTokens !== undefined
    ) {
      setShowAdvancedPricing(true);
    }
  }

  function handleScalePrices(factor: number) {
    setForm((prev) => ({
      ...prev,
      inputPerM: scaleDecimalString(prev.inputPerM, factor),
      outputPerM: scaleDecimalString(prev.outputPerM, factor),
      cacheWritePerM: scaleDecimalString(prev.cacheWritePerM, factor),
      cacheReadPerM: scaleDecimalString(prev.cacheReadPerM, factor),
      inputAbove200kPerM: scaleDecimalString(prev.inputAbove200kPerM, factor),
      outputAbove200kPerM: scaleDecimalString(prev.outputAbove200kPerM, factor),
      cacheWriteAbove200kPerM: scaleDecimalString(prev.cacheWriteAbove200kPerM, factor),
      cacheWriteAbove1hrPerM: scaleDecimalString(prev.cacheWriteAbove1hrPerM, factor),
      cacheReadAbove200kPerM: scaleDecimalString(prev.cacheReadAbove200kPerM, factor),
    }));
  }

  function handlePickMissingModel(modelName: string) {
    const existing = configuredOverrides[modelName];
    setForm(pricingToForm(modelName, existing));
    setEditingOriginalName(existing ? modelName : null);
    setTouchedFields({});
    setFormErrors({});
    setCopiedFromLabel(null);
    const stem = modelName.split("-").slice(0, 3).join("-");
    setBaseSearch(stem);
    setTimeout(() => {
      inputPriceRef.current?.focus();
    }, 30);
  }

  function handleEditOverride(modelName: string) {
    const existing = configuredOverrides[modelName];
    setForm(pricingToForm(modelName, existing));
    setEditingOriginalName(modelName);
    setTouchedFields({});
    setFormErrors({});
    setCopiedFromLabel(null);
    if (
      existing?.inputCostPerTokenAbove200kTokens !== undefined ||
      existing?.outputCostPerTokenAbove200kTokens !== undefined ||
      existing?.cacheCreationInputTokenCostAbove1hr !== undefined ||
      existing?.maxInputTokens !== undefined ||
      existing?.fastMultiplier !== undefined ||
      existing?.flexMultiplier !== undefined
    ) {
      setShowAdvancedPricing(true);
    }
    modelNameRef.current?.focus();
  }

  async function handleDeleteOverride(modelName: string) {
    if (!settingsData) return;
    const nextOverrides = { ...(settingsData.config.defaults?.pricingOverrides ?? {}) };
    delete nextOverrides[modelName];
    const nextConfig: CcusageConfig = {
      ...settingsData.config,
      defaults: {
        ...(settingsData.config.defaults ?? {}),
        pricingOverrides: nextOverrides,
      },
    };
    if (editingOriginalName === modelName) {
      setForm(EMPTY_FORM);
      setEditingOriginalName(null);
    }
    await saveStructuredConfig(nextConfig, `Removed pricing override for "${modelName}".`);
  }

  async function handleSaveModelPricing(e: React.FormEvent) {
    e.preventDefault();
    if (!settingsData) return;

    const { pricing, errors } = formToPricing(form);
    if (!pricing || Object.keys(errors).length > 0) {
      setFormErrors(errors);
      setTouchedFields({
        modelName: true,
        inputPerM: true,
        outputPerM: true,
        cacheWritePerM: true,
        cacheReadPerM: true,
      });
      if (errors.modelName) {
        modelNameRef.current?.focus();
      } else {
        inputPriceRef.current?.focus();
      }
      return;
    }

    const trimmedName = form.modelName.trim();
    const nextOverrides = { ...(settingsData.config.defaults?.pricingOverrides ?? {}) };
    if (editingOriginalName && editingOriginalName !== trimmedName) {
      delete nextOverrides[editingOriginalName];
    }
    nextOverrides[trimmedName] = pricing;

    const nextConfig: CcusageConfig = {
      ...settingsData.config,
      defaults: {
        ...(settingsData.config.defaults ?? {}),
        pricingOverrides: nextOverrides,
      },
    };

    await saveStructuredConfig(nextConfig, `Saved pricing for "${trimmedName}" to ccusage.json.`);
    setForm(EMPTY_FORM);
    setEditingOriginalName(null);
    setTouchedFields({});
    setFormErrors({});
    setCopiedFromLabel(null);
  }

  async function handleSaveCliDefaults(e: React.FormEvent) {
    e.preventDefault();
    if (!settingsData) return;
    const nextDefaults = { ...(settingsData.config.defaults ?? {}) };
    nextDefaults.mode = cliMode;
    if (cliTimezone.trim()) {
      nextDefaults.timezone = cliTimezone.trim();
    } else {
      delete nextDefaults.timezone;
    }
    if (cliStartOfWeek) {
      nextDefaults.startOfWeek = cliStartOfWeek;
    } else {
      delete nextDefaults.startOfWeek;
    }
    if (cliOffline) {
      nextDefaults.offline = true;
    } else {
      delete nextDefaults.offline;
    }

    const nextConfig: CcusageConfig = {
      ...settingsData.config,
      defaults: nextDefaults,
    };
    await saveStructuredConfig(nextConfig, "Saved ccusage CLI defaults.");
  }

  async function handleSaveRawJson(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "raw", rawJson }),
      });
      const body = (await res.json()) as SettingsResponse & { error?: string };
      if (!res.ok) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setSettingsData((prev) =>
        prev
          ? {
              ...prev,
              configPath: body.configPath,
              configExists: true,
              config: body.config,
              rawJson: body.rawJson,
            }
          : body
      );
      syncFromConfig({
        ...(settingsData as SettingsResponse),
        configPath: body.configPath,
        configExists: true,
        config: body.config,
        rawJson: body.rawJson,
      });
      setStatusMessage({ type: "success", text: "Saved raw ccusage.json." });
      onConfigSaved();
    } catch (err) {
      setStatusMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to save raw JSON",
      });
    } finally {
      setSaving(false);
    }
  }

  const overrideEntries = Object.entries(configuredOverrides);

  return (
    <div className="space-y-5">
      {/* Live status region */}
      <div role="status" aria-live="polite" className={statusMessage ? "" : "visually-hidden"}>
        {statusMessage && (
          <div
            className={[
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs",
              statusMessage.type === "success"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-destructive/40 bg-destructive/10 text-destructive",
            ].join(" ")}
          >
            {statusMessage.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}
      </div>

      {/* 1. Dashboard UI Preferences */}
      <DesktopUpdateSettingsCard />

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-medium">Dashboard Preferences</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-muted-foreground">
              Appearance theme
            </legend>
            <div className="flex flex-wrap gap-2">
              {THEME_OPTIONS.map((opt) => {
                const checked = preferences.theme === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={[
                      "inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                      checked
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                    ].join(" ")}
                  >
                    <input
                      type="radio"
                      name="themePreference"
                      value={opt.value}
                      checked={checked}
                      onChange={() =>
                        onUpdatePreferences({
                          ...preferences,
                          theme: opt.value as ThemePreference,
                        })
                      }
                      className="visually-hidden"
                    />
                    <span>{opt.label}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-muted-foreground">
              Default Daily chart &amp; breakdown range
            </legend>
            <div className="flex flex-wrap gap-2">
              {DAILY_RANGE_OPTIONS.map((opt) => {
                const checked = preferences.defaultDailyRange === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={[
                      "inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                      checked
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                    ].join(" ")}
                  >
                    <input
                      type="radio"
                      name="defaultDailyRange"
                      value={opt.value}
                      checked={checked}
                      onChange={() =>
                        onUpdatePreferences({
                          ...preferences,
                          defaultDailyRange: opt.value as DailyRangePreset,
                        })
                      }
                      className="visually-hidden"
                    />
                    <span>{opt.description}</span>
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Applies automatically when opening the Daily tab. Saved locally in your browser.
            </p>
          </fieldset>
        </CardContent>
      </Card>

      {/* 2. Detected Models Without Pricing */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <span>Detected Models Without Pricing</span>
              {missingModels.length > 0 && (
                <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30 font-mono text-xs">
                  {missingModels.length}
                </Badge>
              )}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {missingModels.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              All models in your loaded usage reports have pricing data.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                These models returned <code className="font-mono">missingPricing: true</code> from{" "}
                <code className="font-mono">ccusage</code> and currently show $0.0000 cost.
              </p>
              <div className="divide-y divide-border rounded-lg border">
                {missingModels.map((m) => (
                  <div
                    key={m.modelName}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: modelColor(m.modelName) }}
                      />
                      <span className="font-mono font-medium truncate">{m.modelName}</span>
                      <span className="text-muted-foreground font-mono">
                        ({formatTokens(m.inputTokens)} in · {formatTokens(m.outputTokens)} out ·{" "}
                        {formatTokens(m.cacheReadTokens)} cache)
                      </span>
                    </div>
                    <Button
                      type="button"
                      size="xs"
                      variant="secondary"
                      onClick={() => handlePickMissingModel(m.modelName)}
                    >
                      <Plus className="h-3 w-3" />
                      Set price
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. Model Pricing Overrides Editor */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle id={formHeadingId} className="text-sm font-medium">
              Model Pricing Overrides
            </CardTitle>
            {settingsData && (
              <span className="text-[11px] font-mono text-muted-foreground">
                {settingsData.configPath}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-5">
          {loading ? (
            <p className="text-xs text-muted-foreground">Loading ccusage configuration…</p>
          ) : loadError ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              {loadError}
            </div>
          ) : (
            <>
              {/* Configured overrides list */}
              {overrideEntries.length > 0 && (
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Model</TableHead>
                        <TableHead className="text-right">Input / 1M</TableHead>
                        <TableHead className="text-right">Output / 1M</TableHead>
                        <TableHead className="text-right hidden sm:table-cell">Cache Write</TableHead>
                        <TableHead className="text-right hidden sm:table-cell">Cache Read</TableHead>
                        <TableHead className="text-right w-[90px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overrideEntries.map(([name, p]) => (
                        <TableRow key={name}>
                          <TableCell className="font-mono text-xs font-medium">
                            <div className="flex items-center gap-2">
                              <span
                                aria-hidden="true"
                                className="h-2 w-2 rounded-full shrink-0"
                                style={{ backgroundColor: modelColor(name) }}
                              />
                              <span className="truncate">{name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {p.inputCostPerToken !== undefined ? `$${formatPerM(p.inputCostPerToken)}` : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {p.outputCostPerToken !== undefined ? `$${formatPerM(p.outputCostPerToken)}` : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs hidden sm:table-cell">
                            {p.cacheCreationInputTokenCost !== undefined
                              ? `$${formatPerM(p.cacheCreationInputTokenCost)}`
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs hidden sm:table-cell">
                            {p.cacheReadInputTokenCost !== undefined
                              ? `$${formatPerM(p.cacheReadInputTokenCost)}`
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex items-center gap-1">
                              <Button
                                type="button"
                                size="icon-xs"
                                variant="ghost"
                                aria-label={`Edit ${name}`}
                                onClick={() => handleEditOverride(name)}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                type="button"
                                size="icon-xs"
                                variant="ghost"
                                aria-label={`Delete ${name}`}
                                disabled={saving}
                                onClick={() => handleDeleteOverride(name)}
                              >
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Add / Edit pricing form */}
              <form
                onSubmit={handleSaveModelPricing}
                aria-labelledby={formHeadingId}
                noValidate
                className="space-y-4 rounded-lg border bg-background/40 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {editingOriginalName ? `Edit: ${editingOriginalName}` : "Add or override model price"}
                  </h3>
                  {editingOriginalName && (
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      onClick={() => {
                        setForm(EMPTY_FORM);
                        setEditingOriginalName(null);
                        setFormErrors({});
                        setCopiedFromLabel(null);
                      }}
                    >
                      Cancel edit
                    </Button>
                  )}
                </div>

                {/* Model identifier */}
                <div className="space-y-1.5">
                  <label htmlFor="pricing-model-name" className="block text-xs font-medium">
                    Raw model name <span aria-hidden="true">*</span>
                  </label>
                  <input
                    ref={modelNameRef}
                    id="pricing-model-name"
                    name="modelName"
                    type="text"
                    required
                    value={form.modelName}
                    onChange={(e) => handleFieldChange("modelName", e.target.value)}
                    onBlur={() => handleFieldBlur("modelName")}
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="e.g. gemini-4-hydrogen-tiered-xhigh"
                    aria-invalid={Boolean(touchedFields.modelName && formErrors.modelName)}
                    aria-describedby={
                      formErrors.modelName ? "pricing-model-name-err" : "pricing-model-name-help"
                    }
                    className="h-9 w-full rounded-md border border-input bg-background px-3 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring aria-[invalid=true]:border-destructive"
                  />
                  {touchedFields.modelName && formErrors.modelName ? (
                    <p id="pricing-model-name-err" className="text-xs text-destructive">
                      {formErrors.modelName}
                    </p>
                  ) : (
                    <p id="pricing-model-name-help" className="text-[11px] text-muted-foreground">
                      Must match the exact <code className="font-mono">modelName</code> reported by ccusage.
                    </p>
                  )}
                </div>

                {/* Base model template picker */}
                <div className="space-y-2 rounded-md border border-border/80 bg-card/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label
                      htmlFor={baseSearchId}
                      className="text-xs font-medium flex items-center gap-1.5"
                    >
                      <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>Copy rates from existing model (optional)</span>
                    </label>
                    {copiedFromLabel && (
                      <Badge variant="secondary" className="font-mono text-[11px]">
                        Based on {copiedFromLabel}
                      </Badge>
                    )}
                  </div>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      id={baseSearchId}
                      type="search"
                      value={baseSearch}
                      onChange={(e) => setBaseSearch(e.target.value)}
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder="Search models.dev / LiteLLM / overrides (e.g. gemini-4-hydrogen, opus)..."
                      className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  <div className="max-h-36 overflow-y-auto divide-y divide-border/60 rounded border bg-background">
                    {matchingBaseModels.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-muted-foreground">No matching models found.</p>
                    ) : (
                      matchingBaseModels.map((item) => (
                        <button
                          key={`${item.source}:${item.provider}:${item.id}`}
                          type="button"
                          onClick={() => handleSelectBaseModel(item)}
                          className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-muted/70 transition-colors"
                        >
                          <span className="font-mono truncate">
                            {item.id}{" "}
                            <span className="text-[11px] text-muted-foreground">
                              ({item.provider})
                            </span>
                          </span>
                          <span className="font-mono text-[11px] text-muted-foreground shrink-0">
                            in ${formatPerM(item.pricing.inputCostPerToken) || "0"} · out $
                            {formatPerM(item.pricing.outputCostPerToken) || "0"}
                          </span>
                        </button>
                      ))
                    )}
                  </div>

                  {/* Quick multiplier controls */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="text-[11px] text-muted-foreground mr-1">
                      Scale current rates:
                    </span>
                    {SCALE_FACTORS.map((factor) => (
                      <Button
                        key={factor}
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() => handleScalePrices(factor)}
                      >
                        ×{factor}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Primary 4 pricing fields ($ / 1M tokens) */}
                <fieldset className="space-y-2">
                  <legend className="text-xs font-medium text-muted-foreground">
                    Token rates (USD per 1M tokens)
                  </legend>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {(
                      [
                        {
                          key: "inputPerM",
                          label: "Input ($/1M)",
                          placeholder: "1.50",
                          ref: inputPriceRef,
                        },
                        {
                          key: "outputPerM",
                          label: "Output ($/1M)",
                          placeholder: "7.50",
                        },
                        {
                          key: "cacheWritePerM",
                          label: "Cache Write ($/1M)",
                          placeholder: "1.875",
                        },
                        {
                          key: "cacheReadPerM",
                          label: "Cache Read ($/1M)",
                          placeholder: "0.075",
                        },
                      ] as const
                    ).map((field) => {
                      const err = touchedFields[field.key] ? formErrors[field.key] : undefined;
                      const inputId = `pricing-${field.key}`;
                      return (
                        <div key={field.key} className="space-y-1">
                          <label htmlFor={inputId} className="block text-xs font-medium">
                            {field.label}
                          </label>
                          <input
                            ref={"ref" in field ? field.ref : undefined}
                            id={inputId}
                            name={field.key}
                            type="text"
                            inputMode="decimal"
                            value={form[field.key]}
                            onChange={(e) => handleFieldChange(field.key, e.target.value)}
                            onBlur={() => handleFieldBlur(field.key)}
                            placeholder={field.placeholder}
                            aria-invalid={Boolean(err)}
                            aria-describedby={err ? `${inputId}-err` : undefined}
                            className="h-9 w-full rounded-md border border-input bg-background px-2.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring aria-[invalid=true]:border-destructive"
                          />
                          {err && (
                            <p id={`${inputId}-err`} className="text-[11px] text-destructive">
                              {err}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </fieldset>

                {/* Collapsible advanced tiered pricing */}
                <details
                  open={showAdvancedPricing}
                  onToggle={(e) => setShowAdvancedPricing(e.currentTarget.open)}
                  className="rounded-md border border-border/70 px-3 py-2"
                >
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground select-none">
                    Advanced tiered pricing (&gt;200k context, &gt;1hr cache, multipliers)
                  </summary>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {(
                      [
                        { key: "inputAbove200kPerM", label: "Input >200k ($/1M)" },
                        { key: "outputAbove200kPerM", label: "Output >200k ($/1M)" },
                        { key: "cacheWriteAbove200kPerM", label: "Cache Write >200k ($/1M)" },
                        { key: "cacheWriteAbove1hrPerM", label: "Cache Write >1hr ($/1M)" },
                        { key: "cacheReadAbove200kPerM", label: "Cache Read >200k ($/1M)" },
                        { key: "maxInputTokens", label: "Max Input Tokens" },
                        { key: "fastMultiplier", label: "Fast Multiplier" },
                        { key: "flexMultiplier", label: "Flex Multiplier" },
                      ] as const
                    ).map((field) => {
                      const err = touchedFields[field.key] ? formErrors[field.key] : undefined;
                      const inputId = `pricing-${field.key}`;
                      return (
                        <div key={field.key} className="space-y-1">
                          <label htmlFor={inputId} className="block text-xs text-muted-foreground">
                            {field.label}
                          </label>
                          <input
                            id={inputId}
                            name={field.key}
                            type="text"
                            inputMode={field.key === "maxInputTokens" ? "numeric" : "decimal"}
                            value={form[field.key]}
                            onChange={(e) => handleFieldChange(field.key, e.target.value)}
                            onBlur={() => handleFieldBlur(field.key)}
                            aria-invalid={Boolean(err)}
                            aria-describedby={err ? `${inputId}-err` : undefined}
                            className="h-8 w-full rounded-md border border-input bg-background px-2.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring aria-[invalid=true]:border-destructive"
                          />
                          {err && (
                            <p id={`${inputId}-err`} className="text-[11px] text-destructive">
                              {err}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </details>

                <div className="flex items-center justify-end gap-2">
                  <Button type="submit" size="sm" disabled={saving}>
                    <Save className="h-3.5 w-3.5" />
                    {saving
                      ? "Saving…"
                      : editingOriginalName
                        ? "Update Model Pricing"
                        : "Save Model Pricing"}
                  </Button>
                </div>
              </form>
            </>
          )}
        </CardContent>
      </Card>

      {/* 4. ccusage CLI Defaults */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-medium">ccusage CLI Defaults</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <form onSubmit={handleSaveCliDefaults} className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-muted-foreground">Cost calculation mode</legend>
              <div className="flex flex-wrap gap-2">
                {COST_MODES.map((m) => {
                  const checked = cliMode === m.value;
                  return (
                    <label
                      key={m.value}
                      title={m.hint}
                      className={[
                        "inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                        checked
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                      ].join(" ")}
                    >
                      <input
                        type="radio"
                        name="cliCostMode"
                        value={m.value}
                        checked={checked}
                        onChange={() => setCliMode(m.value)}
                        className="visually-hidden"
                      />
                      <span>{m.label}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="cli-timezone" className="block text-xs font-medium">
                  Timezone (IANA)
                </label>
                <div className="flex gap-2">
                  <input
                    id="cli-timezone"
                    name="timezone"
                    type="text"
                    value={cliTimezone}
                    onChange={(e) => setCliTimezone(e.target.value)}
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="System default (e.g. Europe/Moscow, UTC)"
                    className="h-9 flex-1 rounded-md border border-input bg-background px-3 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setCliTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC")
                    }
                  >
                    Detect
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="cli-start-of-week" className="block text-xs font-medium">
                  Start of week
                </label>
                <select
                  id="cli-start-of-week"
                  name="startOfWeek"
                  value={cliStartOfWeek}
                  onChange={(e) => setCliStartOfWeek(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">Default (ccusage default)</option>
                  {WEEKDAYS.map((day) => (
                    <option key={day} value={day}>
                      {day[0].toUpperCase() + day.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="cli-offline"
                name="offline"
                type="checkbox"
                checked={cliOffline}
                onChange={(e) => setCliOffline(e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              <label htmlFor="cli-offline" className="text-xs">
                Offline mode (use cached pricing data without fetching remote updates)
              </label>
            </div>

            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={saving || loading || !settingsData}>
                <Save className="h-3.5 w-3.5" />
                Save CLI Defaults
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 5. Raw ccusage.json Editor */}
      <Card>
        <CardContent className="p-4">
          <details>
            <summary className="cursor-pointer text-sm font-medium select-none">
              Raw <code className="font-mono">ccusage.json</code> editor
            </summary>
            <form onSubmit={handleSaveRawJson} className="mt-3 space-y-3">
              <label htmlFor="raw-ccusage-json" className="block text-xs text-muted-foreground">
                Edit configuration JSON directly ({settingsData?.configPath ?? "ccusage.json"}):
              </label>
              <textarea
                id="raw-ccusage-json"
                name="rawJson"
                rows={12}
                value={rawJson}
                onChange={(e) => setRawJson(e.target.value)}
                spellCheck={false}
                className="w-full rounded-md border border-input bg-background p-3 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button type="button" size="sm" variant="outline" onClick={fetchSettings}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  Reload from disk
                </Button>
                <Button type="submit" size="sm" disabled={saving}>
                  <Save className="h-3.5 w-3.5" />
                  Save Raw JSON
                </Button>
              </div>
            </form>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}
