import { lazy, Suspense, type ComponentProps } from "react";
import { SELECT_COLORS, type SelectColor } from "./colors";

/*
 * Lazy wrappers: the full catalogue is ~1 MB, so screens that only sometimes
 * show an icon (dashboard sidebar, widget headers) load it on demand.
 */
const EagerIcon = lazy(() => import("./Icon").then((m) => ({ default: m.Icon })));
const EagerPicker = lazy(() => import("./IconPicker").then((m) => ({ default: m.IconPicker })));

type IconProps = ComponentProps<typeof import("./Icon").Icon>;
type PickerProps = ComponentProps<typeof import("./IconPicker").IconPicker>;

/** Renders an icon by name once the catalogue has loaded; unknown names render nothing. */
export function LazyIcon(props: IconProps) {
  if (!props.name) return null;
  return (
    <Suspense fallback={<span className="glyph" style={{ width: props.size ?? 14, height: props.size ?? 14 }} />}>
      <EagerIcon {...props} />
    </Suspense>
  );
}

export function LazyIconPicker(props: PickerProps) {
  return (
    <Suspense fallback={null}>
      <EagerPicker {...props} />
    </Suspense>
  );
}

export { SELECT_COLORS, type SelectColor };
