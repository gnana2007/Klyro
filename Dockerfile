FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-fund --no-audit
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production DATABASE_PATH=/app/data/hscan.sqlite NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts
RUN mkdir /app/data && chown -R node:node /app
USER node
VOLUME ["/app/data"]
EXPOSE 3000
CMD ["npm","start"]
