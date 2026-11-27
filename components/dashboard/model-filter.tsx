"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Funnel, ListChecks, ListRestart, ListX, Search, X } from "lucide-react";
import { cn, formatTokens, modelColor, shortModelName } from "@/lib/utils";
import type { ModelBreakdown } from "@/lib/types";

type ProviderId =
  | "anthropic"
  | "google"
  | "openai"
  | "deepseek"
  | "xai"
  | "meta"
  | "qwen"
  | "mistral"
  | "other";

const PROVIDER_LABELS: Record<ProviderId, string> = {
  anthropic: "Anthropic",
  google: "Google",
  openai: "OpenAI",
  deepseek: "DeepSeek",
  xai: "xAI",
  meta: "Meta",
  qwen: "Qwen",
  mistral: "Mistral",
  other: "Other",
};

function detectProvider(modelName: string): ProviderId {
  const m = modelName
    .toLowerCase()
    .replace(/^\[[^\]]+\]\s*/, "")
    .replace(/^(?:llama-?cpp|ollama|vllm|lmstudio)\//, "");

  if (
    m.includes("claude") ||
    m.includes("opus") ||
    m.includes("sonnet") ||
    m.includes("haiku") ||
    m.includes("fable")
  ) {
    return "anthropic";
  }
  if (
    m.includes("gemini") ||
    m.includes("gemma") ||
    m.includes("hydrogen") ||
    m.includes("neon") ||
    m.includes("carbon") ||
    m.includes("flash")
  ) {
    return "google";
  }
  if (
    m.includes("gpt-") ||
    m.includes("chatgpt") ||
    m.includes("codex") ||
    /(?:^|\/)o[134](?:-|$)/.test(m)
  ) {
    return "openai";
  }
  if (m.includes("deepseek")) return "deepseek";
  if (m.includes("grok")) return "xai";
  if (m.includes("llama")) return "meta";
  if (m.includes("qwen") || m.includes("qwq")) return "qwen";
  if (
    m.includes("mistral") ||
    m.includes("mixtral") ||
    m.includes("codestral") ||
    m.includes("devstral") ||
    m.includes("pixtral")
  ) {
    return "mistral";
  }
  return "other";
}

function ProviderIcon({ provider }: { provider: ProviderId }) {
  switch (provider) {
    case "anthropic":
      return (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
          <path d="M13.827 3.52h3.603L24 20.48h-3.603l-6.57-16.96zm-7.258 0h3.767L16.906 20.48h-3.674l-1.343-3.461H5.017l-1.344 3.46H0L6.57 3.522zm4.132 10.45L8.453 7.687 6.205 13.97h4.496z" />
        </svg>
      );
    case "openai":
      return (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
          <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
        </svg>
      );
    case "google":
      return (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
          <path d="M12 1.5c.38 5.26 5.24 10.12 10.5 10.5-5.26.38-10.12 5.24-10.5 10.5-.38-5.26-5.24-10.12-10.5-10.5C6.76 11.62 11.62 6.76 12 1.5z" />
        </svg>
      );
    case "xai":
      return (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      );
    default:
      return (
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5 fill-none stroke-current"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="7" y="7" width="10" height="10" rx="2" />
          <path d="M9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4" />
        </svg>
      );
  }
}

function getModelTotalTokens(b: ModelBreakdown): number {
  return b.inputTokens + b.outputTokens + b.cacheCreationTokens + b.cacheReadTokens;
}

function formatCompactCost(cost: number): string {
  if (cost >= 100) return `$${cost.toFixed(0)}`;
  if (cost >= 10) return `$${cost.toFixed(1)}`;
  if (cost >= 1) return `$${cost.toFixed(2)}`;
  return `$${cost.toFixed(3)}`;
}

interface PopoverPosition {
  top?: number;
  bottom?: number;
  right: number;
  width: number;
  maxListHeight: number;
}

function computePopoverPosition(trigger: HTMLElement): PopoverPosition {
  const rect = trigger.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(360, vw - 16);
  const right = Math.max(8, Math.min(vw - width - 8, vw - rect.right));
  const spaceBelow = vh - rect.bottom - 12;
  const spaceAbove = rect.top - 12;
  const chromeHeight = 165; // search bar + footer + padding

  if (spaceBelow >= 280 || spaceBelow >= spaceAbove) {
    return {
      top: rect.bottom + 6,
      right,
      width,
      maxListHeight: Math.max(140, Math.min(300, spaceBelow - chromeHeight)),
    };
  }
  return {
    bottom: vh - rect.top + 6,
    right,
    width,
    maxListHeight: Math.max(140, Math.min(300, spaceAbove - chromeHeight)),
  };
}

