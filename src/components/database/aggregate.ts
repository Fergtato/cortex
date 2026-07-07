import type { AggOp, CellValue } from "../../types";

export const AGG_OPS: { value: AggOp; label: string }[] = [
  { value: "count", label: "count" },
  { value: "filled", label: "filled" },
  { value: "empty", label: "empty" },
  { value: "sum", label: "sum" },
  { value: "avg", label: "avg" },
  { value: "min", label: "min" },
  { value: "max", label: "max" },
];

function isEmpty(v: CellValue): boolean {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

function numbers(values: CellValue[]): number[] {
  return values
    .filter((v) => !isEmpty(v))
    .map((v) => Number(v))
    .filter((n) => !Number.isNaN(n));
}

function fmt(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** Compute one footer aggregation over a column's values. */
export function aggregate(op: AggOp, values: CellValue[]): string {
  switch (op) {
    case "count":
      return String(values.length);
    case "filled":
      return String(values.filter((v) => !isEmpty(v)).length);
    case "empty":
      return String(values.filter((v) => isEmpty(v)).length);
    case "sum":
      return fmt(numbers(values).reduce((a, b) => a + b, 0));
    case "avg": {
      const ns = numbers(values);
      return ns.length ? fmt(ns.reduce((a, b) => a + b, 0) / ns.length) : "—";
    }
    case "min": {
      const ns = numbers(values);
      return ns.length ? fmt(Math.min(...ns)) : "—";
    }
    case "max": {
      const ns = numbers(values);
      return ns.length ? fmt(Math.max(...ns)) : "—";
    }
  }
}
