# --- Lightweight Runtime ONLY Stage ---
# This Dockerfile expects that the build artifacts (dist and out) were generated locally
# to avoid overloading the remote build machine (i5 Mac) with compilation.
FROM node:22-alpine AS runtime
WORKDIR /app

# 1. Provide minimal essentials for production install
COPY backend/package.json      ./backend/package.json
COPY backend/package-lock.json ./backend/package-lock.json

# 2. Run production install (lighter and faster than a full monorepo dev install)
RUN cd backend && npm install --omit=dev

# 3. Copy built artifacts from local machine context
COPY backend/dist          ./backend/dist
COPY frontend-v2/out       ./frontend-v2/out
COPY tools                 ./tools
COPY backend/prompts       ./backend/prompts
COPY backend/data          ./backend/data


# Workflow JSON files live in backend/src/ and are loaded at runtime via fs.readFileSync.
# server.ts falls back to __dirname (backend/dist/) when ../src/ doesn't exist in the image.
# We ensure them here since they are part of the 'dist' logic for runtime.
COPY backend/src/workflow-*.json ./backend/dist/

EXPOSE 8080
CMD ["node", "backend/dist/server.js"]
