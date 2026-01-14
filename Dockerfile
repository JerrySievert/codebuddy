FROM node:20-alpine

WORKDIR /app

# Install git, ssh, and build tools
RUN apk add --no-cache git openssh-client python3 make g++

# Copy package files (exclude yarn.lock to regenerate with HTTPS URLs)
COPY package.json ./

# Install dependencies (using HTTPS instead of SSH for GitHub)
RUN git config --global url."https://github.com/".insteadOf "git+ssh://git@github.com/" && \
  git config --global url."https://github.com/".insteadOf "ssh://git@github.com/" && \
  git config --global url."https://github.com/".insteadOf "git@github.com:" && \
  yarn install

# Copy application code
COPY . .

# Create entrypoint script
RUN echo '#!/bin/sh' > /entrypoint.sh && \
  echo 'set -e' >> /entrypoint.sh && \
  echo '' >> /entrypoint.sh && \
  echo '# Create config.json from environment variables' >> /entrypoint.sh && \
  echo 'cat > /app/config.json << EOF' >> /entrypoint.sh && \
  echo '{' >> /entrypoint.sh && \
  echo '  "database": {' >> /entrypoint.sh && \
  echo '    "username": "${DB_USER:-postgres}",' >> /entrypoint.sh && \
  echo '    "password": "${DB_PASSWORD:-postgres}",' >> /entrypoint.sh && \
  echo '    "hostname": "${DB_HOST:-postgres}",' >> /entrypoint.sh && \
  echo '    "database": "${DB_NAME:-codebuddy}"' >> /entrypoint.sh && \
  echo '  }' >> /entrypoint.sh && \
  echo '}' >> /entrypoint.sh && \
  echo 'EOF' >> /entrypoint.sh && \
  echo '' >> /entrypoint.sh && \
  echo '# Wait for PostgreSQL to be ready' >> /entrypoint.sh && \
  echo 'echo "Waiting for PostgreSQL..."' >> /entrypoint.sh && \
  echo 'while ! nc -z ${DB_HOST:-postgres} 5432; do' >> /entrypoint.sh && \
  echo '  sleep 1' >> /entrypoint.sh && \
  echo 'done' >> /entrypoint.sh && \
  echo 'echo "PostgreSQL is ready"' >> /entrypoint.sh && \
  echo '' >> /entrypoint.sh && \
  echo '# Run migrations' >> /entrypoint.sh && \
  echo 'echo "Running database migrations..."' >> /entrypoint.sh && \
  echo 'yarn migrate' >> /entrypoint.sh && \
  echo '' >> /entrypoint.sh && \
  echo '# Start the server' >> /entrypoint.sh && \
  echo 'echo "Starting CodeBuddy server..."' >> /entrypoint.sh && \
  echo 'exec node server.mjs' >> /entrypoint.sh && \
  chmod +x /entrypoint.sh

# Install netcat for health check
RUN apk add --no-cache netcat-openbsd

EXPOSE 3000

ENTRYPOINT ["/entrypoint.sh"]
