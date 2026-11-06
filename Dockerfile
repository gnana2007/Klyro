FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-fund --no-audit
COPY . .
# The registry artifact is read at runtime by the deploy endpoints, so it has to
# be compiled inside the image. It is gitignored and never shipped from a
# developer machine.
RUN npm run contracts:build && npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production DATABASE_PATH=/app/data/klyro.sqlite NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/contracts/out ./contracts/out
RUN mkdir /app/data && chown -R node:node /app
USER node
VOLUME ["/app/data"]
EXPOSE 3000
CMD ["npm","start"]
