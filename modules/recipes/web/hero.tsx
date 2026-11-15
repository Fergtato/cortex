import { StoredImg } from "@cortex/core";
import { Icon } from "@cortex/ui";

/*
 * A recipe's picture: the photo if there is one, otherwise one generic
 * placeholder (the Cortex grid and a pot). Photos are cropped by CSS
 * (object-fit), centred on the recipe's `heroFocus`, so any shape fits.
 */

export const hasPhoto = (hero: string) => hero.startsWith("cortex-file:");

export function Hero({ hero, focus = 50, className }: { hero: string; focus?: number; className?: string }) {
  const photo = hasPhoto(hero);
  return (
    <span className={`rc-hero ${photo ? "rc-hero--photo" : "rc-hero--empty"} ${className ?? ""}`}>
      {photo ? (
        <StoredImg src={hero} alt="" loading="lazy" draggable={false} style={{ objectPosition: `50% ${focus}%` }} />
      ) : (
        <Icon name="pot" size={32} strokeWidth={1.25} className="rc-hero__mark" />
      )}
    </span>
  );
}

const DISHES: [RegExp, string][] = [
  [/spaghetti|penne|lasagn|carbonara|ragu|linguine|tagliatelle|gnocchi|macaroni|fusilli|orzo/i, "pasta"],
  [/ramen|pho|udon|pad thai|lo mein|soba|chow mein/i, "noodles"],
  [/broth|chowder|bisque|minestrone|gazpacho/i, "soup"],
  [/dal|dhal|tikka|masala|korma|vindaloo|jalfrezi|katsu/i, "curry"],
  [/brownie|cookie|tart|muffin|cheesecake|pudding|crumble|cake/i, "dessert baking"],
  [/pancake|porridge|granola|waffle|omelette|shakshuka|overnight oats/i, "breakfast"],
  [/salmon|cod|tuna|prawn|shrimp|haddock|mackerel|sea bass/i, "fish seafood"],
  [/taco|burrito|fajita|quesadilla|enchilada|nacho/i, "mexican"],
];

/** Dish families a name implies, so searching "pasta" finds spaghetti carbonara. */
export function dishWords(title: string): string {
  return DISHES.filter(([re]) => re.test(title)).map(([, w]) => w).join(" ");
}
