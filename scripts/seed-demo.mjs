// Fills a Cortex account with realistic demo data through the public API:
// Notes pages and lists, three Home dashboards, six months of Finance
// (accounts, budgets, rules, transfers, a yen trip) and a Watchlist with
// real TMDB titles (the instance needs a TMDB key). Modules that already
// have data are skipped, so it's safe to re-run.
//
// Usage: node scripts/seed-demo.mjs http://localhost:8080 demo@example.com password
const [B, EMAIL, PW] = process.argv.slice(2);
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
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];
const TODAY = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => { const d = new Date(TODAY); d.setDate(d.getDate() - n); return d; };
const NOW = Date.now();

await api("/auth/sign-in/email", "POST", { email: EMAIL, password: PW });
console.log("signed in as", EMAIL);

// ---------------------------------------------------------------- settings
const settings = (await api("/settings")) ?? {};
await api("/settings", "PUT", { theme: { themeId: "dark" }, customThemes: {}, disabledModules: [], ...settings, modules: { ...(settings.modules ?? {}), finance: { baseCurrency: "GBP" } } });

// ================================================================ FINANCE
async function finance() {
  let st = await api("/finance/state");
  if (st.accounts.length) { console.log("finance: already has accounts, skipping"); return st; }
  await api("/finance/setup", "POST", { seedCategories: true });
  const acct = {};
  for (const [key, name, type, currency, opening] of [
    ["cur", "Monzo current", "current", "GBP", 514213],
    ["sav", "Rainy day savings", "savings", "GBP", 420000],
    ["cc", "Amex", "credit", "GBP", -12340],
    ["isa", "Stocks ISA", "investment", "GBP", 1250000],
    ["jpy", "Wise yen", "current", "JPY", 0],
  ]) acct[key] = (await api("/finance/accounts", "POST", { name, type, currency, openingBalance: opening })).id;
  await api("/finance/categories", "POST", { name: "Travel", kind: "expense", group: "Personal" });
  await api("/finance/categories", "POST", { name: "Fitness", kind: "expense", group: "Personal" });
  st = await api("/finance/state");
  const cat = Object.fromEntries(st.categories.map((c) => [c.name, c.id]));

  const tx = (accountId, date, amount, payee, category) => api("/finance/transactions", "POST", { accountId, date: iso(date), amount: Math.round(amount), payee, categoryId: category ? cat[category] : null });
  const xfer = (from, to, date, amount, payee, toAmount) => api("/finance/transactions", "POST", { kind: "transfer", fromAccountId: from, toAccountId: to, date: iso(date), amount, toAmount, payee });

  const jobs = [];
  for (let m = 6; m >= 0; m--) {
    const first = new Date(TODAY.getFullYear(), TODAY.getMonth() - m, 1);
    const day = (d) => { const x = new Date(first); x.setDate(d); return x; };
    const past = (d) => day(d) <= TODAY;
    if (past(25)) jobs.push(() => tx(acct.cur, day(25), 312450, "ACME Studio Ltd salary", "Salary"));
    if (past(1)) jobs.push(() => tx(acct.cur, day(1), -135000, "Harbour Lettings rent", "Rent or mortgage"));
    if (past(3)) jobs.push(() => tx(acct.cur, day(3), -Math.round(rnd(7800, 11200)), "Octopus Energy", "Utilities"));
    if (past(4)) jobs.push(() => tx(acct.cur, day(4), -3200, "Hyperoptic broadband", "Utilities"));
    if (past(8)) jobs.push(() => tx(acct.cur, day(8), -1899, "Netflix", "Subscriptions"));
    if (past(12)) jobs.push(() => tx(acct.cc, day(12), -1199, "Spotify", "Subscriptions"));
    if (past(15)) jobs.push(() => tx(acct.cur, day(15), -4200, "PureGym", "Fitness"));
    if (past(10)) jobs.push(() => tx(acct.cur, day(10), -2150, "Admiral insurance", "Insurance"));
    if (past(26)) jobs.push(() => xfer(acct.cur, acct.sav, day(26), 50000, "Monthly savings"));
    if (past(27)) jobs.push(() => xfer(acct.cur, acct.isa, day(27), 30000, "ISA top-up"));
    if (past(20)) jobs.push(() => xfer(acct.cur, acct.cc, day(20), 45000, "Amex payment"));
    for (const d of [2, 6, 9, 13, 16, 20, 23, 27, 30]) if (past(d) && d <= new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()) jobs.push(() => tx(pick([acct.cur, acct.cur, acct.cc]), day(d), -rnd(1800, 8600), pick(["Tesco", "Sainsbury's", "Lidl", "Waitrose", "M&S Food"]), "Groceries"));
    for (const d of [5, 11, 18, 22, 29]) if (past(d) && d <= 28) jobs.push(() => tx(acct.cc, day(d), -rnd(1200, 6400), pick(["Dishoom", "Pret A Manger", "Franco Manca", "Wagamama", "Honest Burgers", "The Coffee Works"]), "Eating out"));
    for (const d of [7, 14, 21, 28]) if (past(d)) jobs.push(() => tx(acct.cur, day(d), -rnd(280, 1650), pick(["TfL travel", "Uber", "Trainline"]), "Public transport"));
    for (const d of [9, 24]) if (past(d) && Math.random() > 0.3) jobs.push(() => tx(acct.cc, day(d), -rnd(1500, 12000), pick(["Amazon", "Uniqlo", "Waterstones", "IKEA", "Apple"]), "Shopping"));
    if (past(17) && Math.random() > 0.5) jobs.push(() => tx(acct.cur, day(17), -rnd(2000, 5500), pick(["Odeon", "Ticketmaster", "Steam"]), "Entertainment"));
    if (past(19) && m % 2 === 0) jobs.push(() => tx(acct.cur, day(19), 4500, "Vinted sale", "Other income"));
  }
  // A Japan trip last month: exchange into yen, then spend in yen.
  const trip = daysAgo(34);
  jobs.push(() => xfer(acct.cur, acct.jpy, trip, 80000, "Exchanged to JPY", 151200));
  const yen = [["Lawson", 860, "Groceries"], ["Ichiran Shibuya", 2380, "Eating out"], ["JR East", 3200, "Public transport"], ["Don Quijote", 6400, "Shopping"], ["teamLab Planets", 7600, "Entertainment"], ["Blue Bottle Kiyosumi", 1250, "Eating out"], ["Tokyo Metro", 1180, "Public transport"], ["FamilyMart", 640, "Groceries"], ["Uniqlo Ginza", 11900, "Shopping"], ["Sushi Zanmai", 4650, "Eating out"], ["Hotel Gracery", 38400, "Travel"]];
  yen.forEach(([p, a, c], i) => jobs.push(() => tx(acct.jpy, daysAgo(33 - Math.floor(i / 2)), -a, p, c)));
  jobs.push(() => tx(acct.cc, daysAgo(60), -48900, "British Airways LHR-HND", "Travel"));
  for (let i = 0; i < jobs.length; i += 8) await Promise.all(jobs.slice(i, i + 8).map((j) => j()));

  for (const [c, amount] of [["Groceries", 40000], ["Eating out", 15000], ["Shopping", 20000], ["Public transport", 9000], ["Entertainment", 6000], ["Subscriptions", 4000]]) await api("/finance/budgets", "PUT", { categoryId: cat[c], month: "*", amount });
  for (const [match, c] of [["Tesco", "Groceries"], ["Sainsbury", "Groceries"], ["Lidl", "Groceries"], ["Pret", "Eating out"], ["TfL", "Public transport"], ["Netflix", "Subscriptions"]]) await api("/finance/rules", "POST", { match, categoryId: cat[c] });
  // A few left uncategorised, for the "file it" flow.
  await tx(acct.cur, daysAgo(2), -2399, "Bloom & Wild", null);
  await tx(acct.cc, daysAgo(1), -899, "Notion Labs", null);
  await tx(acct.cur, daysAgo(6), 45000, "Freelance invoice · Northwind", "Other income");
  await tx(acct.cur, daysAgo(3), 3200, "Vinted sale", "Other income");
  // IOUs: a friend's concert ticket (paid from the current account), a dinner share, and one you owe.
  const ago = (n) => iso(daysAgo(n));
  await api("/finance/ious", "POST", { person: "Sam", direction: "owed_to_me", amount: 6500, currency: "GBP", date: ago(9), note: "Concert tickets", accountId: acct.cur });
  await api("/finance/ious", "POST", { person: "Priya", direction: "owed_to_me", amount: 2840, currency: "GBP", date: ago(4), note: "Her half of dinner at Dishoom" });
  await api("/finance/ious", "POST", { person: "Alex", direction: "i_owe", amount: 1500, currency: "GBP", date: ago(2), note: "Taxi home" });
  const paid = (await api("/finance/ious", "POST", { person: "Jordan", direction: "owed_to_me", amount: 12000, currency: "GBP", date: ago(40), note: "Festival deposit", accountId: acct.cur })).id;
  await api(`/finance/ious/${paid}/settle`, "POST", { accountId: acct.cur, date: ago(25) });
  console.log("finance:", jobs.length + 2, "transactions, 4 IOUs");
  return api("/finance/state");
}

