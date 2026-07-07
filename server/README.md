# Cortex server

A tiny API that stores the app's data in SQLite, as an alternative to the
browser's localStorage. Run it locally for durability, or deploy it somewhere
always-on to reach the same data from **any device**.

## Run it locally

```bash
cd server
npm install          # if your global npm cache errors with EACCES, add: --cache /tmp/cortex-npm-cache
npm start            # → http://localhost:3001
```

Data is written to `server/data.db` (a SQLite file). Delete that file to reset.

## Point the app at it

In the app: **⚙ settings → data source → API (SQLite)**, set the URL (and the
token, if the server has one), click **test connection**, then **apply** (the
app reloads against the API).

## Authentication

Set `CORTEX_TOKEN` to require a bearer token on every `/api/*` route except
`/api/health`:

```bash
CORTEX_TOKEN="$(openssl rand -hex 24)" npm start
```

Enter the same token in **settings → data source → token**. Requests without
it get `401`. Optionally set `CORS_ORIGIN` (e.g. `https://cortex.example.com`)
to restrict which sites may call the API from a browser.

> **Always set a token (and use HTTPS) when the API is reachable beyond
> localhost.** Anyone who can reach the port can otherwise read and write all
> of your data.

## Environment variables

| Var | Default | Purpose |
|-----|---------|---------|
| `PORT` | `3001` | Listen port |
| `DB_PATH` | `./data.db` | SQLite file location (mount a volume here) |
| `CORTEX_TOKEN` | *(unset — open)* | Require `Authorization: Bearer <token>` |
| `CORS_ORIGIN` | `*` | Allowed browser origin |

## Deploy for any-device access

The standard shape for a single-user app like this: one small always-on
server + this single SQLite file, behind HTTPS, protected by the token.

**Fly.io / Railway (least effort, HTTPS included)** — deploy the `server/`
directory with its Dockerfile. Mount a persistent volume and point `DB_PATH`
at it, and set `CORTEX_TOKEN` as a secret. e.g. Fly:

```bash
cd server
fly launch --no-deploy          # generates fly.toml; pick a region
fly volumes create cortex_data --size 1
# in fly.toml: [mounts] source = "cortex_data", destination = "/data"
#              [env]    DB_PATH = "/data/data.db"
fly secrets set CORTEX_TOKEN=…
fly deploy
```

**Small VPS / Raspberry Pi** — run the repo's `docker-compose.yml` with a
`.env` file containing `CORTEX_TOKEN=…`, then put Caddy in front for
automatic HTTPS (`caddy reverse-proxy --from cortex.example.com --to
localhost:3001`), or use a **Cloudflare Tunnel** for HTTPS with no open ports.

**Frontend hosting** — `npm run build` at the repo root produces a static
`dist/` you can serve from anywhere (nginx, Netlify, Pages…). Each device's
browser just needs the app pointed at the API URL + token in settings.

## Backups

The database is one file — copy it while the server is idle, or use SQLite's
online backup for a consistent snapshot at any time:

```bash
sqlite3 server/data.db ".backup 'backup-$(date +%F).db'"
```

For continuous off-site backup, run [Litestream](https://litestream.io)
alongside the server to replicate `data.db` to S3/B2/etc.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET`  | `/api/health` | health check (`{ ok: true }`), never requires auth |
| `GET`  | `/api/pages` | all pages, as a map keyed by id |
| `PATCH`| `/api/pages` | apply an incremental delta `{ upserts, deletes }` |
| `PUT`  | `/api/pages` | replace all pages (bulk import/restore) |
| `GET`  | `/api/databases` | all databases, as a map keyed by id |
| `PATCH`| `/api/databases` | apply an incremental delta `{ upserts, deletes }` |
| `PUT`  | `/api/databases` | replace all databases (bulk import/restore) |

## Inspect the data

```bash
sqlite3 server/data.db "SELECT id, json_extract(data,'$.title') FROM pages;"
```

## A note on multi-device use

Saves are last-write-wins per entity (the app diffs and PATCHes only what
changed, debounced 250 ms). That's fine for one person moving between
devices; simultaneous editing of the same page on two devices will keep the
later write. Real-time merge/CRDT sync is intentionally out of scope.
