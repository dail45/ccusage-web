import type { NextConfig } from "next";

const standalone = process.env.NEXT_OUTPUT === "standalone";

const nextConfig: NextConfig = {
  ...(standalone
    ? {
        // Desktop (Electron) build: self-contained server in .next/standalone.
        output: "standalone" as const,
        // The native ccusage binary is not statically traceable.
        outputFileTracingIncludes: {
          "/api/**": ["./node_modules/@ccusage/**/*"],
        },
      }
    : {}),
};

export default nextConfig;
