/** Named palette colours (select options, icon tints). Each maps to --sel-<name> in @cortex/ui/compat.css. */
export const SELECT_COLORS = ["gray", "red", "orange", "yellow", "green", "cyan", "blue", "purple", "pink"] as const;
export type SelectColor = (typeof SELECT_COLORS)[number];
