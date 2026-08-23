# ---- deps: install node_modules in an isolated layer (cached unless lockfile changes) ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# Use npm ci when a lockfile exists (reproducible), else fall back to install.
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# ---- migrator: applies migrations + seed once, then exits (has dev deps) ----
FROM node:20-alpine AS migrator
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json drizzle.config.ts ./
COPY drizzle ./drizzle
COPY src ./src
CMD ["sh", "-c", "npm run db:migrate && npm run db:seed"]

# ---- builder: compile the Next.js app ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- runner: minimal production image ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# 'standalone' output copies only the server + the exact deps it traced.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
