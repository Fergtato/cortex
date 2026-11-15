import type { ReactNode } from "react";
import { StoredImg } from "@cortex/core";

/*
 * Illustrated placeholder heroes: flat line drawings on the Cortex grid,
 * coloured only with theme tokens so they follow every theme. A recipe's
 * hero is `art:<name>` until a photo replaces it.
 */

const W = 160;
const H = 120;

/* Shorthands keep the drawings readable. */
const plate = (cx: number, cy: number, r: number) => (
  <>
    <circle className="ra-plate" cx={cx} cy={cy} r={r} />
    <circle className="ra-rim" cx={cx} cy={cy} r={r - 6} />
  </>
);
const leaf = (x: number, y: number, rot: number, s = 1) => (
  <path className="ra-green" transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`} d="M0 0c4-6 12-6 16 0c-4 6-12 6-16 0z M0 0h14" />
);

export const ART: Record<string, { label: string; draw: ReactNode }> = {
  bowl: {
    label: "Grain bowl",
    draw: (
      <>
        {plate(80, 62, 44)}
        <path className="ra-warm" d="M80 62 L80 28 A34 34 0 0 1 112 52 z" />
        <path className="ra-green" d="M80 62 L112 52 A34 34 0 0 1 96 92 z" />
        <path className="ra-red" d="M80 62 L96 92 A34 34 0 0 1 52 86 z" />
        <path className="ra-blue" d="M80 62 L52 86 A34 34 0 0 1 48 46 z" />
        <path className="ra-accent" d="M80 62 L48 46 A34 34 0 0 1 80 28 z" />
        <circle className="ra-egg" cx="80" cy="62" r="10" />
        <circle className="ra-yolk" cx="80" cy="62" r="4.5" />
      </>
    ),
  },
  pasta: {
    label: "Pasta",
    draw: (
      <>
        {plate(80, 62, 44)}
        <g className="ra-warm-line">
          <path d="M58 60c6-14 30-16 40-4s-6 26-20 22-14-18-2-20 18 8 10 14" />
          <path d="M54 68c4 12 22 18 36 12" />
          <path d="M66 46c10-6 26-4 34 6" />
          <path d="M60 52c8-8 20-10 30-4" />
          <path d="M100 66c-2 10-12 16-24 16" />
        </g>
        <circle className="ra-red" cx="70" cy="58" r="5" />
        <circle className="ra-red" cx="92" cy="70" r="4" />
        <circle className="ra-red" cx="86" cy="50" r="3.5" />
        {leaf(96, 48, -30, 0.9)}
        {leaf(62, 74, 20, 0.8)}
      </>
    ),
  },
  salad: {
    label: "Salad",
    draw: (
      <>
        {plate(80, 62, 44)}
        {leaf(56, 50, -10, 1.6)}
        {leaf(84, 40, 40, 1.5)}
        {leaf(98, 70, 150, 1.6)}
        {leaf(60, 80, -50, 1.4)}
        {leaf(76, 66, 80, 1.3)}
        <circle className="ra-red" cx="70" cy="58" r="5.5" />
        <circle className="ra-red" cx="96" cy="54" r="5" />
        <circle className="ra-red" cx="82" cy="84" r="4.5" />
        <circle className="ra-egg" cx="88" cy="66" r="5" />
        <rect className="ra-warm" x="62" y="66" width="7" height="7" rx="1" />
        <rect className="ra-warm" x="98" y="76" width="6" height="6" rx="1" />
      </>
    ),
  },
  soup: {
    label: "Soup",
    draw: (
      <>
        {plate(76, 66, 42)}
        <circle className="ra-red" cx="76" cy="66" r="30" />
        <circle className="ra-cream" cx="70" cy="62" r="9" />
        <path className="ra-line" d="M70 62c4-3 8 1 5 4" />
        {leaf(80, 76, -20, 0.7)}
        {leaf(86, 56, 30, 0.6)}
        <path className="ra-plate" d="M112 40l26-22 4 4-24 24z" />
        <path className="ra-line" d="M70 20c-4 4 4 8 0 12 M80 16c-4 4 4 8 0 12 M90 20c-4 4 4 8 0 12" />
      </>
    ),
  },
  curry: {
    label: "Curry",
    draw: (
      <>
        {plate(80, 62, 44)}
        <path className="ra-egg" d="M80 28a34 34 0 0 0 0 68z" />
        <g className="ra-grain">
          <path d="M60 46h4 M54 58h4 M62 64h4 M56 74h4 M66 82h4 M68 38h4 M70 52h4 M72 70h4" />
        </g>
        <path className="ra-warm" d="M80 28a34 34 0 0 1 0 68z" />
        <circle className="ra-red" cx="92" cy="50" r="5" />
        <circle className="ra-red" cx="98" cy="70" r="4.5" />
        <circle className="ra-red" cx="88" cy="80" r="4" />
        {leaf(100, 58, 60, 0.7)}
        {leaf(86, 64, -30, 0.7)}
      </>
    ),
  },
  burger: {
    label: "Burger",
    draw: (
      <>
        <path className="ra-warm" d="M42 58c0-22 76-22 76 0z" />
        <path className="ra-line" d="M64 44h.01 M80 40h.01 M96 44h.01 M72 50h.01 M88 50h.01" />
        <path className="ra-green" d="M38 62c6 6 10-2 16 4s10-2 16 4 10-2 16 4 10-2 16 4 10-2 16-2" />
        <path className="ra-red" d="M42 66h76v6H42z" />
        <rect className="ra-meat" x="40" y="74" width="80" height="12" rx="5" />
        <path className="ra-yolk" d="M44 74h72l-10 8-8-6-10 8-10-8-10 8-10-8-8 6z" />
        <path className="ra-warm" d="M42 90h76c0 10-8 12-38 12s-38-2-38-12z" />
      </>
    ),
  },
  pizza: {
    label: "Pizza",
    draw: (
      <>
        <circle className="ra-warm" cx="80" cy="60" r="44" />
        <circle className="ra-red" cx="80" cy="60" r="37" />
        <circle className="ra-cream" cx="80" cy="60" r="33" />
        <path className="ra-line" d="M80 16v88 M42 38l76 44 M42 82l76-44" />
        {[[66, 44], [96, 50], [70, 76], [94, 76], [80, 60], [58, 62], [102, 64]].map(([x, y], i) => (
          <circle key={i} className="ra-meat" cx={x} cy={y} r="5" />
        ))}
        {leaf(84, 40, 20, 0.6)}
        {leaf(60, 50, 120, 0.6)}
      </>
    ),
  },
  cake: {
    label: "Cake",
    draw: (
      <>
        <ellipse className="ra-plate" cx="80" cy="96" rx="52" ry="10" />
        <path className="ra-warm" d="M40 56v34c0 6 80 6 80 0V56z" />
        <path className="ra-cream" d="M40 72c0 6 80 6 80 0v-6c0 6-80 6-80 0z" />
        <ellipse className="ra-cream" cx="80" cy="56" rx="40" ry="10" />
        <path className="ra-cream" d="M44 60c0 8 6 8 6 2 M62 64c0 8 6 8 6 2 M86 64c0 8 6 8 6 2 M108 60c0 8 6 8 6 2" />
        <circle className="ra-red" cx="70" cy="52" r="5" />
        <circle className="ra-red" cx="90" cy="54" r="5" />
        <path className="ra-line" d="M80 46v-16" />
        <path className="ra-yolk" d="M80 22c4 4 3 8 0 8s-4-4 0-8z" />
      </>
    ),
  },
  breakfast: {
    label: "Breakfast",
    draw: (
      <>
        <circle className="ra-plate" cx="66" cy="62" r="40" />
        <rect className="ra-plate" x="100" y="58" width="44" height="8" rx="4" />
        <path className="ra-egg" d="M50 50c8-12 30-10 34 2s4 26-12 28-28-4-26-14 0-8 4-16z" />
        <circle className="ra-yolk" cx="66" cy="62" r="9" />
        <rect className="ra-warm" x="96" y="20" width="34" height="30" rx="8" transform="rotate(12 113 35)" />
        <rect className="ra-cream" x="101" y="25" width="24" height="20" rx="5" transform="rotate(12 113 35)" />
        <path className="ra-green" d="M36 84c6-4 12-4 16 0" />
      </>
    ),
  },
  fish: {
    label: "Fish",
    draw: (
      <>
        <ellipse className="ra-plate" cx="80" cy="62" rx="58" ry="40" />
        <ellipse className="ra-rim" cx="80" cy="62" rx="50" ry="32" />
        <path className="ra-red" d="M44 62c10-14 40-18 58 0c-18 18-48 14-58 0z" />
        <path className="ra-red" d="M102 62l14-10v20z" />
        <path className="ra-line" d="M60 54c4 4 4 12 0 16 M72 52c4 5 4 15 0 20 M84 54c3 4 3 12 0 16" />
        <circle className="ra-line" cx="52" cy="60" r="1.5" />
        <path className="ra-yolk" d="M70 84a10 10 0 0 1 20 0z" />
        {leaf(90, 40, -20, 0.7)}
        {leaf(56, 82, 160, 0.7)}
      </>
    ),
  },
  taco: {
    label: "Tacos",
    draw: (
      <>
        <path className="ra-warm" d="M18 92a34 34 0 0 1 68 0z" />
        <path className="ra-green" d="M24 80c4-8 10-4 12-10 4 6 8 0 12-4 2 6 8 4 12 0 2 6 8 4 12 6 4 0 6 4 6 8" />
        <circle className="ra-red" cx="38" cy="78" r="4" />
        <circle className="ra-red" cx="62" cy="74" r="3.5" />
        <path className="ra-warm" d="M74 92a34 34 0 0 1 68 0z" />
        <path className="ra-meat" d="M82 80c4-8 10-6 14-10 4 4 8 0 12-2 4 4 8 2 12 4 4 2 8 4 10 8" />
        <circle className="ra-cream" cx="100" cy="76" r="4" />
        <circle className="ra-cream" cx="118" cy="78" r="3.5" />
        <path className="ra-line" d="M12 96h136" />
      </>
    ),
  },
  noodles: {
    label: "Noodles",
    draw: (
      <>
        <path className="ra-plate" d="M30 54h100c0 30-22 48-50 48S30 84 30 54z" />
        <ellipse className="ra-rim" cx="80" cy="54" rx="50" ry="10" />
        <g className="ra-warm-line">
          <path d="M42 56c8-6 14 6 22 0s14 6 22 0 14 6 22 0 10 4 14 0" />
          <path d="M46 62c8-6 14 6 22 0s14 6 22 0 14 6 22 0" />
        </g>
        <circle className="ra-egg" cx="98" cy="50" r="6" />
        <circle className="ra-yolk" cx="98" cy="50" r="2.5" />
        {leaf(60, 48, -10, 0.7)}
        <path className="ra-stick" d="M96 12l-26 44 M112 14l-34 44" />
      </>
    ),
  },
  bread: {
    label: "Bread",
    draw: (
      <>
        <rect className="ra-plate" x="22" y="84" width="116" height="16" rx="3" />
        <path className="ra-warm" d="M34 84c-8-30 18-46 46-46s54 16 46 46z" />
        <path className="ra-line" d="M56 52c6 8 6 18 2 26 M78 46c6 10 6 22 2 32 M100 52c6 8 6 18 2 26" />
        <path className="ra-cream" d="M126 84c8-20-4-30-14-30v30z" />
      </>
    ),
  },
  drink: {
    label: "Drink",
    draw: (
      <>
        <path className="ra-plate" d="M54 24h52l-8 78H62z" />
        <path className="ra-accent" d="M58 46h44l-5 52H63z" />
        <path className="ra-line" d="M58 46h44" />
        <circle className="ra-yolk" cx="104" cy="30" r="12" />
        <circle className="ra-cream" cx="104" cy="30" r="8" />
        <path className="ra-stick" d="M88 14l-10 70" />
        {leaf(66, 38, -30, 0.8)}
        <circle className="ra-rim" cx="74" cy="64" r="3" />
        <circle className="ra-rim" cx="86" cy="78" r="2.5" />
      </>
    ),
  },
};

export const ART_NAMES = Object.keys(ART);

const GUESS: [RegExp, string][] = [
  [/pasta|spaghetti|penne|lasagn|carbonara|ragu|linguine|tagliatelle|gnocchi|risotto|mac/i, "pasta"],
  [/noodle|ramen|pho|udon|pad thai|stir.?fry|lo mein|soba/i, "noodles"],
  [/soup|broth|chowder|bisque|stew|chili|chilli/i, "soup"],
  [/curry|dal|dhal|tikka|masala|korma|biryani|katsu/i, "curry"],
  [/salad|slaw|poke/i, "salad"],
  [/burger|sandwich|sub|bap/i, "burger"],
  [/pizza|flatbread/i, "pizza"],
  [/cake|brownie|cookie|tart|pie|muffin|dessert|pudding|cheesecake/i, "cake"],
  [/egg|pancake|toast|breakfast|porridge|oat|brunch|granola|waffle/i, "breakfast"],
  [/fish|salmon|cod|tuna|prawn|shrimp|seafood|haddock|mackerel/i, "fish"],
  [/taco|burrito|fajita|quesadilla|enchilada|nacho/i, "taco"],
  [/bread|loaf|focaccia|sourdough|bun|bagel/i, "bread"],
  [/smoothie|drink|cocktail|juice|lemonade|latte|shake/i, "drink"],
];

/** A fitting illustration from the title and tags; a grain bowl when nothing matches. */
export function guessArt(title: string, tags: string[] = []): string {
  return matchArt(title, tags) ?? "bowl";
}

/** The dish family the name suggests, or null when nothing matches. */
export function matchArt(title: string, tags: string[] = []): string | null {
  const text = `${title} ${tags.join(" ")}`;
  return GUESS.find(([re]) => re.test(text))?.[1] ?? null;
}

export function ArtSvg({ name, className }: { name: string; className?: string }) {
  const art = ART[name] ?? ART.bowl;
  return (
    <svg className={`ra-art ${className ?? ""}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={art.label}>
      {art.draw}
    </svg>
  );
}

/** A recipe's hero: the photo if there is one, otherwise its illustration on the grid. */
export function Hero({ hero, title, tags, className }: { hero: string; title: string; tags?: string[]; className?: string }) {
  const photo = hero.startsWith("cortex-file:");
  const art = hero.startsWith("art:") ? hero.slice(4) : guessArt(title, tags);
  return (
    <span className={`rc-hero ${photo ? "rc-hero--photo" : "rc-hero--art"} ${className ?? ""}`}>
      {photo ? <StoredImg src={hero} alt="" loading="lazy" draggable={false} /> : <ArtSvg name={art} />}
    </span>
  );
}
