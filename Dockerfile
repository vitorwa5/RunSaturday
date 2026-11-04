# syntax=docker/dockerfile:1
# Pin reviewed image digests in the release record before production promotion.
ARG NODE_IMAGE=node:22.22.0-bookworm-slim
ARG CADDY_IMAGE=caddy:2.10.2-alpine
FROM ${NODE_IMAGE} AS node-runtime
# Prisma migration tooling must detect the actual OpenSSL 3 platform rather than
# silently falling back to an incompatible engine. Keep signed APT verification.
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then printf 'Acquire::https::CaInfo "/run/secrets/proxy_ca";\n' > /etc/apt/apt.conf.d/99-build-ca; fi; \
    apt-get update && apt-get install -y --no-install-recommends openssl && \
    rm -rf /var/lib/apt/lists/* /etc/apt/apt.conf.d/99-build-ca

FROM node-runtime AS build
ARG RELEASE_COMMIT=unreviewed
LABEL org.opencontainers.image.revision=${RELEASE_COMMIT}
WORKDIR /app
COPY . .
ARG VITE_PRIVATE_STAGING=false
ENV VITE_PRIVATE_STAGING=${VITE_PRIVATE_STAGING}
# Keep package tarballs out of image layers and avoid repeated full dependency
# snapshots on VFS builders. The same isolated cache supports offline pruning.
# Build contexts may have restrictive local umasks. Public source/configuration
# must remain readable by the final non-root users; external secrets are excluded.
# The public proxy CA remains a BuildKit secret; TLS verification stays enabled.
RUN --mount=type=secret,id=proxy_ca \
    --mount=type=cache,id=compass-phone-npm,target=/root/.npm,sharing=locked \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    chmod -R a+rX /app && \
    npm ci --ignore-scripts --strict-ssl=true && \
    npm run build -w @runsaturday/api && npm run build -w @runsaturday/web

# Migration tooling deliberately separate from the minimal application runtime.
FROM build AS migrate
USER node
WORKDIR /app/apps/api
ENTRYPOINT ["/app/node_modules/.bin/prisma"]
CMD ["migrate", "deploy"]

FROM build AS production-deps
# Optional peers pull test/build tooling into an otherwise production-only tree.
# Runtime imports use the mandatory client/adapter/pg graph; migration stays full.
RUN --network=none --mount=type=cache,id=compass-phone-npm,target=/root/.npm,sharing=locked \
    npm prune --omit=dev --omit=optional --ignore-scripts --offline --no-audit && \
    mkdir -p /runtime/apps/api /runtime/scripts/release && \
    cp -al node_modules /runtime/node_modules && \
    cp -al apps/api/dist /runtime/apps/api/dist && \
    cp scripts/release/healthcheck.mjs /runtime/healthcheck.mjs && \
    cp scripts/release/private-api.mjs scripts/release/private-database.mjs \
       scripts/release/private-policy.mjs scripts/release/private-otp.mjs \
       scripts/release/private-preflight.mjs scripts/release/private-catalogue.mjs \
       scripts/release/private-import.mjs scripts/release/private-migrate.mjs /runtime/scripts/release/

FROM node-runtime AS api
ARG RELEASE_COMMIT=unreviewed
LABEL org.opencontainers.image.revision=${RELEASE_COMMIT}
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
WORKDIR /app
COPY --from=production-deps /runtime/ ./
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=6s --start-period=20s --retries=3 CMD ["node", "/app/healthcheck.mjs"]
CMD ["node", "apps/api/dist/server.js"]

FROM ${CADDY_IMAGE} AS web
ARG RELEASE_COMMIT=unreviewed
LABEL org.opencontainers.image.revision=${RELEASE_COMMIT}
COPY --from=build /app/apps/web/dist /srv
COPY --chmod=0644 deploy/Caddyfile /etc/caddy/Caddyfile

# Private variant has no ACME or public listeners. API remains the same beta app.
FROM web AS private-web
COPY --chmod=0644 deploy/Caddyfile.private /etc/caddy/Caddyfile
# Port 8443 needs no privileged bind capability. The base binary's file
# capability prevents exec when the private runtime drops every capability.
RUN setcap -r /usr/bin/caddy
USER 1000:1000

FROM api AS private-api
CMD ["node", "scripts/release/private-api.mjs"]
