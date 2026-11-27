import { NextRequest, NextResponse } from "next/server";
import pkg from "@/package.json";

export const dynamic = "force-dynamic";

const GITHUB_REPO = "dail45/ccusage-web";
const NPM_PACKAGE = "ccusage-webui";
const GITHUB_RELEASES_URL = `https://github.com/${GITHUB_REPO}/releases`;
const NPM_PACKAGE_URL = `https://www.npmjs.com/package/${NPM_PACKAGE}`;
const CACHE_TTL_MS = 5 * 60 * 1000;

export interface VersionInfoResponse {
  currentVersion: string;
  github: {
    version: string | null;
    url: string;
    publishedAt: string | null;
    hasUpdate: boolean;
    error?: string;
  };
  npm: {
    version: string | null;
    url: string;
    hasUpdate: boolean;
    error?: string;
  };
  checkedAt: string;
}

let cachedResponse: { data: VersionInfoResponse; expiresAt: number } | null = null;

function cleanVersion(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/^v/i, "");
  return trimmed.length > 0 ? trimmed : null;
}

function parseSemver(ver: string): { core: number[]; pre: string[] } | null {
  const [corePart, prePart] = ver.split("-", 2);
  const parts = corePart.split(".").map((n) => Number(n));
  if (parts.length === 0 || parts.some((n) => !Number.isInteger(n) || n < 0)) {
    return null;
  }
  while (parts.length < 3) parts.push(0);
  const pre = prePart ? prePart.split(".") : [];
  return { core: parts, pre };
}

function isNewerVersion(candidate: string | null, current: string): boolean {
  if (!candidate) return false;
  const a = parseSemver(candidate);
  const b = parseSemver(current);
  if (!a || !b) return candidate !== current;

  const len = Math.max(a.core.length, b.core.length);
  for (let i = 0; i < len; i++) {
    const av = a.core[i] ?? 0;
    const bv = b.core[i] ?? 0;
    if (av !== bv) return av > bv;
  }

  // Stable release > prerelease for same core
  if (a.pre.length === 0 && b.pre.length > 0) return true;
  if (a.pre.length > 0 && b.pre.length === 0) return false;
  const preLen = Math.max(a.pre.length, b.pre.length);
  for (let i = 0; i < preLen; i++) {
    const ap = a.pre[i];
    const bp = b.pre[i];
    if (ap === undefined) return false;
    if (bp === undefined) return true;
    if (ap !== bp) {
      const an = Number(ap);
      const bn = Number(bp);
      if (Number.isInteger(an) && Number.isInteger(bn)) return an > bn;
      return ap > bp;
    }
  }
  return false;
}

async function fetchGithubLatest(currentVersion: string): Promise<VersionInfoResponse["github"]> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "ccusage-webui",
      },
      signal: AbortSignal.timeout(4500),
      cache: "no-store",
    });
    if (res.status === 404) {
      return {
        version: null,
        url: GITHUB_RELEASES_URL,
        publishedAt: null,
        hasUpdate: false,
      };
    }
    if (!res.ok) {
      return {
        version: null,
        url: GITHUB_RELEASES_URL,
        publishedAt: null,
        hasUpdate: false,
        error: `HTTP ${res.status}`,
      };
    }
    const body = (await res.json()) as {
      tag_name?: string;
      html_url?: string;
      published_at?: string;
    };
    const version = cleanVersion(body.tag_name);
    return {
      version,
      url: body.html_url ?? GITHUB_RELEASES_URL,
      publishedAt: body.published_at ?? null,
      hasUpdate: isNewerVersion(version, currentVersion),
    };
  } catch (err) {
    return {
      version: null,
      url: GITHUB_RELEASES_URL,
      publishedAt: null,
      hasUpdate: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

async function fetchNpmLatest(currentVersion: string): Promise<VersionInfoResponse["npm"]> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${NPM_PACKAGE}/latest`, {
      headers: {
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(4500),
      cache: "no-store",
    });
    if (!res.ok) {
      return {
        version: null,
        url: NPM_PACKAGE_URL,
        hasUpdate: false,
        error: `HTTP ${res.status}`,
      };
    }
    const body = (await res.json()) as { version?: string };
    const version = cleanVersion(body.version);
    return {
      version,
      url: NPM_PACKAGE_URL,
      hasUpdate: isNewerVersion(version, currentVersion),
    };
  } catch (err) {
    return {
      version: null,
      url: NPM_PACKAGE_URL,
      hasUpdate: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

export async function GET(request: NextRequest) {
  const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";
  const now = Date.now();
  if (!forceRefresh && cachedResponse && cachedResponse.expiresAt > now) {
    return NextResponse.json(cachedResponse.data);
  }

  const currentVersion = cleanVersion(pkg.version) ?? "0.0.0";
  const [github, npm] = await Promise.all([
    fetchGithubLatest(currentVersion),
    fetchNpmLatest(currentVersion),
  ]);

  const data: VersionInfoResponse = {
    currentVersion,
    github,
    npm,
    checkedAt: new Date().toISOString(),
  };

  if (!github.error && !npm.error) {
    cachedResponse = { data, expiresAt: now + CACHE_TTL_MS };
  }

  return NextResponse.json(data);
}
