# syntax=docker/dockerfile:1

# The MOJ web app: a Next.js standalone server plus the Typst toolchain the PDF
# route shells out to.
#
# Build from the repository root, because the image needs the whole workspace:
#
#   docker build -f apps/web/Dockerfile -t moj-web:local .
#
# The site's public origins are not build arguments. They are read from the
# container's environment on each request (src/lib/public-config.server.ts), so
# one image serves any host and a deployment names its own hostnames.

ARG NODE_VERSION=24
ARG TYPST_VERSION=0.15.1

# --------------------------------------------------------------------------- #
# The Typst binary, pinned, for the architecture being built for.              #
# --------------------------------------------------------------------------- #
FROM node:${NODE_VERSION}-bookworm-slim AS typst
ARG TYPST_VERSION
ARG TARGETARCH
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl xz-utils \
    && rm -rf /var/lib/apt/lists/*
RUN set -eux; \
    case "${TARGETARCH:-amd64}" in \
      amd64) triple=x86_64-unknown-linux-musl ;; \
      arm64) triple=aarch64-unknown-linux-musl ;; \
      *) echo "no pinned typst build for ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    curl -fsSL -o /tmp/typst.tar.xz \
      "https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-${triple}.tar.xz"; \
    tar -xJf /tmp/typst.tar.xz -C /tmp; \
    install -m 0755 "/tmp/typst-${triple}/typst" /usr/local/bin/typst; \
    rm -rf /tmp/typst.tar.xz "/tmp/typst-${triple}"; \
    typst --version

# --------------------------------------------------------------------------- #
# The pnpm the repository pins in `packageManager`.                             #
# --------------------------------------------------------------------------- #
FROM node:${NODE_VERSION}-bookworm-slim AS pnpm
WORKDIR /repo
COPY package.json ./
RUN npm install --global "$(node -p 'require("./package.json").packageManager')" \
    && pnpm --version

# --------------------------------------------------------------------------- #
# Install, then build @moj/content and the web app. The manifests are copied   #
# before the sources, so the install layer is reused until a package.json or   #
# the lockfile changes.                                                          #
# --------------------------------------------------------------------------- #
FROM pnpm AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY convex/package.json convex/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/content/package.json packages/content/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/protocol/package.json packages/protocol/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY tools/import/package.json tools/import/package.json
COPY tools/anti-slop/package.json tools/anti-slop/package.json
COPY tools/upload-problem/package.json tools/upload-problem/package.json
COPY docs/package.json docs/package.json
# `--ignore-scripts` because the root `prepare` script builds packages/content,
# whose sources are not in this layer. The build steps below run it explicitly.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --store-dir /pnpm/store

COPY . .

# Placeholders so `next build` can collect page data without a live database;
# the runtime stage receives the real values from the environment.
ENV DATABASE_URL=postgres://build:build@127.0.0.1:5432/build \
    AUTH_SECRET=build-time-placeholder-not-used-at-runtime \
    AUTH_ISSUER=http://localhost:3000 \
    AUTH_RP_ID=localhost
RUN pnpm --filter @moj/content build
RUN pnpm --filter @moj/web build

# `@moj/content` is loaded at run time (apps/web/src/app/problem/[code]/pdf), so
# Next never traces it into the standalone output and the image has to carry it
# itself. `pnpm deploy` copies the package with the production dependencies the
# lockfile pins, and the link under node_modules is how the server resolves it.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    set -eux; \
    pnpm --filter @moj/content --prod deploy --ignore-scripts --store-dir /pnpm/store \
      /content-runtime/packages/content; \
    rm /content-runtime/packages/content/pnpm-lock.yaml \
      /content-runtime/packages/content/pnpm-workspace.yaml; \
    mkdir -p /content-runtime/node_modules/@moj; \
    ln -s ../../packages/content /content-runtime/node_modules/@moj/content

# --------------------------------------------------------------------------- #
# Runtime.                                                                      #
# --------------------------------------------------------------------------- #
FROM node:${NODE_VERSION}-bookworm-slim AS runtime

# The statement templates ask for Times/IBM Plex and fall back to Liberation and
# DejaVu, which is what a slim image can supply. Without any font at all Typst
# has nothing to set the page in and the PDF route fails.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
         ca-certificates \
         fonts-liberation \
         fonts-liberation2 \
         fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

COPY --from=typst /usr/local/bin/typst /usr/local/bin/typst

# The statement and booklet templates plus the vendored @preview packages, out
# of the traced server bundle so the path is stable and readable.
COPY --from=build /repo/packages/content/typst /opt/moj/typst

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TYPST_BIN=/usr/local/bin/typst \
    TYPST_TEMPLATE_DIR=/opt/moj/typst \
    TYPST_FONT_PATHS=/usr/share/fonts \
    MOJ_MEDIA_ROOT=/srv/media

WORKDIR /app

# Next's standalone output already carries the server and the traced
# dependencies; the static assets and public/ are copied alongside it, as Next
# documents. `outputFileTracingRoot` is the repository root, so the tree inside
# `standalone` mirrors the workspace.
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public

# The runtime half of `@moj/content`: the package with its own production
# dependencies, and the link the server resolves it through.
COPY --from=build --chown=node:node /content-runtime/packages ./packages
COPY --from=build --chown=node:node /content-runtime/node_modules ./node_modules

RUN mkdir -p /srv/media && chown node:node /srv/media

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/web/server.js"]
