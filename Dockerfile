FROM node:22.23.2-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY dist-api/web.mjs ./web.mjs
COPY dist ./web
USER node
ENV HOST=0.0.0.0 PORT=8794 WEB_ROOT=/app/web DOWNLOADS_ROOT=/downloads
CMD ["node","web.mjs"]
