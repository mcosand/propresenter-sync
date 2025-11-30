# Stage 1: Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy lockfiles first for caching
COPY package*.json ./

# Install all dependencies (dev + prod)
RUN npm ci

# Copy the rest of the app
COPY . .

# Build Next.js
RUN npm run build && npm prune --omit=dev

# Stage 2: Production runtime
FROM node:20-alpine AS runner

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy built app from builder
COPY --from=builder /app/.next/standalone .
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

RUN chown -R appuser:appgroup /app

USER appuser

# Environment
ENV NODE_ENV=production
EXPOSE 3030

# Run the app
CMD ["node", "server.js"]
