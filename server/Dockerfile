# API + SQLite backend

# --- deps stage: compile native modules (better-sqlite3) with a toolchain ---
FROM node:22-slim AS deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# --- runtime: slim image carrying the prebuilt node_modules ---
FROM node:22-slim
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY index.js ./

# SQLite file lives on a mounted volume so data survives container restarts.
ENV DB_PATH=/data/data.db
ENV PORT=3001

EXPOSE 3001
CMD ["node", "index.js"]
