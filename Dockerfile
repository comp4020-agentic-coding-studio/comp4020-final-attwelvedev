# syntax = docker/dockerfile:1

# The image Fly builds and runs: install, build, then keep only the built
# server and its production dependencies.

ARG NODE_VERSION=24
FROM node:${NODE_VERSION}-slim AS base

WORKDIR /app
ENV NODE_ENV=production

ARG PNPM_VERSION=11.9.0
RUN npm install -g pnpm@$PNPM_VERSION

# --- build stage: install everything, build, then prune to prod deps -------
FROM base AS build

# toolchain for native modules (better-sqlite3), in case no prebuilt binary
# matches the image platform
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential pkg-config python-is-python3

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

COPY . .
RUN pnpm run build
RUN pnpm prune --prod

# --- runtime stage: just the built server and its production deps ----------
FROM base

COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/dist /app/dist
# server.ts runs under Node type stripping and imports the socket code in src/
COPY --from=build /app/server.ts /app/server.ts
COPY --from=build /app/src /app/src
# the room files the game loads at boot (src/game/rooms/load.ts)
COPY --from=build /app/rooms /app/rooms
# the committed migrations, applied at boot (see src/lib/db.ts)
COPY --from=build /app/drizzle /app/drizzle

# fly.toml only sets PORT, so the rest of the runtime config lives here
ENV HOST=0.0.0.0
ENV PORT=8080
ENV DATABASE_PATH=/data/app.db
EXPOSE 8080
CMD ["node", "server.ts"]