interface ModelFilterProps {
  models: ModelBreakdown[];
  excludedModels: string[];
  onChangeExcluded: (nextExcluded: string[]) => void;
}

export function ModelFilter({ models, excludedModels, onChangeExcluded }: ModelFilterProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PopoverPosition | null>(null);
  const [search, setSearch] = useState("");
  const [showSubFilters, setShowSubFilters] = useState(false);
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [providerFilter, setProviderFilter] = useState<ProviderId | "all">("all");

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const excludedSet = useMemo(() => new Set(excludedModels), [excludedModels]);
  const allModelNames = useMemo(() => models.map((m) => m.modelName), [models]);

  const selectedCount = useMemo(
    () => allModelNames.filter((name) => !excludedSet.has(name)).length,
    [allModelNames, excludedSet]
  );

  const isFiltered = selectedCount < models.length;
  const hasSubFilterActive = selectedOnly || providerFilter !== "all";

  const providersPresent = useMemo(() => {
    const seen = new Set<ProviderId>();
    for (const m of models) {
      seen.add(detectProvider(m.modelName));
    }
    return Array.from(seen);
  }, [models]);

  const visibleModels = useMemo(() => {
    const q = search.trim().toLowerCase();
    return models.filter((m) => {
      if (selectedOnly && excludedSet.has(m.modelName)) return false;
      if (providerFilter !== "all" && detectProvider(m.modelName) !== providerFilter) return false;
      if (!q) return true;
      const shortName = shortModelName(m.modelName).toLowerCase();
      return m.modelName.toLowerCase().includes(q) || shortName.includes(q);
    });
  }, [models, search, selectedOnly, providerFilter, excludedSet]);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    setPos(computePopoverPosition(triggerRef.current));
  }, []);

  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => searchInputRef.current?.focus());

    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !popoverRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  function handleToggleOpen() {
    if (open) {
      setOpen(false);
      return;
    }
    if (triggerRef.current) {
      setPos(computePopoverPosition(triggerRef.current));
    }
    setOpen(true);
  }

  function toggleModel(modelName: string) {
    const next = new Set(excludedSet);
    if (next.has(modelName)) {
      next.delete(modelName);
    } else {
      next.add(modelName);
    }
    onChangeExcluded(Array.from(next));
  }

  function handleClear() {
    onChangeExcluded(allModelNames);
  }

  function handleSelectAll() {
    if (!search.trim() && providerFilter === "all" && !selectedOnly) {
      onChangeExcluded([]);
      return;
    }
    const next = new Set(excludedSet);
    for (const m of visibleModels) {
      next.delete(m.modelName);
    }
    onChangeExcluded(Array.from(next));
  }

  function handleReset() {
    setSearch("");
    setSelectedOnly(false);
    setProviderFilter("all");
    onChangeExcluded([]);
  }

  if (models.length === 0) return null;

  const popover =
    open && pos && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Filter models"
            style={{
              position: "fixed",
              top: pos.top,
              bottom: pos.bottom,
              right: pos.right,
              width: pos.width,
              zIndex: 60,
            }}
            className="rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl"
          >
            {/* Top Search + Funnel toggle (artificialanalysis.ai style) */}
            <div className="flex items-center gap-1.5 p-2.5 pb-2">
              <div className="flex h-8 flex-1 items-center gap-2 rounded-lg border border-border/60 bg-muted/60 px-2.5 focus-within:ring-1 focus-within:ring-ring">
                <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search..."
                  aria-label="Search models"
                  className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowSubFilters((prev) => !prev)}
                aria-pressed={showSubFilters}
                aria-label="Toggle provider and selection filters"
                title="Filter by provider or selection"
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors",
                  showSubFilters || hasSubFilterActive
                    ? "border-violet-500/45 bg-violet-500/12 text-violet-600 dark:text-violet-300"
                    : "border-border/60 bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <Funnel className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Optional sub-filter pills when funnel button is toggled */}
            {showSubFilters && (
              <div className="flex flex-wrap items-center gap-1 border-b border-border/60 px-2.5 pb-2">
                <button
                  type="button"
                  onClick={() => setSelectedOnly((prev) => !prev)}
                  className={cn(
                    "rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors",
                    selectedOnly
                      ? "border-violet-500/50 bg-violet-500/15 text-violet-700 dark:text-violet-300"
                      : "border-border/60 bg-muted/40 text-muted-foreground hover:text-foreground"
                  )}
                >
                  Selected only
                </button>
                {providersPresent.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setProviderFilter("all")}
                      className={cn(
                        "rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors",
                        providerFilter === "all"
                          ? "border-foreground/30 bg-foreground/10 text-foreground"
                          : "border-border/60 bg-muted/40 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      All
                    </button>
                    {providersPresent.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setProviderFilter((cur) => (cur === p ? "all" : p))}
                        className={cn(
                          "rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors",
                          providerFilter === p
                            ? "border-foreground/30 bg-foreground/10 text-foreground"
                            : "border-border/60 bg-muted/40 text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {PROVIDER_LABELS[p]}
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}

            {/* Scrollable model list */}
            <div
              style={{ maxHeight: pos.maxListHeight }}
              className="overflow-y-auto px-1.5 py-1 space-y-0.5"
            >
              {visibleModels.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  No models match filter
                </div>
              ) : (
                visibleModels.map((m) => {
                  const isSelected = !excludedSet.has(m.modelName);
                  const provider = detectProvider(m.modelName);
                  const totalTokens = getModelTotalTokens(m);
                  const color = modelColor(m.modelName);

                  return (
                    <button
                      key={m.modelName}
                      type="button"
                      role="checkbox"
                      aria-checked={isSelected}
                      onClick={() => toggleModel(m.modelName)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs transition-colors",
                        isSelected
                          ? "hover:bg-muted/70 text-foreground"
                          : "text-muted-foreground/70 hover:bg-muted/50 hover:text-foreground"
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border border-border/60 bg-muted/70 text-foreground/85",
                            !isSelected && "opacity-55"
                          )}
                        >
                          <ProviderIcon provider={provider} />
                        </span>
                        <span className={cn("truncate font-medium", !isSelected && "opacity-70")}>
                          {shortModelName(m.modelName)}
                        </span>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {formatCompactCost(m.cost)} · {formatTokens(totalTokens)}
                        </span>
                        <span
                          aria-hidden="true"
                          className={cn(
                            "h-2.5 w-2.5 shrink-0 rounded-full transition-all",
                            isSelected
                              ? "scale-100"
                              : "scale-90 border border-muted-foreground/40 bg-transparent"
                          )}
                          style={isSelected ? { backgroundColor: color } : undefined}
                        />
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Bottom actions matching artificialanalysis.ai */}
            <div className="border-t border-border/80 bg-muted/20 p-2 space-y-1.5 rounded-b-xl">
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={selectedCount === 0}
                  className="flex items-center justify-between rounded-lg border border-border/70 bg-background/80 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-45"
                >
                  <span>Clear</span>
                  <ListX className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                <button
                  type="button"
                  onClick={handleSelectAll}
                  disabled={selectedCount === models.length}
                  className="flex items-center justify-between rounded-lg border border-border/70 bg-background/80 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-45"
                >
                  <span>Select all</span>
                  <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
              <button
                type="button"
                onClick={handleReset}
                disabled={!isFiltered && !search && !hasSubFilterActive}
                className="flex w-full items-center justify-between rounded-lg border border-border/70 bg-background/80 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-45"
              >
                <span>Reset (to default)</span>
                <ListRestart className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggleOpen}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Filter models (${selectedCount} of ${models.length} selected)`}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors select-none",
          isFiltered
            ? "border-violet-500/45 bg-violet-500/12 text-violet-700 dark:text-violet-300 hover:bg-violet-500/20"
            : open
              ? "border-foreground/30 bg-muted text-foreground"
              : "border-border bg-background/60 text-muted-foreground hover:text-foreground hover:bg-muted/60"
        )}
      >
        <Funnel className="h-3 w-3 shrink-0" />
        <span>Models</span>
        <span
          className={cn(
            "rounded px-1 py-0 font-mono text-[10px] leading-4",
            isFiltered
              ? "bg-violet-500/20 text-violet-700 dark:text-violet-200"
              : "bg-muted text-muted-foreground"
          )}
        >
          {selectedCount}/{models.length}
        </span>
      </button>
      {popover}
    </div>
  );
}
