# Self-hosting Cortex

Cortex v2 is **one container**. It holds the web app, the API, sign-in, and
your data: a SQLite database and uploaded files in `/data`. Nothing else to
install or connect.

```bash
docker run -d --name cortex -p 8080:8080 -v cortex-data:/data ghcr.io/fergtato/cortex:latest
```

Open `http://<host>:8080`. The first visit asks you to **set up Cortex**, and
the account you create becomes the admin. After that, sign-up is closed.
Add other people from **Settings → Users**.

## Configuration

Everything is optional.

| Variable | Default | What it does |
| --- | --- | --- |
| `CORTEX_URL` | unset | Public address, e.g. `https://cortex.example.com`. Set it when you're behind a reverse proxy or on HTTPS. Unset, Cortex trusts whatever address the browser used, which suits LAN installs. |
| `CORTEX_SECRET` | generated | Signs sessions and encrypts connector tokens. If unset, Cortex generates one on first start and keeps it in `/data/secret`. **Back it up with the data.** |
| `DATABASE_URL` | unset (SQLite) | A Postgres connection string. Used by the hosted version. Self-hosters can stay on SQLite. |
| `ALLOW_SIGNUP` | `false` | `true` lets anyone create an account (hosted mode). |
| `TMDB_API_KEY` | unset | Turns on film and TV lookup in Watchlist (coming soon). |
| `MAX_UPLOAD_MB` | `25` | Largest file upload. |
| `PORT` | `8080` | Port inside the container. |

## Backups

Everything lives in the `/data` volume:

- `cortex.db`: the SQLite database (plus `-wal` and `-shm` files while running)
- `files/`: uploads
- `secret`: the generated secret

To back up, stop the container and copy the volume, or snapshot the dataset on
a NAS. You can also export your data as JSON from Settings (coming with the
Notes port).

## TrueNAS (custom app, YAML)

GitHub Actions builds the image on every push to `main` and publishes it to
`ghcr.io/fergtato/cortex:latest`. The package must be **public**, or TrueNAS
needs registry credentials (**Apps → Configuration → Manage Container Image
Registries**).

**Apps → Discover Apps → ⋮ → Install via YAML**, name it `cortex`:

```yaml
services:
  cortex:
    image: ghcr.io/fergtato/cortex:latest
    pull_policy: always
    ports:
      - "8080:8080"
    volumes:
      - /mnt/<pool>/apps/cortex:/data   # a dataset you snapshot
    restart: unless-stopped
```

The container runs as the `node` user (uid 1000). Give that uid write access
to the dataset: `chown -R 1000:1000 /mnt/<pool>/apps/cortex`.

**Updating:** when TrueNAS shows **Update available**, click **Update**. With
`pull_policy: always`, **Stop** then **Start** also fetches the newest image.
Database migrations run automatically on start.

## Coming from Cortex v0 (Supabase)

v0 data comes across through backup import, which arrives with the Notes port.
Until then, keep running the v0 image alongside. `legacy/docs/` has its setup
guides.
