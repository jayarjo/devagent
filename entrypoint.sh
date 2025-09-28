#!/bin/bash

# Configure git with environment variables or defaults
git config --global user.name "${GIT_USER_NAME:-DevAgent}"
git config --global user.email "${GIT_USER_EMAIL:-devagent@github-actions.local}"

# Fix git safe directory issue in containers
git config --global --add safe.directory "*"

# Also add the specific workspace directory if it exists
if [ -d "/__w" ]; then
    git config --global --add safe.directory "/__w/*"
fi

# Execute the main command
exec "$@"