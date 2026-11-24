"use client";

import { useState, useCallback } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type SortDirection = "asc" | "desc";

export interface SortState<K extends string> {
  key: K;
  direction: SortDirection;
}

export type SortValue = string | number | null | undefined;

function isMissing(value: SortValue): value is null | undefined | "" {
  return value === null || value === undefined || value === "";
}

export function toTimestamp(value?: string | null): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** Default comparator: newest to oldest, placing missing timestamps last. */
export function compareTimestampsDesc(a?: string | null, b?: string | null): number {
  const aMs = toTimestamp(a);
  const bMs = toTimestamp(b);
  if (aMs === null && bMs === null) return 0;
  if (aMs === null) return 1;
  if (bMs === null) return -1;
  return bMs - aMs;
}

function compareValues(a: SortValue, b: SortValue, direction: SortDirection): number {
  const aMissing = isMissing(a);
  const bMissing = isMissing(b);
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;

  const cmp =
    typeof a === "number" && typeof b === "number"
      ? a - b
      : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });

  return direction === "asc" ? cmp : -cmp;
}

/**
 * Cycles column sort state: 1st click = asc, 2nd click = desc, 3rd click = default (null).
 */
export function useTableSort<K extends string>() {
  const [sort, setSort] = useState<SortState<K> | null>(null);

  const toggleSort = useCallback((key: K) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, direction: "asc" };
      if (prev.direction === "asc") return { key, direction: "desc" };
      return null;
    });
  }, []);

  return { sort, toggleSort };
}

export function sortRows<T, K extends string>(
  rows: readonly T[],
  sort: SortState<K> | null,
  getters: Record<K, (row: T) => SortValue>,
  defaultCompare: (a: T, b: T) => number
): T[] {
  const copy = [...rows];
  if (!sort) {
    return copy.sort(defaultCompare);
  }
  const getValue = getters[sort.key];
  return copy.sort((a, b) => {
    const cmp = compareValues(getValue(a), getValue(b), sort.direction);
    return cmp !== 0 ? cmp : defaultCompare(a, b);
  });
}

interface SortableHeadProps<K extends string> {
  column: K;
  label: string;
  sort: SortState<K> | null;
  onSort: (key: K) => void;
  align?: "left" | "right";
  className?: string;
}

export function SortableHead<K extends string>({
  column,
  label,
  sort,
  onSort,
  align = "left",
  className,
}: SortableHeadProps<K>) {
  const isActive = sort?.key === column;
  const ariaSort = isActive
    ? sort.direction === "asc"
      ? "ascending"
      : "descending"
    : "none";

  return (
    <TableHead
      aria-sort={ariaSort}
      className={cn(align === "right" && "text-right", className)}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "group inline-flex items-center gap-1 cursor-pointer select-none transition-colors hover:text-foreground",
          align === "right" && "flex-row-reverse",
          isActive ? "text-foreground" : "text-muted-foreground"
        )}
      >
        <span>{label}</span>
        {isActive ? (
          sort.direction === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5 shrink-0" />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-30 transition-opacity group-hover:opacity-75" />
        )}
      </button>
    </TableHead>
  );
}
