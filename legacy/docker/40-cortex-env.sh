#!/bin/sh
# Runs on container start (nginx image executes /docker-entrypoint.d/*.sh).
# Writes the runtime config the app reads before booting, so one image works
# for any Supabase instance — no rebuild needed to change URL or key.
set -eu
esc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
URL="$(esc "${SUPABASE_URL:-}")"
KEY="$(esc "${SUPABASE_ANON_KEY:-}")"
cat > /usr/share/nginx/html/env-config.js <<JS
window.__CORTEX_CONFIG__ = { supabaseUrl: "${URL}", supabaseAnonKey: "${KEY}" };
JS
echo "cortex: runtime config written (supabase url: ${SUPABASE_URL:-<unset>})"
