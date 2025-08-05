#!/bin/bash

# Setup script for Traefik reverse proxy configuration
# This script initializes the Traefik environment and tests the configuration

set -e

echo "🚀 Setting up Traefik reverse proxy for Cloud IDE Orchestrator..."

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p traefik
mkdir -p letsencrypt
mkdir -p logs/traefik

# Set proper permissions for Let's Encrypt storage
chmod 600 letsencrypt 2>/dev/null || true

# Create Docker network if it doesn't exist
NETWORK_NAME=${DOCKER_NETWORK_NAME:-cloud-ide-network}
echo "🌐 Ensuring Docker network '$NETWORK_NAME' exists..."

if ! docker network ls | grep -q "$NETWORK_NAME"; then
    echo "Creating Docker network: $NETWORK_NAME"
    docker network create "$NETWORK_NAME"
else
    echo "Docker network '$NETWORK_NAME' already exists"
fi

# Load environment variables
if [ -f .env ]; then
    echo "📋 Loading environment variables from .env..."
    export $(grep -v '^#' .env | xargs)
else
    echo "⚠️  No .env file found. Using default values."
fi

# Set default values if not provided
export DOMAIN=${DOMAIN:-localhost}
export ACME_EMAIL=${ACME_EMAIL:-admin@example.com}
export TRAEFIK_LOG_LEVEL=${TRAEFIK_LOG_LEVEL:-INFO}
export TRAEFIK_INSECURE=${TRAEFIK_INSECURE:-true}
export ENABLE_TLS=${ENABLE_TLS:-false}

echo "🔧 Configuration:"
echo "  Domain: $DOMAIN"
echo "  TLS Enabled: $ENABLE_TLS"
echo "  ACME Email: $ACME_EMAIL"
echo "  Log Level: $TRAEFIK_LOG_LEVEL"
echo "  Network: $NETWORK_NAME"

# Start Traefik
echo "🐳 Starting Traefik..."
docker-compose -f docker-compose.traefik.yml up -d

# Wait for Traefik to be ready
echo "⏳ Waiting for Traefik to be ready..."
timeout=30
counter=0

while [ $counter -lt $timeout ]; do
    if docker ps | grep -q "cloud-ide-traefik"; then
        if [ "$TRAEFIK_INSECURE" = "true" ]; then
            # Test dashboard access
            if curl -s -f http://localhost:8080/api/rawdata >/dev/null 2>&1; then
                echo "✅ Traefik is ready!"
                break
            fi
        else
            # Just check if container is running
            echo "✅ Traefik container is running!"
            break
        fi
    fi
    
    counter=$((counter + 1))
    sleep 1
done

if [ $counter -eq $timeout ]; then
    echo "❌ Traefik failed to start within $timeout seconds"
    echo "📋 Container logs:"
    docker logs cloud-ide-traefik --tail 20
    exit 1
fi

# Display status
echo ""
echo "🎉 Traefik setup completed successfully!"
echo ""
echo "📊 Status:"
docker ps --filter "name=cloud-ide-traefik" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "🔗 Access URLs:"
if [ "$TRAEFIK_INSECURE" = "true" ]; then
    echo "  Dashboard: http://localhost:8080"
fi

if [ "$DOMAIN" != "localhost" ]; then
    protocol="http"
    if [ "$ENABLE_TLS" = "true" ]; then
        protocol="https"
    fi
    echo "  Dashboard: $protocol://traefik.$DOMAIN"
fi

echo ""
echo "📝 Next steps:"
echo "  1. Update your DNS to point *.${DOMAIN} to this server"
echo "  2. If using TLS, ensure port 443 is accessible"
echo "  3. Start your IDE containers - they will be automatically routed"

echo ""
echo "🧪 To test the setup:"
echo "  curl -I http://localhost:8080/api/rawdata"

# Test basic functionality
echo ""
echo "🧪 Running basic connectivity test..."
if curl -s -f http://localhost:8080/api/rawdata >/dev/null 2>&1; then
    echo "✅ Traefik API is accessible"
else
    echo "⚠️  Traefik API test failed - this might be expected if dashboard is disabled"
fi

echo ""
echo "✨ Traefik setup complete!"