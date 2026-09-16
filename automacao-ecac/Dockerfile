FROM mcr.microsoft.com/playwright:v1.63.0-noble AS build

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN pnpm build

FROM mcr.microsoft.com/playwright:v1.63.0-noble

ENV NODE_ENV=production
USER root
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    fluxbox novnc websockify x11vnc xauth xvfb \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --chown=pwuser:pwuser --from=build /app/package.json /app/pnpm-lock.yaml ./
COPY --chown=pwuser:pwuser --from=build /app/node_modules ./node_modules
COPY --chown=pwuser:pwuser --from=build /app/dist ./dist
COPY --chown=pwuser:pwuser migrations ./migrations
COPY scripts/start-browser-session.sh /usr/local/bin/start-browser-session
COPY scripts/cdp-proxy.mjs /usr/local/lib/cdp-proxy.mjs
RUN chmod 0755 /usr/local/bin/start-browser-session
RUN mkdir -p /app/data/documents /app/data/ecac-browser-profile \
  && chown -R pwuser:pwuser /app/data
USER pwuser
EXPOSE 3000
CMD ["node", "dist/src/server.js"]
