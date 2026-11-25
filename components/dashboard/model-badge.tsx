"use client";

import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { modelColor, shortModelName } from "@/lib/utils";

interface ModelBadgeProps {
  model: string;
  missingPricing?: boolean;
  onFixPricing?: (modelName: string) => void;
}

export function ModelBadge({ model, missingPricing, onFixPricing }: ModelBadgeProps) {
  const color = modelColor(model);

  if (missingPricing && onFixPricing) {
    return (
      <Badge
        variant="secondary"
        className="gap-1.5 px-1.5 py-0 font-mono text-xs border-amber-500/40"
        render={
          <button
            type="button"
            title={`No pricing configured for ${model}. Click to set price.`}
            onClick={(e) => {
              e.stopPropagation();
              onFixPricing(model);
            }}
            className="cursor-pointer hover:bg-amber-500/15"
          />
        }
      >
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span>{shortModelName(model)}</span>
        <AlertTriangle aria-label="Missing pricing" className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
      </Badge>
    );
  }

  return (
    <Badge
      variant="secondary"
      className="gap-1.5 px-1.5 py-0 font-mono text-xs"
      style={{ borderColor: missingPricing ? "rgb(245 158 11 / 0.45)" : color }}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span>{shortModelName(model)}</span>
      {missingPricing && (
        <AlertTriangle aria-label="Missing pricing" className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
      )}
    </Badge>
  );
}
