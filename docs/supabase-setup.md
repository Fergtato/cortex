# Connecting Cortex to a self-hosted Supabase

Cortex stores everything in Supabase:

- pages, databases, and dashboards go in Postgres, one row per entity
- images go in a private Storage bucket
- dashboard API connections go through an Edge Function proxy

Each account sees **only its own data** (Row Level Security). Accounts are
**invite-only**: nobody can sign up from the app, and you create every account
in Supabase Studio.

The steps below assume the standard self-hosted Docker setup (the `docker/`
folder from the `supabase/supabase` repo). Paths like `docker/.env` are
relative to that checkout.

---

## 1. Configure Auth on the Supabase server

Edit `docker/.env`:

```bash
# --- who can create accounts ---
DISABLE_SIGNUP=true            # no public sign-up: you create users in Studio
ENABLE_EMAIL_SIGNUP=true       # keep this TRUE: it enables the email/password
                               # provider itself (sign-in), not public sign-up
ENABLE_ANONYMOUS_USERS=false
ENABLE_PHONE_SIGNUP=false

# --- where auth emails link back to (your Cortex URL) ---
SITE_URL=https://cortex.example.com
ADDITIONAL_REDIRECT_URLS=https://cortex.example.com,http://localhost:5173,http://localhost:8080

# --- your public Supabase URL (what browsers use) ---
API_EXTERNAL_URL=https://supabase.example.com
SUPABASE_PUBLIC_URL=https://supabase.example.com
```

Invite and password-reset **emails need SMTP**. Fill these in if you want to
use them:

```bash
SMTP_ADMIN_EMAIL=admin@example.com
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_SENDER_NAME=Cortex
```

You can skip SMTP and still log in. Create users with a password in step 4,
and set `ENABLE_EMAIL_AUTOCONFIRM=true` (or tick "Auto Confirm User" when you
create them).

Apply the changes:

```bash
cd docker
docker compose up -d
```

## 2. Create the database schema

1. Open Studio → **SQL Editor** → **New query**.
2. Paste the whole of [`supabase/migrations/0001_cortex.sql`](../supabase/migrations/0001_cortex.sql).
3. Click **Run**. It is idempotent, so running it again later is safe.

It creates:

- `pages`, `databases`, `dashboards` tables, each with per-user RLS policies
- `connections`, plus `connection_secrets`, which no client can read
- the `set_connection_token()` function
- a private `cortex-files` Storage bucket (images only, 10 MB max) with
  per-user folder policies

To check it worked:

- **Table Editor** shows the five tables with the RLS badge.
- **Storage** shows the `cortex-files` bucket.

## 3. Deploy the `proxy` Edge Function

This is only needed if you use dashboard API connection widgets.

```bash
# from the cortex repo
cp -r supabase/functions/proxy  /path/to/supabase/docker/volumes/functions/proxy

# from the supabase docker folder
docker compose restart functions --no-deps
```

The function reaches the network from the `functions` container. A connection
pointing at `localhost` therefore means *that container*, not your host. Use
the host's LAN address or a Docker service name instead.

> Docker's `unix:///var/run/docker.sock` cannot be proxied any more. To show
> Docker data, run a socket proxy such as `tecnativa/docker-socket-proxy` on
> the same Docker network and point the connection at
> `http://docker-socket-proxy:2375`.

## 4. Create accounts (you control who gets in)

Go to Studio → **Authentication** → **Users** → **Add user**, and pick one:

- **Create new user**: enter an email and password and tick **Auto Confirm
  User**. Give the person the password. This works without SMTP.
- **Send invitation**: they get an email and land in Cortex on a
  "choose a password" screen. This needs SMTP.

Repeat for every person you want to allow.

- **To remove access:** delete the user in Studio. Their rows and files are
  deleted with them (`on delete cascade`). Storage objects may need deleting
  from the bucket by hand.
- **To lock someone out temporarily:** use **Ban user** in the user's menu.

## 5. Find the URL and anon key

In `docker/.env`, copy these:

- `SUPABASE_PUBLIC_URL`, e.g. `https://supabase.example.com`
- `ANON_KEY`, the public key

**Never** put `SERVICE_ROLE_KEY` into Cortex. It bypasses all security.

## 6. Export your existing data (before switching)

In your current Cortex (localStorage or the old SQLite build), open
**⚙ settings → backup → [ export backup ]**. Keep the `.json` file safe.

> If your data is in the old SQLite server, export it from a build of Cortex
> that still has the SQLite data source (any commit before the Supabase
> switch), pointed at that server.

## 7. Point Cortex at Supabase

1. Open **⚙ settings → data source → Supabase**.
2. Enter the **supabase url** and **anon key** from step 5.
3. Click **test connection** and wait for `✓ connected`.
4. Click **[ apply ]**. The app reloads to a sign-in screen.
5. Sign in with an account from step 4.

## 8. Import your backup

Open **⚙ settings → backup → [ import backup ]**, choose the file from step 6,
and confirm. Inline images are uploaded to Storage as part of the import, and
you'll see a counter while that runs. Your theme settings are restored too.

## 9. Re-create API connections

Backups never contain connection tokens, so add your connections again under
**⚙ settings → api connections**. Tokens are stored in `connection_secrets`,
which only the Edge Function can read.

## 10. (Optional) Bake the config into the Docker build

Create `.env` next to Cortex's `docker-compose.yml`:

```bash
VITE_SUPABASE_URL=https://supabase.example.com
VITE_SUPABASE_ANON_KEY=<anon key>
```

Then:

```bash
docker compose up -d --build
```

New browsers then default to Supabase and go straight to the sign-in screen.

---

## Notes

- **Backups in Supabase mode** contain `cortex-file:` image refs, not the image
  bytes. Images stay in the `cortex-files` bucket, so back that up too (or the
  whole Supabase volume).
- **Removing an image** from a page doesn't delete the file from Storage.
- **Switching back to localStorage** is always possible from Settings, or from
  the "use this browser's local storage instead" link on the sign-in screen.
- **Postgres row limit.** PostgREST returns at most `PGRST_DB_MAX_ROWS` rows
  per request (1000 by default). Cortex pages through results, so you don't
  need to change it.
