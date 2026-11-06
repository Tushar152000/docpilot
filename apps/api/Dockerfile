# Build context is the repo root (so the API can ship db/migrations).
FROM node:22-alpine AS build
WORKDIR /app
COPY apps/api/package*.json ./
RUN npm install
COPY apps/api/tsconfig.json ./
COPY apps/api/src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY apps/api/package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY db/migrations ./migrations
ENV MIGRATIONS_DIR=/app/migrations
EXPOSE 4000
CMD ["node", "dist/main.js"]
