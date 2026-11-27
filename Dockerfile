# Production container for Jerry's authenticated cloud API and bundled web UI.
# Build with: docker build -t jerry-backend .
# Apply migrations as a separate release step before starting new application replicas.
FROM oven/bun:1 AS build
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM oven/bun:1 AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/bun.lock ./bun.lock
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server.ts ./server.ts
COPY --from=build /app/src ./src
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/dist ./dist
COPY --from=build /app/firebase-applet-config.json ./firebase-applet-config.json

EXPOSE 3000
CMD ["bun", "server.ts"]
