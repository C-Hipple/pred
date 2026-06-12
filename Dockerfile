FROM node:22-alpine AS build
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package*.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
RUN apk add --no-cache python3 make g++
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev -w server && apk del python3 make g++
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist
ENV DATABASE_PATH=/data/pred.db
VOLUME /data
EXPOSE 3000
CMD ["node", "server/dist/index.js"]
