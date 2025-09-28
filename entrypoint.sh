#!/bin/bash

# Configure git with environment variables or defaults
git config --global user.name "${GIT_USER_NAME:-DevAgent}"
git config --global user.email "${GIT_USER_EMAIL:-devagent@github-actions.local}"

# Execute the main command
exec "$@"