import { NextRequest, NextResponse } from "next/server";
import {
  getPricingCatalog,
  readCcusageConfig,
  writeCcusageConfig,
} from "@/lib/ccusage-config";
import type { CcusageConfig } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { configPath, configExists, config, rawJson } = readCcusageConfig();
    const catalogModels = getPricingCatalog();
    return NextResponse.json({
      configPath,
      configExists,
      config,
      rawJson,
      catalogModels,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      mode?: "structured" | "raw";
      config?: CcusageConfig;
      rawJson?: string;
    };

    let nextConfig: unknown;
    if (body.mode === "raw") {
      if (typeof body.rawJson !== "string") {
        return NextResponse.json({ error: "rawJson must be a string" }, { status: 400 });
      }
      try {
        nextConfig = JSON.parse(body.rawJson) as unknown;
      } catch (e) {
        return NextResponse.json(
          { error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}` },
          { status: 400 }
        );
      }
    } else if (body.config && typeof body.config === "object") {
      nextConfig = body.config;
    } else {
      return NextResponse.json({ error: "Missing config payload" }, { status: 400 });
    }

    const saved = writeCcusageConfig(nextConfig as CcusageConfig);
    return NextResponse.json({
      ok: true,
      configPath: saved.configPath,
      configExists: true,
      config: saved.config,
      rawJson: saved.rawJson,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: detail }, { status: 400 });
  }
}
