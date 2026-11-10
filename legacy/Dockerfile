# --- build the static frontend ---
FROM node:22-slim AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

# --- serve it with nginx ---
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
# Writes env-config.js from SUPABASE_URL / SUPABASE_ANON_KEY at container start.
COPY docker/40-cortex-env.sh /docker-entrypoint.d/40-cortex-env.sh
RUN chmod +x /docker-entrypoint.d/40-cortex-env.sh

EXPOSE 80
