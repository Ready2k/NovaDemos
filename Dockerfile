# --- Build stage ---
FROM node:22-alpine AS builder
WORKDIR /app

# Copy everything and install
RUN apk add --no-cache python3 make g++ git
COPY . .
# Build
RUN npm run install:all && npm run build
# Cleanup to save space (though this is the builder stage)
RUN apk del python3 make g++ git

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
COPY --from=builder /app/backend/prompts ./backend/prompts

EXPOSE 8080
CMD ["node", "backend/dist/server.js"]
