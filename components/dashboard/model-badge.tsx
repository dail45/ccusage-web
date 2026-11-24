"use client";

import { Badge } from "@/components/ui/badge";
import { modelColor, shortModelName } from "@/lib/utils";

export function ModelBadge({ model }: { model: string }) {
  const color = modelColor(model);
  return (
    <Badge
      variant="secondary"
      className="gap-1.5 px-1.5 py-0 font-mono text-xs"
      style={{ borderColor: color }}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span>{shortModelName(model)}</span>
    </Badge>
  );
}
