// Adds the starter cookbook (scripts/recipes-data.mjs: 24 well-known dishes with
// timed steps) to any Cortex account. Recipes whose title already exists are
// skipped, so it's safe to re-run. Nothing else in the account is touched.
//
// Usage: node scripts/seed-recipes.mjs http://localhost:8080 you@example.com password
import { RECIPES } from "./recipes-data.mjs";

const [B, EMAIL, PW] = process.argv.slice(2);
if (!B || !EMAIL || !PW) {
  console.error("Usage: node scripts/seed-recipes.mjs <cortex url> <email> <password>");
  process.exit(1);
}
let cookie = "";
const api = async (path, method = "GET", json) => {
  const r = await fetch(`${B}/api${path}`, { method, headers: { origin: B, cookie, ...(json !== undefined ? { "content-type": "application/json" } : {}) }, body: json !== undefined ? JSON.stringify(json) : undefined });
  const sc = r.headers.getSetCookie?.() ?? [];
  if (sc.length) cookie = sc.map((c) => c.split(";")[0]).join("; ");
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
};
const id = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

await api("/auth/sign-in/email", "POST", { email: EMAIL, password: PW });
const have = new Set((await api("/recipes/recipes")).recipes.map((r) => r.title.toLowerCase()));
let added = 0;
for (const [title, subtitle, , servings, prepMin, cookMin, calories, difficulty, tags, intro, ings, equipment, steps] of RECIPES) {
  if (have.has(title.toLowerCase())) continue;
  const stepIds = steps.map(() => id());
  await api("/recipes/recipes", "POST", {
    title, subtitle, intro, hero: "", heroFocus: 50, servings, prepMin, cookMin, calories, difficulty, tags, equipment, notes: "", sourceUrl: "",
    ingredients: ings.map(([qty, unit, name, note]) => ({ id: id(), qty, unit, name, note })),
    steps: steps.map(([t, text, minutes, handsOff, after], i) => ({ id: stepIds[i], title: t, text, minutes: minutes ?? null, handsOff: !!handsOff, after: after ? stepIds[after - 1] : null, image: null })),
  });
  added++;
}
console.log(`added ${added} recipes (${RECIPES.length - added} already there)`);
