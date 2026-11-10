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
| `TMDB_API_KEY` | unset | The TMDB key Watchlist uses (a v4 read access token or a v3 key). Optional: an admin can instead paste it in **Settings → Watchlist**, where it's stored encrypted. The env var wins if both are set. |
| `TMDB_REGION` | `GB` | Default region for "In cinemas" and "Upcoming". Admins can change it in Settings → Watchlist. |
| `PROXY_PRIVATE_NETWORKS` | `allow` (`deny` when `ALLOW_SIGNUP=true`) | Whether API connections may reach private addresses (LAN, localhost). Self-hosters want `allow` to reach home devices. A hosted instance must use `deny` so people can't probe the server's network. |
| `MAX_UPLOAD_MB` | `25` | Largest file upload. |
| `PORT` | `8080` | Port inside the container. |

## Backups

Everything lives in the `/data` volume:

- `cortex.db`: the SQLite database (plus `-wal` and `-shm` files while running)
- `files/`: uploads
- `secret`: the generated secret

To back up, stop the container and copy the volume, or snapshot the dataset on
a NAS. You can also download everything (notes, dashboards…) as one JSON file
from **Settings → Backup**. API connection tokens are not in that file; they
stay encrypted in the database.

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

## Watchlist and TMDB

Watchlist gets movie and TV data from [TMDB](https://www.themoviedb.org/).
Create a free account, open **Settings → API**, and copy the **API Read
Access Token**. Then either paste it in Cortex (**Settings → Watchlist**,
admins only) or set `TMDB_API_KEY`. One key serves everyone on the instance.
The server calls TMDB and caches responses, so the key never reaches
browsers. Posters load directly from TMDB's image servers.

## Coming from Cortex v0 (Supabase)

1. In v0, open **settings** and click **[ export backup ]**.
2. In v2, open **Settings → Backup → Choose backup file**.
3. If the backup has images stored in Supabase, keep **Copy images from my old
   Supabase** ticked. Enter the Supabase URL (e.g. `http://192.168.1.10:8000`),
   the **anon** key, and your v0 email and password. The browser signs in and
   copies each image to v2. Nothing is saved.
4. Choose **Add to what I have** or **Replace what I have**, then **Import**.

Pages, databases and dashboards (with folders) all come across. v0 API
connections aren't in the backup because their tokens never left Supabase, so
re-add them in **Settings → Connections** using the same names. Then open each
API widget's settings and pick the connection again. A v0 TMDB connection
isn't needed any more: Watchlist has its own TMDB setting.

If v2 is on HTTPS and Supabase on plain HTTP, the browser blocks the image
copy. Run the import from an `http://` address of v2, or skip images.
