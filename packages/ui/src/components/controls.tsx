import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { cx, useControlled } from "../cx";
import { Icon, type IconName } from "./Icon";

export function Kbd({ className, children }: { className?: string; children?: ReactNode }) {
  return <kbd className={cx("cx-kbd", className)}>{children}</kbd>;
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "outline" | "danger";
  size?: "sm" | "md";
  icon?: IconName;
  iconRight?: IconName;
  kbd?: string;
  /** Corner brackets: the single most important entry point on screen. */
  bracket?: boolean;
}

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  iconRight,
  kbd,
  bracket,
  className,
  children,
  ...rest
}: ButtonProps) {
  const iconSize = size === "sm" ? 14 : 16;
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        "cx-btn",
        `cx-btn--${variant}`,
        `cx-btn--${size}`,
        children == null && "cx-btn--icon",
        bracket && "cx-bracket",
        className,
      )}
    >
      {icon && <Icon name={icon} size={iconSize} />}
      {children != null && <span className="cx-btn__label">{children}</span>}
      {iconRight && <Icon name={iconRight} size={iconSize} />}
      {kbd && <Kbd>{kbd}</Kbd>}
    </button>
  );
}

export interface BadgeProps {
  tone?: "neutral" | "accent" | "positive" | "negative" | "info";
  dot?: boolean;
  className?: string;
  children?: ReactNode;
}

export function Badge({ tone = "neutral", dot, className, children }: BadgeProps) {
  return (
    <span className={cx("cx-badge", `cx-badge--${tone}`, className)}>
      {dot && <span className="cx-badge__dot" aria-hidden />}
      {children}
    </span>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  hint?: ReactNode;
  icon?: IconName;
  kbd?: string;
  invalid?: boolean;
}

export function Input({ label, hint, icon, kbd, invalid, className, ...rest }: InputProps) {
  return (
    <label className={cx("cx-field", invalid && "cx-field--invalid", className)}>
      {label && <span className="cx-label cx-field__label">{label}</span>}
      <span className="cx-input">
        {icon && <Icon name={icon} size={14} />}
        <input aria-invalid={invalid || undefined} {...rest} />
        {kbd && <Kbd>{kbd}</Kbd>}
      </span>
      {hint && <span className="cx-field__hint">{hint}</span>}
    </label>
  );
}

export interface SegmentedOption {
  value: string;
  label: ReactNode;
}

export interface SegmentedProps {
  options: (string | SegmentedOption)[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  size?: "sm" | "md";
  "aria-label"?: string;
  className?: string;
}

export function Segmented(props: SegmentedProps) {
  const opts = props.options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  const [value, setValue] = useControlled(
    props.value,
    props.defaultValue ?? opts[0]?.value ?? "",
    props.onChange,
  );
  return (
    <div
      className={cx("cx-seg", props.size === "sm" && "cx-seg--sm", props.className)}
      role="group"
      aria-label={props["aria-label"]}
    >
      {opts.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => setValue(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export interface ToggleProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function Toggle(props: ToggleProps) {
  const [on, setOn] = useControlled(props.checked, !!props.defaultChecked, props.onChange);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={props.disabled}
      className={cx("cx-toggle", props.className)}
      onClick={() => setOn(!on)}
    >
      <span className="cx-toggle__track" aria-hidden>
        <span className="cx-toggle__thumb" />
      </span>
      {props.label && <span className="cx-toggle__label">{props.label}</span>}
    </button>
  );
}

export type CheckboxProps = ToggleProps;

export function Checkbox(props: CheckboxProps) {
  const [on, setOn] = useControlled(props.checked, !!props.defaultChecked, props.onChange);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      disabled={props.disabled}
      className={cx("cx-check", props.className)}
      onClick={() => setOn(!on)}
    >
      <span className="cx-check__box" aria-hidden>
        {on && <Icon name="check" size={12} strokeWidth={2.25} />}
      </span>
      {props.label && <span className="cx-check__label">{props.label}</span>}
    </button>
  );
}
