# Deploying Cortex on TrueNAS (custom app, YAML)

You don't build anything on the NAS:

1. GitHub Actions builds the image on every push to `main`
   (`.github/workflows/docker.yml`).
2. It publishes the image to `ghcr.io/fergtato/cortex:latest`.
3. TrueNAS runs that image and tells you when a newer one exists.

The Supabase URL and anon key are **environment variables**, read when the
container starts, so the same image works anywhere. To change them, edit the
app; there's nothing to rebuild.

## One-time setup

### 1. Publish the first image

1. Push to `main`.
2. On GitHub, open **Actions → docker** and wait for the run to go green.
   It takes about 2 minutes.
3. The image appears under your profile → **Packages → cortex**.

### 2. Make the package public

GitHub creates new packages as private, and TrueNAS can't pull a private
image without credentials. Make it public:

1. Open **Packages → cortex → Package settings**.
2. Under **Danger Zone**, choose **Change visibility → Public**.

The image only holds the built frontend. It has no keys, because those come
from the environment.

> Prefer to keep it private? Create a GitHub token with `read:packages`, then
> add it in TrueNAS under **Apps → Configuration → Manage Container Image
> Registries** (registry `ghcr.io`, your GitHub username, the token).

### 3. Install the app in TrueNAS

1. Go to **Apps → Discover Apps → ⋮ (top right) → Install via YAML**.
2. Name it `cortex` and paste:

```yaml
services:
  cortex:
    image: ghcr.io/fergtato/cortex:latest
    pull_policy: always
    ports:
      - "8080:80"            # Cortex at http://<truenas-ip>:8080
    environment:
      SUPABASE_URL: http://192.168.8.183:8000
      SUPABASE_ANON_KEY: <your ANON_KEY>   # public key only, never SERVICE_ROLE_KEY
    restart: unless-stopped
```

3. Click **Save**.
4. Open `http://192.168.8.183:8080` and sign in.

### 4. Tell Supabase about the new address

Password-reset and invite links redirect back to Cortex, so Supabase has to
allow the new address. In the Supabase `docker/.env`:

```bash
SITE_URL=http://192.168.8.183:8080
ADDITIONAL_REDIRECT_URLS=http://192.168.8.183:8080,http://localhost:5173
```

Then run `docker compose up -d` in the Supabase folder.

> Each browser address (origin) keeps its own login and its own
> "data source" choice. Signing in on `localhost:5173` doesn't sign you in on
> `192.168.8.183:8080`. Your data is the same, because both point at the same
> Supabase.

## Updating (the "button")

1. Push your changes to `main`. GitHub builds and publishes a new `:latest`.
2. In TrueNAS **Apps**, the cortex app shows **Update available**. Click
   **Update**, and it pulls the new image and restarts the container.

If the badge hasn't appeared yet (TrueNAS checks periodically), you have two
other options. Both work because of `pull_policy: always`:

- **Stop then Start** the app.
- **Edit → Save** the app without changes.

Either one makes TrueNAS fetch the newest image.

Open browser tabs pick up the new version on their next reload. `index.html`
and `env-config.js` are served with no-cache headers, and the hashed assets
change names on every build.

## Troubleshooting

- **The page loads but shows the localStorage workspace.** That browser saved
  a "localStorage" choice. Go to Settings → data source → Supabase → apply.
  The fields come pre-filled from the container's env.
- **Check the container's config.** Open `http://<truenas-ip>:8080/env-config.js`.
  It should show your URL and key. The container log also prints
  `cortex: runtime config written (supabase url: …)` at start.
- **The image pull fails with "denied".** The GHCR package is still private.
  See step 2.
