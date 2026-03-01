# --- Build stage ---
FROM node:22-alpine AS builder
WORKDIR /app

# Copy everything and install + build
RUN apk add --no-cache python3 make g++ git
COPY . .
RUN npm run install:all --loglevel=verbose && npm run build

# --- Runtime stage ---
FROM node:22-alpine AS runtime
WORKDIR /app

# Copy built artefacts only
COPY --from=builder /app/backend/dist          ./backend/dist
COPY --from=builder /app/frontend-v2/out       ./frontend-v2/out
COPY --from=builder /app/backend/node_modules  ./backend/node_modules
COPY --from=builder /app/backend/package.json  ./backend/package.json

# Runtime assets needed by server.ts at startup
COPY --from=builder /app/tools        ./tools
COPY --from=builder /app/workflows    ./workflows
COPY --from=builder /app/backend/prompts ./backend/prompts

EXPOSE 8080
CMD ["node", "backend/dist/server.js"]
