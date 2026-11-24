import { NextRequest, NextResponse } from "next/server";
import { runCcusage } from "@/lib/ccusage";

const ALLOWED_VIEWS = ["daily", "monthly", "weekly", "session", "blocks"] as const;
type View = (typeof ALLOWED_VIEWS)[number];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeBlocks(raw: any) {
  const blocks = (raw.blocks ?? [])
    .filter((b: any) => !b.isGap)
    .map((b: any) => ({
      startTime: b.startTime,
      endTime: b.endTime,
      isActive: b.isActive ?? false,
      inputTokens: b.tokenCounts?.inputTokens ?? 0,
      outputTokens: b.tokenCounts?.outputTokens ?? 0,
      cacheCreationTokens: b.tokenCounts?.cacheCreationInputTokens ?? 0,
      cacheReadTokens: b.tokenCounts?.cacheReadInputTokens ?? 0,
      totalTokens: b.totalTokens ?? 0,
      totalCost: b.costUSD ?? 0,
      modelsUsed: b.models ?? [],
      modelBreakdowns: [],
    }));
  return { blocks };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizePeriodic(raw: any, listKey: string, labelKey: string) {
  const list = (raw[listKey] ?? []).map((e: any) => ({
    ...e,
    [labelKey]: e[labelKey] ?? e.period,
  }));
  return { [listKey]: list, totals: raw.totals };
}

interface RawSessionEntry {
  sessionId?: string;
  period?: string;
  agent?: string;
  startTime?: string | null;
  lastActivity?: string | null;
  projectPath?: string;
  metadata?: {
    lastActivity?: string | null;
    projectPath?: string;
  };
  [key: string]: unknown;
}

interface RawSessionResponse {
  sessions?: RawSessionEntry[];
  session?: RawSessionEntry[];
  totals?: unknown;
}

function normalizeSessions(raw: unknown) {
  const data = (raw ?? {}) as RawSessionResponse;
  const list = data.sessions ?? data.session ?? [];
  const sessions = list.map((s) => ({
    ...s,
    sessionId: s.sessionId ?? s.period ?? "",
    startTime: s.startTime ?? s.lastActivity ?? s.metadata?.lastActivity ?? null,
    projectPath: s.projectPath ?? s.metadata?.projectPath ?? "",
  }));
  return { sessions, totals: data.totals };
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const view = (searchParams.get("view") ?? "daily") as View;

  if (!ALLOWED_VIEWS.includes(view)) {
    return NextResponse.json({ error: "Invalid view" }, { status: 400 });
  }

  try {
    const raw = runCcusage(view);
    const data =
      view === "blocks"
        ? normalizeBlocks(raw)
        : view === "daily"
          ? normalizePeriodic(raw, "daily", "date")
          : view === "monthly"
            ? normalizePeriodic(raw, "monthly", "month")
            : view === "weekly"
              ? normalizePeriodic(raw, "weekly", "week")
              : view === "session"
                ? normalizeSessions(raw)
                : raw;
    return NextResponse.json(data);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    // Only expose internals in dev; production returns a safe generic message
    const message =
      process.env.NODE_ENV === "development"
        ? detail
        : "Failed to fetch usage data. Is ccusage installed?";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
