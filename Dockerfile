FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json tsconfig.web.json vite.config.ts ./
COPY src ./src
COPY web ./web
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim AS runtime
ARG YTDLP_VERSION=2026.08.19
ENV NODE_ENV=production \
    HOME=/tmp
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip ca-certificates \
    && pip3 install --no-cache-dir --break-system-packages "yt-dlp[default,curl-cffi]==${YTDLP_VERSION}" \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-ui ./dist-ui
COPY package.json ./
RUN mkdir -p /data /vault /media && chown -R node:node /data /vault /media
USER node
EXPOSE 8787
CMD ["node", "dist/index.js"]