// ============================================================== WATCHLIST
async function watchlist() {
  const lib = await api("/watchlist/library");
  if (lib.entries.length) { console.log("watchlist: already has titles, skipping"); return; }
  const cfg = await api("/watchlist/config");
  if (!cfg.configured) { console.log("watchlist: TMDB not configured, skipping"); return; }
  const at = (n) => daysAgo(n).toISOString();
  const movies = [
    [27205, "completed", 9, 200], [157336, "completed", 10, 150], [155, "completed", 9, 320], [496243, "completed", 9, 95],
    [693134, "completed", 8, 40], [872585, "completed", 8, 120], [129, "completed", 10, 60], [372058, "completed", 9, 18],
    [120, "completed", 9, 280], [680, "completed", 8, 240], [438631, "completed", 8, 70], [569094, "completed", 9, 12],
    [1022789, "watchlist"], [912649, "watchlist"], [575264, "watchlist"], [508883, "watchlist"], [11, "watchlist"],
  ];
  for (const [mid, status, rating, ago] of movies) {
    try {
      if (status === "completed") {
        await api(`/watchlist/library/movie/${mid}/watch`, "POST", { watchedAt: at(ago) });
        if (rating) await api(`/watchlist/library/movie/${mid}`, "PATCH", { rating });
      } else await api(`/watchlist/library/movie/${mid}`, "PUT", { status });
    } catch (e) { console.log("  movie", mid, e.message.slice(0, 80)); }
  }
  // TV: how many seasons/episodes to log, spread back in time.
  const shows = [
    [1396, "all", 10, 300], // Breaking Bad, finished
    [94605, "all", 9, 100], // Arcane
    [136315, 2, 9, 45], // The Bear: two seasons
    [95396, 1.5, 9, 20], // Severance: season 1 + half of 2
    [100088, 1, 8, 80], // The Last of Us
    [66732, 3, 8, 200], // Stranger Things
    [1429, 2, null, 30], // Attack on Titan
  ];
  for (const [sid, upto, rating, span] of shows) {
    try {
      const d = await api(`/watchlist/tmdb/details/tv/${sid}`);
      const seasons = d.seasons.filter((s) => s.seasonNumber > 0);
      const eps = [];
      for (const s of seasons) {
        const limit = upto === "all" ? s.episodeCount : s.seasonNumber <= Math.floor(upto) ? s.episodeCount : s.seasonNumber === Math.ceil(upto) && upto % 1 ? Math.ceil(s.episodeCount / 2) : 0;
        const season = limit ? await api(`/watchlist/tmdb/season/${sid}/${s.seasonNumber}`) : [];
        for (const e of season.slice(0, limit)) if (e.airDate && e.airDate <= iso(TODAY)) eps.push({ season: s.seasonNumber, episode: e.episodeNumber });
      }
      // Batches of ~3 episodes, oldest first, across `span` days.
      for (let i = 0; i < eps.length; i += 3) {
        const ago = Math.max(1, Math.round(span - (i / Math.max(1, eps.length)) * span));
        await api(`/watchlist/library/tv/${sid}/watch`, "POST", { episodes: eps.slice(i, i + 3), watchedAt: at(ago) });
      }
      if (rating) await api(`/watchlist/library/tv/${sid}`, "PATCH", { rating });
      console.log("  tv", d.title, eps.length, "episodes");
    } catch (e) { console.log("  tv", sid, e.message.slice(0, 80)); }
  }
  // Watched a season of Game of Thrones, then stopped.
  try {
    const s1 = await api("/watchlist/tmdb/season/1399/1");
    await api("/watchlist/library/tv/1399/watch", "POST", { episodes: s1.map((e) => ({ season: 1, episode: e.episodeNumber })), watchedAt: at(240) });
    await api("/watchlist/library/tv/1399", "PUT", { status: "dropped" });
  } catch (e) { console.log("  tv 1399", e.message.slice(0, 60)); }
  for (const sid of [37854, 76479, 87108, 119051]) await api(`/watchlist/library/tv/${sid}`, "PUT", { status: "watchlist" }).catch((e) => console.log("  tv", sid, e.message.slice(0, 60)));
  // Lists
  const addTo = async (listId, type, tid) => {
    const d = await api(`/watchlist/tmdb/details/${type}/${tid}`);
    await api(`/watchlist/lists/${listId}/items`, "PUT", { mediaType: type, tmdbId: tid, title: d.title, posterPath: d.posterPath, releaseDate: d.releaseDate });
  };
  const date = (await api("/watchlist/lists", "POST", { name: "Date night" })).id;
  for (const [t, i] of [["movie", 372058], ["movie", 129], ["movie", 496243], ["movie", 1022789], ["movie", 11]]) await addTo(date, t, i).catch(() => {});
  const comfort = (await api("/watchlist/lists", "POST", { name: "Comfort rewatches" })).id;
  for (const [t, i] of [["movie", 120], ["tv", 136315], ["movie", 157336], ["tv", 94605]]) await addTo(comfort, t, i).catch(() => {});
  console.log("watchlist: done");
}

