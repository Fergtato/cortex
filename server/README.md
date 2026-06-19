# Cortex server

A tiny local API that stores the app's data in SQLite, as an alternative to the
browser's localStorage.

## Run it

```bash
cd server
npm install          # if your global npm cache errors with EACCES, add: --cache /tmp/cortex-npm-cache
npm start            # → http://localhost:3001
```

Data is written to `server/data.db` (a SQLite file). Delete that file to reset.

## Point the app at it

In the app: **⚙ settings → data source → API (SQLite)**, set the URL to
`http://localhost:3001`, click **test connection**, then **apply** (the app
reloads against the API).

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET`  | `/api/health` | health check (`{ ok: true }`) |
| `GET`  | `/api/pages` | all pages, as a map keyed by id |
| `PUT`  | `/api/pages` | replace all pages (body = the map) |
| `GET`  | `/api/databases` | all databases, as a map keyed by id |
| `PUT`  | `/api/databases` | replace all databases (body = the map) |

## Inspect the data

```bash
sqlite3 server/data.db "SELECT id, json_extract(data,'$.title') FROM pages;"
```
