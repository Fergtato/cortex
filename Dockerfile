# Cortex: one container, app + API + data.
#   docker run -p 8080:8080 -v cortex-data:/data ghcr.io/fergtato/cortex
# SQLite and uploaded files live in /data. See docs/self-hosting.md.

# --- build web + server ---
FROM node:24-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY packages/ui/package.json packages/ui/
COPY packages/core/package.json packages/core/
COPY packages/icons/package.json packages/icons/
COPY modules/home/package.json modules/home/
COPY modules/notes/package.json modules/notes/
# --ignore-scripts: better-sqlite3 has a binding.gyp, so npm 11 would try to
# compile it (no toolchain on alpine). It ships prebuilt N-API binaries for
# musl, which it loads at runtime, so nothing needs to build here. Same
# behaviour as npm 12 locally, which doesn't run install scripts by default.
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

# --- runtime: Node + the bundled server + static web + the one native dep ---
FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data \
    WEB_DIST=/app/web
WORKDIR /app
COPY --from=build /src/apps/server/dist ./server
COPY --from=build /src/apps/web/dist ./web
# better-sqlite3 ships prebuilt N-API binaries (incl. musl), so no toolchain is needed.
COPY --from=build /src/node_modules/better-sqlite3/package.json ./node_modules/better-sqlite3/package.json
COPY --from=build /src/node_modules/better-sqlite3/lib ./node_modules/better-sqlite3/lib
COPY --from=build /src/node_modules/better-sqlite3/prebuilds ./node_modules/better-sqlite3/prebuilds
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server/server.mjs"]
