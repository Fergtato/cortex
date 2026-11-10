import { useState } from "react";

/** Joins truthy class names. */
export function cx(...parts: unknown[]): string {
  return parts.filter(Boolean).join(" ");
}

/** Controlled when `value` is given, otherwise keeps its own state. */
export function useControlled<T>(
  value: T | undefined,
  initial: T,
  onChange?: (v: T) => void,
): [T, (v: T) => void] {
  const [own, setOwn] = useState(initial);
  const controlled = value !== undefined;
  return [
    controlled ? value : own,
    (v: T) => {
      if (!controlled) setOwn(v);
      onChange?.(v);
    },
  ];
}
