# RAGSuite Server — Expo web static export served by nginx.
# Build context: repository root (.)
# Optional Compose additional context `ee` overlays /ee (sibling RAGSUITE_EE,
# installed EE bundle, or CE stubs).

FROM node:20-alpine AS build

WORKDIR /app

RUN apk add --no-cache git python3 make g++

RUN corepack enable && corepack prepare yarn@1.22.22 --activate

COPY frontend/package.json frontend/yarn.lock ./
COPY frontend/scripts ./scripts

# Web export only needs CanvasKit (setup-skia-web postinstall). Skip native Android/iOS
# Skia binaries — they are large and fill Docker build disks on small hosts.
ENV SKIP_SKIA_DOWNLOAD=1

RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
    --mount=type=cache,target=/root/.yarn \
    yarn install --frozen-lockfile

COPY frontend/ .

# Widget bundles must ship with the admin SPA (same host as ragsuite-init.js).
COPY backend/app/static/widget/v1/loader.js backend/app/static/widget/v1/widget.umd.js backend/app/static/widget/v1/widget.css ./public/widget/v1/
COPY backend/app/static/search-widget/v1/loader.js backend/app/static/search-widget/v1/search-widget.umd.js backend/app/static/search-widget/v1/search-widget.css ./public/search-widget/v1/

# EE frontend packages (Compose additional_contexts.ee → /ee)
COPY --from=ee / /ee/
ENV RAGSUITE_EE_ROOT=/ee

ARG FRONTEND_API_URL=http://localhost:9090
ARG WIDGET_ASSET_BASE=
RUN --mount=type=cache,target=/app/.expo \
    --mount=type=cache,target=/tmp/metro-cache \
    WIDGET_BASE="${WIDGET_ASSET_BASE}" \
    && printf '{\n  "API_URL": "%s",\n  "IS_DEBUG": false,\n  "WIDGET_ASSET_BASE": "%s"\n}\n' \
      "$FRONTEND_API_URL" "$WIDGET_BASE" > env.json \
    && npx expo export --platform web --output-dir dist

FROM nginx:1.27-alpine

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# Use 127.0.0.1 — Alpine wget to `localhost` often hits ::1 while nginx listens on IPv4 only.
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/healthz || exit 1
