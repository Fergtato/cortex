// Fills a Cortex account with realistic demo data through the public API:
// Notes pages and lists, three Home dashboards, six months of Finance
// (accounts, budgets, rules, transfers, a yen trip) and a Watchlist with
// real TMDB titles (the instance needs a TMDB key), and a cookbook with a
// week plan. Modules that already
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


// ================================================================ RECIPES
async function recipes() {
  const have = await api("/recipes/recipes");
  if (have.recipes.length) { console.log("recipes: already has recipes, skipping"); return; }
  // [title, subtitle, art, servings, prep, cook, kcal, level, tags, intro, ingredients [qty, unit, name, note], equipment, steps [title, text, min, handsOff, afterStep#]]
  const R = [
    ["Crispy chicken thighs", "with cucumber tomato salad and brown butter corn", "bowl", 2, 10, 20, 690, "easy", ["Dinner", "Under 30 mins", "High protein", "Family friendly"],
      "Toasting butter in the pan gives it an incredibly nutty flavour and aroma.",
      [[2, "", "corn on the cob", ""], [2, "", "Persian cucumbers", ""], [115, "g", "grape tomatoes", ""], [7, "g", "chives", ""], [1, "", "lemon", ""], [50, "g", "panko breadcrumbs", "Contains: wheat"], [1, "tbsp", "fry seasoning", ""], [340, "g", "chicken thighs", "boneless"], [2, "tbsp", "sour cream", "Contains: milk"], [1, "tbsp", "butter", ""], [null, "", "olive oil", ""]],
      ["2 medium bowls", "Large bowl", "2 large pans"],
      [["Preheat and prep", "Wash and dry all produce. Preheat the oven to 200°C. Cut the corn kernels from the cob. Slice the cucumbers into thin rounds. Halve the tomatoes and thinly slice the chives. Cut the lemon into wedges.", 6],
       ["Toss salad", "Put the cucumbers, tomatoes and 1 tbsp chives in a medium bowl with a large drizzle of olive oil. Season with salt and pepper and set aside.", 3],
       ["Crust chicken", "Stir together the panko, fry seasoning, salt and pepper in a bowl. In another bowl, toss the chicken with the sour cream, then press into the panko to coat all over.", 4],
       ["Cook chicken", "Heat a drizzle of olive oil in a large ovenproof pan over medium-high heat. Brown the chicken 3–4 minutes per side, then roast in the oven until cooked through.", 12, true],
       ["Cook corn", "Meanwhile, melt the butter in another pan over medium heat. Add the corn and cook, tossing, until golden and the butter smells nutty. Season.", 6],
       ["Plate and serve", "Divide the corn, salad and chicken between plates. Squeeze over some lemon and garnish with the remaining chives.", 2, false, 4]]],
    ["Spaghetti carbonara", "the Roman way: no cream, lots of pepper", "pasta", 2, 5, 15, 720, "medium", ["Dinner", "Italian", "Quick & easy", "Under 30 mins", "Comfort food"],
      "The sauce is just eggs, cheese and pasta water. Take the pan off the heat before the eggs go in, or they scramble.",
      [[200, "g", "spaghetti", ""], [120, "g", "guanciale", "or pancetta, cut into strips"], [3, "", "egg yolks", ""], [1, "", "egg", ""], [50, "g", "pecorino romano", "finely grated"], [null, "", "black pepper", "freshly cracked"]],
      ["Large pot", "Frying pan", "Bowl"],
      [["Boil the water", "Bring a large pot of well-salted water to the boil.", 8, true],
       ["Make the sauce", "Whisk the egg yolks, egg and most of the pecorino with lots of black pepper.", 3],
       ["Crisp the guanciale", "Cook the guanciale in a dry pan over medium heat until the fat renders and it's crisp.", 6],
       ["Cook the pasta", "Cook the spaghetti until just al dente. Save a mug of pasta water.", 9, true, 1],
       ["Bring it together", "Off the heat, toss the pasta with the guanciale, then the egg mixture and a splash of pasta water until glossy. Serve with the rest of the pecorino.", 2, false, 4]]],
    ["Thai green curry", "with chicken, green beans and jasmine rice", "curry", 4, 15, 25, 610, "easy", ["Dinner", "Thai", "Spicy", "Batch cook"],
      "Fry the paste in the coconut cream until it splits and smells fragrant: that's where the flavour comes from.",
      [[300, "g", "jasmine rice", ""], [600, "g", "chicken thighs", "sliced"], [3, "tbsp", "green curry paste", ""], [400, "ml", "coconut milk", ""], [200, "g", "green beans", "trimmed"], [1, "", "red pepper", "sliced"], [1, "tbsp", "fish sauce", ""], [1, "tsp", "sugar", ""], [1, "", "lime", ""], [1, "bunch", "Thai basil", ""]],
      ["Saucepan with lid", "Wok or large pan"],
      [["Rinse and cook the rice", "Rinse the rice, then simmer with 450ml water, covered, for 12 minutes. Rest off the heat.", 15, true],
       ["Fry the paste", "Heat the thick coconut cream from the top of the tin in a wok and fry the curry paste until fragrant.", 3],
       ["Seal the chicken", "Add the chicken and stir-fry until coated and starting to colour.", 5],
       ["Simmer", "Pour in the rest of the coconut milk with the beans and pepper. Simmer until the chicken is cooked.", 10, true],
       ["Season and serve", "Season with fish sauce, sugar and lime juice. Tear in the basil and serve with the rice.", 2, false, 4]]],
    ["Shakshuka", "eggs in spiced tomato and pepper sauce", "breakfast", 2, 10, 20, 380, "easy", ["Breakfast", "Vegetarian", "One pot", "Middle Eastern", "Gluten free"],
      "Make wells in the sauce with a spoon so the eggs stay put while they poach.",
      [[1, "tbsp", "olive oil", ""], [1, "", "onion", "sliced"], [2, "", "red peppers", "sliced"], [2, "cloves", "garlic", "crushed"], [1, "tsp", "cumin", ""], [1, "tsp", "smoked paprika", ""], [400, "g", "chopped tomatoes", ""], [4, "", "eggs", ""], [50, "g", "feta", "crumbled"], [null, "", "parsley", "to serve"], [null, "", "crusty bread", "to serve"]],
      ["Deep frying pan with lid"],
      [["Soften the veg", "Fry the onion and peppers in the oil over medium heat until soft and sweet.", 8],
       ["Spice it", "Add the garlic, cumin and paprika and cook for a minute.", 1],
       ["Simmer the sauce", "Tip in the tomatoes, season, and simmer until thickened.", 8, true],
       ["Poach the eggs", "Make four wells, crack in the eggs, cover and cook until the whites are set.", 6, true],
       ["Finish", "Scatter with feta and parsley. Serve straight from the pan with bread.", 1, false, 4]]],
    ["Miso salmon traybake", "with tenderstem and sesame rice", "fish", 2, 10, 20, 560, "easy", ["Dinner", "Healthy", "High protein", "Japanese", "Under 30 mins"],
      "",
      [[2, "", "salmon fillets", ""], [1, "tbsp", "white miso", ""], [1, "tbsp", "honey", ""], [1, "tsp", "soy sauce", ""], [200, "g", "tenderstem broccoli", ""], [150, "g", "basmati rice", ""], [1, "tbsp", "sesame seeds", ""], [2, "", "spring onions", "sliced"]],
      ["Baking tray", "Small saucepan"],
      [["Start the rice", "Cook the rice according to the packet.", 15, true],
       ["Glaze the salmon", "Heat the oven to 200°C. Mix the miso, honey and soy and spread over the salmon on a lined tray.", 4],
       ["Roast", "Add the broccoli around the salmon with a drizzle of oil. Roast until the salmon flakes.", 12, true],
       ["Serve", "Stir the sesame seeds and spring onions through the rice. Serve with the salmon and broccoli.", 2, false, 3]]],
    ["Roasted tomato soup", "with basil and grilled cheese soldiers", "soup", 4, 10, 45, 420, "easy", ["Lunch", "Vegetarian", "Comfort food", "Freezer friendly", "Winter"],
      "Roasting the tomatoes first concentrates them. Use the ripest you can find.",
      [[1, "kg", "tomatoes", "halved"], [1, "", "red onion", "quartered"], [4, "cloves", "garlic", ""], [2, "tbsp", "olive oil", ""], [500, "ml", "vegetable stock", ""], [1, "bunch", "basil", ""], [4, "slices", "sourdough", ""], [80, "g", "cheddar", "grated"]],
      ["Roasting tin", "Blender", "Large pan"],
      [["Roast the veg", "Toss the tomatoes, onion and garlic with oil and salt. Roast at 200°C until soft and charred at the edges.", 35, true],
       ["Make the toasties", "Sandwich the cheddar between the sourdough and toast in a dry pan until golden. Cut into soldiers.", 8],
       ["Blend", "Tip the veg into a pan with the stock and basil. Blend until smooth and warm through.", 6, false, 1]]],
    ["Beef tacos", "with quick pickled onions and lime crema", "taco", 4, 20, 15, 650, "easy", ["Dinner", "Mexican", "Family friendly", "Date night"],
      "",
      [[500, "g", "beef mince", "5% fat"], [1, "tbsp", "chipotle paste", ""], [1, "tsp", "cumin", ""], [8, "", "small tortillas", ""], [1, "", "red onion", "thinly sliced"], [3, "tbsp", "lime juice", ""], [100, "ml", "soured cream", ""], [1, "", "avocado", ""], [null, "", "coriander", "to serve"]],
      ["Frying pan", "Small bowl"],
      [["Pickle the onions", "Cover the onion with lime juice and a pinch of salt and sugar. Leave to pickle.", 2],
       ["Cook the beef", "Brown the mince in a hot pan, breaking it up, then add the chipotle and cumin.", 10],
       ["Make the crema", "Stir a squeeze of lime into the soured cream and season.", 2],
       ["Warm and fill", "Warm the tortillas, fill with beef, avocado, crema, pickled onions and coriander.", 4]]],
    ["Banana bread", "one bowl, very forgiving", "bread", 10, 15, 55, 290, "easy", ["Baking", "Snack", "Vegetarian", "Freezer friendly"],
      "The blacker the bananas, the better it'll be.",
      [[3, "", "very ripe bananas", ""], [75, "g", "butter", "melted"], [150, "g", "light brown sugar", ""], [1, "", "egg", ""], [1, "tsp", "vanilla extract", ""], [1, "tsp", "bicarbonate of soda", ""], [190, "g", "plain flour", ""], [60, "g", "walnuts", "chopped, optional"]],
      ["Loaf tin", "Mixing bowl"],
      [["Mix", "Heat the oven to 175°C. Mash the bananas, then stir in the butter, sugar, egg and vanilla.", 8],
       ["Fold in", "Fold in the bicarbonate, a pinch of salt, the flour and walnuts until just combined.", 4],
       ["Bake", "Scrape into a lined loaf tin and bake until a skewer comes out clean.", 55, true],
       ["Cool", "Cool in the tin for 10 minutes, then on a rack.", 10, true, 3]]],
    ["Veggie ramen", "with crispy tofu and soft eggs", "noodles", 2, 15, 20, 540, "medium", ["Dinner", "Vegetarian", "Japanese", "Healthy"],
      "Six and a half minutes from boiling gives jammy yolks.",
      [[2, "", "eggs", ""], [200, "g", "firm tofu", "cubed"], [1, "tbsp", "cornflour", ""], [800, "ml", "vegetable stock", ""], [2, "tbsp", "white miso", ""], [1, "tbsp", "soy sauce", ""], [2, "nests", "ramen noodles", ""], [100, "g", "pak choi", ""], [2, "", "spring onions", ""], [1, "tsp", "chilli oil", ""]],
      ["2 saucepans", "Frying pan"],
      [["Soft-boil the eggs", "Lower the eggs into boiling water for 6½ minutes, then into cold water.", 7, true],
       ["Crisp the tofu", "Toss the tofu in cornflour and fry until golden on all sides.", 8],
       ["Make the broth", "Warm the stock, whisk in the miso and soy. Add the pak choi for the last 2 minutes.", 6],
       ["Noodles and build", "Cook the noodles, divide between bowls, ladle over the broth and top with tofu, halved eggs, spring onions and chilli oil.", 4]]],
    ["Overnight oats", "with berries and peanut butter", "breakfast", 1, 5, null, 410, "easy", ["Breakfast", "Meal prep", "Vegetarian", "Quick & easy"],
      "",
      [[50, "g", "rolled oats", ""], [120, "ml", "milk", "any kind"], [2, "tbsp", "Greek yoghurt", ""], [1, "tsp", "chia seeds", ""], [1, "tbsp", "peanut butter", ""], [80, "g", "mixed berries", ""]],
      ["Jar with lid"],
      [["Mix", "Stir the oats, milk, yoghurt and chia together in a jar.", 2],
       ["Chill overnight", "Cover and refrigerate overnight.", null, true],
       ["Top", "In the morning, top with berries and peanut butter.", 1, false, 2]]],
    ["Margherita pizza", "on a no-knead overnight dough", "pizza", 2, 20, 10, 780, "medium", ["Dinner", "Italian", "Vegetarian", "Date night"],
      "",
      [[250, "g", "strong white flour", ""], [1, "tsp", "dried yeast", ""], [160, "ml", "warm water", ""], [100, "g", "passata", ""], [125, "g", "mozzarella", "torn"], [null, "", "basil", ""], [null, "", "olive oil", ""]],
      ["Baking steel or tray", "Mixing bowl"],
      [["Make the dough", "Mix the flour, yeast, water and a pinch of salt into a shaggy dough. Cover and leave in the fridge overnight.", 10],
       ["Heat the oven", "Heat the oven and a baking steel to the highest setting.", 30, true],
       ["Shape", "Stretch the dough into two rounds, spread with seasoned passata and scatter with mozzarella.", 8],
       ["Bake", "Slide onto the steel and bake until blistered.", 8, true, 2],
       ["Finish", "Top with basil and a drizzle of oil.", 1, false, 4]]],
    ["Halloumi grain bowl", "with harissa yoghurt and roasted squash", "bowl", 2, 15, 30, 640, "easy", ["Lunch", "Vegetarian", "Healthy", "Meal prep"],
      "",
      [[400, "g", "butternut squash", "cubed"], [150, "g", "bulgur wheat", ""], [225, "g", "halloumi", "sliced"], [100, "g", "Greek yoghurt", ""], [1, "tbsp", "harissa", ""], [1, "", "pomegranate", "seeds only"], [60, "g", "rocket", ""], [null, "", "mint", ""]],
      ["Roasting tin", "Saucepan", "Griddle pan"],
      [["Roast the squash", "Toss the squash with oil and salt and roast at 200°C until golden.", 25, true],
       ["Cook the bulgur", "Simmer the bulgur in salted water, then drain and fluff up.", 12, true],
       ["Harissa yoghurt", "Swirl the harissa through the yoghurt.", 2],
       ["Griddle the halloumi", "Griddle the halloumi until charred on both sides.", 5, false, 1],
       ["Build the bowls", "Divide the bulgur, squash, rocket and halloumi. Spoon over the yoghurt and scatter with pomegranate and mint.", 3]]],
  ];
  const ids = [];
  for (const [title, subtitle, art, servings, prepMin, cookMin, calories, difficulty, tags, intro, ings, equipment, steps] of R) {
    const stepIds = steps.map(() => id());
    const r = await api("/recipes/recipes", "POST", {
      title, subtitle, intro, hero: `art:${art}`, servings, prepMin, cookMin, calories, difficulty, tags, equipment, notes: "", sourceUrl: "",
      ingredients: ings.map(([qty, unit, name, note]) => ({ id: id(), qty, unit, name, note })),
      steps: steps.map(([t, text, minutes, handsOff, after], i) => ({ id: stepIds[i], title: t, text, minutes: minutes ?? null, handsOff: !!handsOff, after: after ? stepIds[after - 1] : null, image: null })),
    });
    ids.push(r.id);
  }
  // Favourites and a cooking history (a few not made for a while).
  for (const i of [0, 1, 2, 4, 7]) await api(`/recipes/recipes/${ids[i]}`, "PATCH", { favourite: true });
  for (const [i, ago] of [[0, 3], [0, 17], [0, 40], [1, 9], [1, 60], [2, 12], [3, 45], [4, 6], [5, 80], [6, 21], [7, 50], [7, 120], [9, 2], [9, 5]]) {
    await api(`/recipes/recipes/${ids[i]}`, "PATCH", { cooked: true, date: iso(daysAgo(ago)) });
  }
  // This week's plan, Monday to Sunday.
  const monday = new Date(TODAY); monday.setDate(TODAY.getDate() - ((TODAY.getDay() + 6) % 7));
  const day = (n) => { const d = new Date(monday); d.setDate(monday.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  for (const [n, i, note] of [[0, 2], [0, 9], [1, 4], [2, 1], [3, null, "Leftover curry"], [4, 6], [5, null, "Eating out"], [5, 3], [6, 10], [6, 7]]) {
    await api("/recipes/plan", "POST", { date: day(n), recipeId: i === null ? null : ids[i], note: note ?? "" });
  }
  console.log(`recipes: ${ids.length} recipes, plan for this week`);
  // Put the week and tonight's meal on the Life dashboard.
  const homeState = await api("/home");
  const life = Object.values(homeState.dashboards ?? {}).find((d) => d.name === "Life");
  if (life && !life.widgets.some((w) => w.type.startsWith("recipes."))) {
    const y = life.widgets.reduce((m, w) => Math.max(m, w.y + w.h), 0);
    life.widgets.push({ id: id(), type: "recipes.tonight", x: 0, y, w: 6, h: 3, config: {} }, { id: id(), type: "recipes.week", x: 6, y, w: 6, h: 3, config: {} });
    life.rows = Math.max(life.rows ?? 8, y + 3);
    life.updatedAt = Date.now();
    await api("/home/sync", "POST", { dashboards: { upserts: { [life.id]: life } } });
    console.log("recipes: widgets added to the Life dashboard");
  }
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
await recipes();
console.log("done");
