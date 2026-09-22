# ─── Stage 1: Install dependencies ───────────────────────────────────────────
FROM node:20-alpine AS deps

# Install OS packages needed to compile native modules (e.g. bcrypt, sharp)
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copy manifest files first for better layer caching
COPY package.json package-lock.json* ./

RUN npm ci --frozen-lockfile


# ─── Stage 2: Build the Next.js application ───────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Bring in the installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source
COPY . .

# next.config.mjs must have output: 'standalone' for the runner stage.
# We patch it here at build time so the source file doesn't have to carry it.
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN \
  # Patch next.config.mjs to add standalone output if not already present
  node -e "\
    const fs = require('fs');\
    const path = './next.config.mjs';\
    let src = fs.readFileSync(path, 'utf-8');\
    if (!src.includes('standalone')) {\
      src = src.replace(\
        /const nextConfig = \{/,\
        'const nextConfig = { output: \"standalone\",'\
      );\
      fs.writeFileSync(path, src);\
      console.log('[docker-build] Patched next.config.mjs: output standalone');\
    } else {\
      console.log('[docker-build] next.config.mjs already has standalone output');\
    }\
  " && \
  npm run build


# ─── Stage 3: Production runner ───────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Create a non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Port that Next.js will listen on inside the container
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Copy only what the standalone server needs
COPY --from=builder /app/public              ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static     ./.next/static

USER nextjs

EXPOSE 3000

# server.js is emitted by the standalone build; it is the zero-dependency server.
CMD ["node", "server.js"]
