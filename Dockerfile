# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Copy source first (needed for prepare script)
COPY src ./src

# Install dependencies (will run prepare script and build)
RUN npm ci

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy built files from builder
COPY --from=builder /app/build ./build

# Run as non-root user
USER node

# Set up entrypoint
ENTRYPOINT ["node", "build/index.js"]