// ================================================================== NOTES
async function notes() {
  const cur = await api("/notes");
  if (Object.keys(cur.pages ?? {}).length) { console.log("notes: already has pages, skipping"); return null; }
  const opt = (name, color) => ({ id: id(), name, color });
  const prop = (name, type, extra = {}) => ({ id: id(), name, type, ...extra });
  const db = (name, properties, rows, views, order, extra = {}) => {
    const v = views.map((x) => ({ id: id(), ...x }));
    return { id: id(), name, properties, rows: rows.map((cells, i) => ({ id: id(), cells, createdAt: NOW - (rows.length - i) * 86400000, updatedAt: NOW, seq: i + 1 })), views: v, activeViewId: v[0].id, nextSeq: rows.length + 1, folderId: null, order, createdAt: NOW, updatedAt: NOW, ...extra };
  };

  // Reading list
  const rTitle = prop("Title", "text");
  const rAuthor = prop("Author", "text");
  const sTo = opt("To read", "gray"), sReading = opt("Reading", "blue"), sDone = opt("Finished", "green");
  const rStatus = prop("Status", "select", { options: [sTo, sReading, sDone] });
  const gF = opt("Fiction", "purple"), gSF = opt("Sci-fi", "cyan"), gNF = opt("Non-fiction", "orange"), gDes = opt("Design", "pink");
  const rGenre = prop("Genre", "multiselect", { options: [gF, gSF, gNF, gDes] });
  const rRating = prop("Rating", "number");
  const rDate = prop("Finished", "date");
  const books = [
    ["Project Hail Mary", "Andy Weir", sDone, [gSF, gF], 5, 120], ["Tomorrow, and Tomorrow, and Tomorrow", "Gabrielle Zevin", sDone, [gF], 5, 90],
    ["The Design of Everyday Things", "Don Norman", sDone, [gNF, gDes], 4, 60], ["Klara and the Sun", "Kazuo Ishiguro", sDone, [gF, gSF], 4, 40],
    ["Thinking in Systems", "Donella Meadows", sReading, [gNF], null, null], ["Piranesi", "Susanna Clarke", sReading, [gF], null, null],
    ["The Left Hand of Darkness", "Ursula K. Le Guin", sTo, [gSF], null, null], ["Refactoring UI", "Wathan & Schoger", sTo, [gDes], null, null],
    ["Atomic Habits", "James Clear", sDone, [gNF], 3, 200], ["Sea of Tranquility", "Emily St. John Mandel", sTo, [gSF, gF], null, null],
  ];
  const reading = db("Reading list", [rTitle, rAuthor, rStatus, rGenre, rRating, rDate],
    books.map(([t, a, s, g, r, ago]) => ({ [rTitle.id]: t, [rAuthor.id]: a, [rStatus.id]: s.id, [rGenre.id]: g.map((x) => x.id), [rRating.id]: r, [rDate.id]: ago ? iso(daysAgo(ago)) : null })),
    [{ name: "Shelf", type: "kanban", groupByPropId: rStatus.id }, { name: "All books", type: "table", sort: { propId: rRating.id, dir: "desc" }, aggregations: { [rRating.id]: "avg" } }, { name: "Gallery", type: "gallery" }], 0);

  // Workouts (feeds the habit tracker and charts)
  const wName = prop("Workout", "text");
  const wDate = prop("Date", "date");
  const tRun = opt("Run", "green"), tGym = opt("Gym", "blue"), tYoga = opt("Yoga", "purple"), tCycle = opt("Cycle", "orange");
  const wType = prop("Type", "select", { options: [tRun, tGym, tYoga, tCycle] });
  const wMin = prop("Minutes", "number");
  const wKm = prop("Distance (km)", "number");
  const workouts = [];
  for (let n = 110; n >= 0; n--) {
    if (Math.random() < 0.45) continue;
    const t = pick([tRun, tRun, tGym, tGym, tYoga, tCycle]);
    const min = Math.round(t === tYoga ? rnd(20, 45) : t === tGym ? rnd(40, 70) : rnd(25, 75));
    workouts.push({ [wName.id]: t === tRun ? pick(["Easy run", "Tempo run", "Park loop", "Long run"]) : t === tGym ? pick(["Push day", "Pull day", "Legs", "Full body"]) : t === tYoga ? pick(["Morning flow", "Yin yoga"]) : pick(["Commute ride", "Hill reps"]), [wDate.id]: iso(daysAgo(n)), [wType.id]: t.id, [wMin.id]: min, [wKm.id]: t === tRun ? Math.round(min / 5.6 * 10) / 10 : t === tCycle ? Math.round(min / 2.4 * 10) / 10 : null });
  }
  const work = db("Workouts", [wName, wDate, wType, wMin, wKm], workouts,
    [{ name: "Log", type: "table", sort: { propId: wDate.id, dir: "desc" }, aggregations: { [wMin.id]: "sum", [wKm.id]: "sum" } }, { name: "Calendar", type: "calendar", datePropId: wDate.id }, { name: "Minutes by type", type: "chart", chart: { kind: "pie", xPropId: wType.id, yPropId: wMin.id, yAgg: "sum" } }], 1);

  // Projects
  const pName = prop("Project", "text");
  const psIdea = opt("Idea", "gray"), psActive = opt("In progress", "yellow"), psDone = opt("Done", "green");
  const pStatus = prop("Status", "select", { options: [psIdea, psActive, psDone] });
  const pHigh = opt("High", "red"), pMed = opt("Medium", "orange"), pLow = opt("Low", "gray");
  const pPrio = prop("Priority", "select", { options: [pHigh, pMed, pLow] });
  const pDue = prop("Due", "date");
  const pLink = prop("Link", "url");
  const projects = db("Projects", [pName, pStatus, pPrio, pDue, pLink], [
    ["Redesign portfolio site", psActive, pHigh, 12, "https://example.com"], ["Plan Japan trip", psDone, pMed, -30, ""], ["Learn to make sourdough", psActive, pLow, 40, ""],
    ["Set up home server", psDone, pMed, -10, ""], ["Write a short story", psIdea, pLow, 90, ""], ["Kitchen shelves", psIdea, pMed, 60, ""], ["Half marathon training", psActive, pHigh, 52, ""],
  ].map(([n, s, p, due, l]) => ({ [pName.id]: n, [pStatus.id]: s.id, [pPrio.id]: p.id, [pDue.id]: iso(daysAgo(-due)), [pLink.id]: l || null })),
    [{ name: "Board", type: "kanban", groupByPropId: pStatus.id }, { name: "Timeline", type: "calendar", datePropId: pDue.id }, { name: "Table", type: "table" }], 2);

  // Recipes, inside a folder
  const folder = { kind: "folder", id: id(), name: "Kitchen", order: 3, collapsed: false, createdAt: NOW, updatedAt: NOW };
  const kName = prop("Recipe", "text");
  const cQuick = opt("Weeknight", "green"), cBake = opt("Baking", "yellow"), cSlow = opt("Weekend", "orange");
  const kTag = prop("Tag", "select", { options: [cQuick, cBake, cSlow] });
  const kTime = prop("Minutes", "number");
  const kMade = prop("Made it", "checkbox");
  const recipes = db("Recipes", [kName, kTag, kTime, kMade], [
    ["Miso salmon traybake", cQuick, 25, true], ["Chickpea curry", cQuick, 35, true], ["Sourdough loaf", cBake, 1440, false], ["Slow-cooked ragu", cSlow, 240, true], ["Cardamom buns", cBake, 150, false], ["Okonomiyaki", cQuick, 30, true],
  ].map(([n, t, m, made]) => ({ [kName.id]: n, [kTag.id]: t.id, [kTime.id]: m, [kMade.id]: made })), [{ name: "All", type: "table" }, { name: "By tag", type: "kanban", groupByPropId: kTag.id }], 0, { folderId: folder.id });

  const databases = Object.fromEntries([reading, work, projects, recipes, folder].map((d) => [d.id, d]));

  // Pages
  const page = (title, content, parentId = null, order = 0, icon) => ({ id: id(), title, content, parentId, order, ...(icon ? { icon } : {}), createdAt: NOW, updatedAt: NOW });
  const task = (items) => `<ul data-type="taskList">${items.map(([t, done]) => `<li data-type="taskItem" data-checked="${done}"><label><input type="checkbox"${done ? " checked" : ""}><span></span></label><div><p>${t}</p></div></li>`).join("")}</ul>`;
  const embed = (d) => `<div data-database-embed="" data-db-id="${d.id}"></div>`;
  const welcome = page("Welcome to Cortex", `<p>Cortex is a set of personal apps that live together: <strong>Notes</strong> for pages and lists, <strong>Finance</strong> for money, <strong>Watchlist</strong> for movies and TV, and <strong>Home</strong> for dashboards that pull from all of them.</p><h2>Try these</h2>${task([["Open a list and switch between its table, board and calendar views", false], ["Press / in a page to insert headings, checklists, columns or an embedded list", false], ["Add a widget to a Home dashboard (Edit → +)", false], ["Hover a poster in Watchlist and file it with one click", false], ["Import a bank CSV in Finance", false]])}<blockquote><p>Everything here is demo data. Change anything; nothing is precious.</p></blockquote><h2>Keyboard</h2><p><code>/</code> opens the block menu. In Discover, <code>←</code> skips and <code>→</code> adds to your watchlist.</p>`, null, 0, "house");
  const goals = page("2026 goals", `<h2>Health</h2>${task([["Run a half marathon", false], ["Three workouts a week", true], ["Sleep before midnight on weeknights", false]])}<h2>Money</h2>${task([["Six months of expenses in savings", true], ["Max out the ISA", false], ["Keep eating out under £150 a month", false]])}<h2>Making things</h2>${task([["Ship the portfolio redesign", false], ["Read 20 books", false], ["Bake a decent sourdough", false]])}<p>Progress lives in the <em>Workouts</em>, <em>Reading list</em> and <em>Projects</em> lists.</p>`, null, 1, "target");
  const japan = page("Japan trip", `<p>Two weeks: Tokyo, Kyoto, Osaka. Spending is tracked in Finance on the <em>Wise yen</em> account.</p><h2>Bookings</h2><ul><li><p>Flights: BA LHR → HND, booked</p></li><li><p>Hotel Gracery Shinjuku, 5 nights</p></li><li><p>Kyoto ryokan, 3 nights</p></li></ul><h2>Ideas</h2>${task([["teamLab Planets", true], ["Day trip to Nikko", false], ["Fushimi Inari at sunrise", false], ["Kissaten crawl in Kyoto", false]])}`, null, 2, "map");
  const itinerary = page("Tokyo itinerary", `<h3>Day 1</h3><p>Land at Haneda, Suica card, ramen at Ichiran, early night.</p><h3>Day 2</h3><p>Kiyosumi-Shirakawa coffee, teamLab, Odaiba at night.</p><h3>Day 3</h3><p>Shimokitazawa vintage shops, Shibuya Sky at sunset.</p>`, japan.id, 0);
  const packing = page("Packing list", `${task([["Passport", true], ["JR pass voucher", true], ["Power adapter (type A)", true], ["Light rain jacket", false], ["Comfortable walking shoes", true], ["Coin purse", false]])}`, japan.id, 1);
  const kitchen = page("Meal plan", `<p>Recipes we rotate through, from the Recipes list:</p>${embed(recipes)}<h2>This week</h2><ul><li><p>Mon: miso salmon traybake</p></li><li><p>Wed: chickpea curry</p></li><li><p>Sat: slow-cooked ragu</p></li></ul>`, null, 3, "cooking-pot");
  const reads = page("Books", `<p>The reading list, embedded. Drag cards between columns to update a book's status.</p>${embed(reading)}`, null, 4, "book-open");
  const meeting = page("Notes from the design review", `<p><strong>When:</strong> last Thursday · <strong>Who:</strong> Sam, Priya, me</p><h2>Decisions</h2><ol><li><p>One accent colour for state; everything else stays ink.</p></li><li><p>Mono uppercase for labels only.</p></li><li><p>Charts get a table view for accessibility.</p></li></ol><h2>Follow-ups</h2>${task([["Update the token sheet", true], ["Share the dark theme screenshots", false]])}`, null, 5, "users");
  const pages = Object.fromEntries([welcome, goals, japan, itinerary, packing, kitchen, reads, meeting].map((p) => [p.id, p]));
  await api("/notes/sync", "POST", { pages: { upserts: pages }, databases: { upserts: databases } });
  console.log("notes:", Object.keys(pages).length, "pages,", 4, "lists");
  return { reading, work, projects, rStatus, sDone, wDate, wType, wMin, wKm, pStatus, psActive, rTitle };
}

