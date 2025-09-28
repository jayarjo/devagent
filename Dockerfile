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
COPY package.json package-lock.json* ./

# Install Node dependencies
RUN npm ci --only=production

# Copy application code
COPY orchestrator.js ./

# Create logs directory
RUN mkdir -p /tmp/agent-logs

# Copy entrypoint script
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh


# Default command
ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "orchestrator.js"]