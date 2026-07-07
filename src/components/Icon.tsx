import type { ComponentType } from "react";
import {
  Icon as LucideLabIcon,
  type LucideProps,
  FileText,
  Folder,
  Book,
  Bookmark,
  Star,
  Home,
  Hammer,
  Wrench,
  Settings,
  Lightbulb,
  Flame,
  Zap,
  Sparkles,
  Sun,
  Moon,
  Leaf,
  Trees,
  Target,
  Palette,
  Film,
  Gamepad2,
  Music,
  Camera,
  GraduationCap,
  FlaskConical,
  Microscope,
  Telescope,
  Laptop,
  Monitor,
  Smartphone,
  Database,
  Lock,
  Key,
  Shield,
  Box,
  TrendingUp,
  Wallet,
  Receipt,
  CreditCard,
  ShoppingCart,
  Banknote,
  PiggyBank,
  Plane,
  Rocket,
  Car,
  Bike,
  Heart,
  Check,
  Flag,
  Calendar,
  Clock,
  Brain,
  Terminal,
  Code,
  Globe,
  Map,
  Compass,
  List,
  Dumbbell,
} from "lucide-react";
import {
  barn,
  cabin,
  cactus,
  coffee,
  farm,
  floppyDisk,
  forkKnife,
  gearbox,
  mug,
  owl,
  pacMan,
  penguin,
  planet,
  soccerBall,
  starNorth,
  steeringWheel,
  sushi,
  tire,
  toolbox,
  treesForest,
  ufo,
  watchActivity,
  whale,
  yinYang,
} from "@lucide/lab";
import type { SelectColor } from "../types";

/**
 * Lab icons are bare icon-node arrays rendered through lucide's generic
 * <Icon iconNode=…>; core icons are ready-made components. The registry
 * holds either, keyed by the kebab-case name stored on Page.icon.
 */
type LabIconNode = Parameters<typeof LucideLabIcon>[0]["iconNode"];
type IconDef = ComponentType<LucideProps> | LabIconNode;

export const ICON_REGISTRY: Record<string, IconDef> = {
  // documents & places
  "file-text": FileText,
  folder: Folder,
  book: Book,
  bookmark: Bookmark,
  list: List,
  home: Home,
  cabin,
  barn,
  farm,
  globe: Globe,
  map: Map,
  compass: Compass,
  // making & tools
  hammer: Hammer,
  wrench: Wrench,
  toolbox,
  settings: Settings,
  gearbox,
  terminal: Terminal,
  code: Code,
  "floppy-disk": floppyDisk,
  database: Database,
  laptop: Laptop,
  monitor: Monitor,
  smartphone: Smartphone,
  // ideas & nature
  lightbulb: Lightbulb,
  brain: Brain,
  flame: Flame,
  zap: Zap,
  sparkles: Sparkles,
  star: Star,
  "star-north": starNorth,
  sun: Sun,
  moon: Moon,
  planet,
  ufo,
  leaf: Leaf,
  trees: Trees,
  forest: treesForest,
  cactus,
  owl,
  penguin,
  whale,
  // pursuits
  target: Target,
  palette: Palette,
  film: Film,
  gamepad: Gamepad2,
  "pac-man": pacMan,
  music: Music,
  camera: Camera,
  "graduation-cap": GraduationCap,
  flask: FlaskConical,
  microscope: Microscope,
  telescope: Telescope,
  dumbbell: Dumbbell,
  bike: Bike,
  "soccer-ball": soccerBall,
  "yin-yang": yinYang,
  // money & things
  wallet: Wallet,
  receipt: Receipt,
  "credit-card": CreditCard,
  "shopping-cart": ShoppingCart,
  banknote: Banknote,
  "piggy-bank": PiggyBank,
  "trending-up": TrendingUp,
  box: Box,
  lock: Lock,
  key: Key,
  shield: Shield,
  watch: watchActivity,
  coffee,
  mug,
  "fork-knife": forkKnife,
  sushi,
  // travel & time
  plane: Plane,
  rocket: Rocket,
  car: Car,
  "steering-wheel": steeringWheel,
  tire,
  heart: Heart,
  check: Check,
  flag: Flag,
  calendar: Calendar,
  clock: Clock,
};

export const ICON_NAMES = Object.keys(ICON_REGISTRY);

/** True when the stored value is a known icon key (legacy emojis aren't). */
export function isIconName(name: string | undefined): name is string {
  return Boolean(name && name in ICON_REGISTRY);
}

interface Props {
  /** Registry key (Page.icon). Unknown keys (e.g. legacy emoji) render nothing. */
  name: string;
  size?: number;
  strokeWidth?: number;
  /** Palette colour; unset inherits the surrounding text colour. */
  color?: SelectColor;
  className?: string;
}

export function Icon({ name, size = 14, strokeWidth = 1.5, color, className }: Props) {
  const def = ICON_REGISTRY[name];
  if (!def) return null;
  const svg = Array.isArray(def) ? (
    <LucideLabIcon iconNode={def} size={size} strokeWidth={strokeWidth} />
  ) : (
    (() => {
      const C = def as ComponentType<LucideProps>;
      return <C size={size} strokeWidth={strokeWidth} />;
    })()
  );
  return (
    <span
      className={`glyph${color ? ` selc-${color}` : ""}${className ? ` ${className}` : ""}`}
      style={color ? { color: "var(--selc)" } : undefined}
    >
      {svg}
    </span>
  );
}