// =================================================================== HOME
async function home(n, fin) {
  const cur = await api("/home");
  if (Object.keys(cur.dashboards ?? {}).length) { console.log("home: already has dashboards, skipping"); return; }
  const w = (type, x, y, wd, h, config = {}) => ({ id: id(), type, x, y, w: wd, h, config });
  const dash = (name, icon, order, widgets, rows = 8) => ({ id: id(), name, icon, widgets, columns: 12, rows, rowHeight: 80, sizing: "fit", folderId: null, order, createdAt: NOW, updatedAt: NOW });
  const cur0 = fin?.accounts.find((a) => a.name === "Monzo current");
  const today = dash("Today", "house", 0, [
    w("clock", 0, 0, 3, 2, { h24: true, seconds: false, date: true }),
    w("text", 3, 0, 5, 2, { text: "Good to see you.\nThree workouts this week, the ISA is on track, and The Bear is waiting.", align: "left", valign: "center", size: "m", color: null }),
    w("finance.balance", 8, 0, 4, 2, { accountId: cur0?.id ?? "", label: "Current account" }),
    w("watchlist.continue", 0, 2, 6, 3, {}),
    w("list", 6, 2, 3, 3, { source: "basic", title: "Today", items: [{ id: id(), text: "Book dentist", done: false }, { id: id(), text: "Water the plants", done: true }, { id: id(), text: "Pay Amex", done: false }, { id: id(), text: "Call Mum", done: false }] }),
    ...(n ? [w("habit", 9, 2, 3, 3, { databaseId: n.work.id, datePropId: n.wDate.id, viewId: "", weeks: 12, label: "Workouts" })] : []),
    w("finance.spending", 0, 5, 3, 3, {}),
    w("finance.budgets", 3, 5, 4, 3, { limit: 5 }),
    w("finance.recent", 7, 5, 5, 3, { limit: 5, accountId: "" }),
  ]);
  const money = dash("Money", "wallet", 1, [
    w("finance.balance", 0, 0, 3, 2, { accountId: "", label: "Net worth" }),
    w("finance.spending", 3, 0, 3, 2, {}),
    ...(fin ? fin.accounts.filter((a) => ["Rainy day savings", "Stocks ISA"].includes(a.name)).map((a, i) => w("finance.balance", 6 + i * 3, 0, 3, 2, { accountId: a.id, label: a.name })) : []),
    w("finance.trend", 0, 2, 7, 3, {}),
    w("finance.budgets", 7, 2, 5, 3, { limit: 6 }),
    w("finance.recent", 0, 5, 12, 3, { limit: 6, accountId: "" }),
  ]);
  const widgets = [];
  if (n) {
    widgets.push(
      w("metric", 0, 0, 3, 2, { databaseId: n.work.id, viewId: "", propId: n.wMin.id, op: "sum", label: "Minutes trained" }),
      w("metric", 3, 0, 3, 2, { databaseId: n.work.id, viewId: "", propId: n.wKm.id, op: "sum", label: "Kilometres" }),
      w("metric", 6, 0, 3, 2, { databaseId: n.reading.id, viewId: "", propId: "", op: "count", label: "Books on the list" }),
      w("watchlist.stats", 9, 0, 3, 2, { period: "sixMonths" }),
      w("habit", 0, 2, 6, 3, { databaseId: n.work.id, datePropId: n.wDate.id, viewId: "", weeks: 16, label: "Training" }),
      w("chart", 6, 2, 6, 3, { databaseId: n.work.id, viewId: "", kind: "bar", xPropId: n.wType.id, yPropId: n.wMin.id, yAgg: "sum", seriesPropId: "", label: "Minutes by type" }),
      w("db-view", 0, 5, 7, 3, { databaseId: n.projects.id, viewId: n.projects.views[0].id }),
      w("watchlist.queue", 7, 5, 5, 3, {}),
    );
  }
  const life = dash("Life", "activity", 2, widgets);
  await api("/home/sync", "POST", { dashboards: { upserts: Object.fromEntries([today, money, life].map((d) => [d.id, d])) } });
  console.log("home: 3 dashboards");
}

const fin = await finance();
const n = await notes();
await home(n, fin);
await watchlist();
console.log("done");
