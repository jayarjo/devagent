FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    python3 \
    python3-pip \
    ripgrep \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install gh -y

# Install Claude CLI
RUN npm install -g @anthropic-ai/claude-code

# Set up working directory
WORKDIR /app

# Copy package files first for better caching
COPY package.json tsconfig.json ./

# Install all dependencies (including dev for build)
RUN npm install

# Copy source code
COPY src/ ./src/

# Build TypeScript to JavaScript
RUN npm run build

# Remove dev dependencies after build
RUN npm prune --production

# Copy built application
COPY dist/ ./dist/

# Create logs directory
RUN mkdir -p /tmp/agent-logs

# Default command
CMD ["node", "dist/index.js"]