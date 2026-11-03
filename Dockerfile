# syntax=docker/dockerfile:1
# Pin reviewed image digests in the release record before production promotion.
ARG NODE_IMAGE=node:22.22.0-bookworm-slim
ARG CADDY_IMAGE=caddy:2.10.2-alpine
FROM ${NODE_IMAGE} AS build
ARG RELEASE_COMMIT=unreviewed
LABEL org.opencontainers.image.revision=${RELEASE_COMMIT}
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
# Scripts run only after schema/source are present. Optional public proxy CA stays
# in a BuildKit secret, never an image layer. TLS verification remains enabled.
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --ignore-scripts --strict-ssl=true
COPY . .
ARG VITE_PRIVATE_STAGING=false
ENV VITE_PRIVATE_STAGING=${VITE_PRIVATE_STAGING}
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm run build -w @runsaturday/api && npm run build -w @runsaturday/web

# Migration tooling deliberately separate from the minimal application runtime.
FROM build AS migrate
USER node
WORKDIR /app/apps/api
ENTRYPOINT ["/app/node_modules/.bin/prisma"]
CMD ["migrate", "deploy"]

FROM build AS production-deps
RUN npm prune --omit=dev --ignore-scripts --offline --no-audit

FROM ${NODE_IMAGE} AS api
ARG RELEASE_COMMIT=unreviewed
LABEL org.opencontainers.image.revision=${RELEASE_COMMIT}
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
WORKDIR /app
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY scripts/release/healthcheck.mjs ./healthcheck.mjs
COPY scripts/release/private-*.mjs ./scripts/release/
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=6s --start-period=20s --retries=3 CMD ["node", "/app/healthcheck.mjs"]
CMD ["node", "apps/api/dist/server.js"]

FROM ${CADDY_IMAGE} AS web
ARG RELEASE_COMMIT=unreviewed
LABEL org.opencontainers.image.revision=${RELEASE_COMMIT}
COPY --from=build /app/apps/web/dist /srv
COPY deploy/Caddyfile /etc/caddy/Caddyfile

# Private variant has no ACME or public listeners. API remains the same beta app.
FROM web AS private-web
COPY deploy/Caddyfile.private /etc/caddy/Caddyfile
# Port 8443 needs no privileged bind capability. The base binary's file
# capability prevents exec when the private runtime drops every capability.
RUN setcap -r /usr/bin/caddy
USER 1000:1000

FROM api AS private-api
CMD ["node", "scripts/release/private-api.mjs"]
