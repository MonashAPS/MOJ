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
# Workspace dependencies. Only the manifests are copied, so this layer is       #
# reused until a package.json or the lockfile changes.                          #
# --------------------------------------------------------------------------- #
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
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
# whose sources are not in this layer. The build stage runs it explicitly.
RUN npm ci --ignore-scripts

# --------------------------------------------------------------------------- #
# Build @moj/content and then the web app.                                      #
# --------------------------------------------------------------------------- #
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1
# The whole installed tree, because npm nests a `node_modules` under a
# workspace whenever a version cannot be hoisted; then the sources on top.
COPY --from=deps /repo ./
COPY . .

# Placeholders so `next build` can collect page data without a live database;
# the runtime stage receives the real values from the environment.
ENV DATABASE_URL=postgres://build:build@127.0.0.1:5432/build \
    AUTH_SECRET=build-time-placeholder-not-used-at-runtime \
    AUTH_ISSUER=http://localhost:3000 \
    AUTH_RP_ID=localhost
RUN npm run build --workspace packages/content
RUN npm run build --workspace apps/web

# `@moj/content` is loaded at run time (apps/web/src/app/problem/[code]/pdf), so
# Next never traces it into the standalone output and the image has to carry it
# itself. `npm ls` names the exact production closure the lockfile installed, so
# the versions match what was built against.
RUN set -eux; \
    cd /repo; \
    npm ls --omit=dev --all --parseable --workspace packages/content > /tmp/content-tree.txt; \
    sed -n 's|^/repo/\(node_modules/.*\)$|\1|p' /tmp/content-tree.txt | sort -u > /tmp/content-files.txt; \
    test -s /tmp/content-files.txt; \
    printf '%s\n' \
      packages/content/package.json \
      packages/content/dist \
      packages/content/styles \
      packages/content/typst >> /tmp/content-files.txt; \
    mkdir -p /content-runtime; \
    tar -cf - -T /tmp/content-files.txt | tar -xf - -C /content-runtime

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

# The runtime half of `@moj/content`: the package itself plus the production
# dependency closure Next left untraced.
COPY --from=build --chown=node:node /content-runtime/packages ./packages
COPY --from=build --chown=node:node /content-runtime/node_modules ./node_modules

RUN mkdir -p /srv/media && chown node:node /srv/media

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/web/server.js"]
