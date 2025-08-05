# Traefik Reverse Proxy Setup

This document explains how to set up and configure Traefik as a reverse proxy for the Cloud IDE Orchestrator.

## Overview

Traefik acts as a reverse proxy that automatically routes traffic to IDE containers based on subdomain patterns. Each IDE session gets a unique subdomain like `ide-u1-r2-main.yourdomain.com` that routes to the appropriate container.

## Architecture

```
Internet → Traefik (Port 80/443) → IDE Containers (Port 8080)
```

- **Traefik**: Handles SSL termination, routing, and load balancing
- **Dynamic Routing**: Automatically discovers containers via Docker labels
- **SSL/TLS**: Automatic certificate management with Let's Encrypt
- **Security**: Rate limiting, security headers, and access control

## Quick Setup

### 1. Environment Configuration

Copy the environment variables from `.env.example` to your `.env` file:

```bash
# Traefik Configuration
DOMAIN="yourdomain.com"
ENABLE_TLS="true"
ACME_EMAIL="admin@yourdomain.com"
TRAEFIK_DASHBOARD="true"
TRAEFIK_LOG_LEVEL="INFO"
```

### 2. Run Setup Script

```bash
./scripts/setup-traefik.sh
```

This script will:
- Create necessary directories
- Set up Docker network
- Start Traefik container
- Verify the setup

### 3. DNS Configuration

Point your domain's wildcard DNS to your server:

```
*.yourdomain.com → YOUR_SERVER_IP
traefik.yourdomain.com → YOUR_SERVER_IP
```

## Configuration Files

### Docker Compose

The main Traefik configuration is in `docker-compose.traefik.yml`:

- **Ports**: 80 (HTTP), 443 (HTTPS), 8080 (Dashboard)
- **Volumes**: Docker socket, configuration, certificates
- **Networks**: Connects to `cloud-ide-network`

### Dynamic Configuration

The `traefik/dynamic.yml` file contains:

- **Middlewares**: Security headers, rate limiting, CORS
- **TLS Options**: Cipher suites and security settings
- **Services**: Health checks and load balancing

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DOMAIN` | `localhost` | Base domain for IDE sessions |
| `ENABLE_TLS` | `false` | Enable HTTPS with Let's Encrypt |
| `ACME_EMAIL` | `admin@example.com` | Email for Let's Encrypt |
| `TRAEFIK_DASHBOARD` | `true` | Enable Traefik dashboard |
| `TRAEFIK_LOG_LEVEL` | `INFO` | Log level (DEBUG, INFO, WARN, ERROR) |
| `DOCKER_NETWORK_NAME` | `cloud-ide-network` | Docker network name |

## SSL/TLS Configuration

### Development (HTTP Only)

```bash
ENABLE_TLS="false"
DOMAIN="localhost"
```

Access via: `http://ide-u1-r1-main.localhost`

### Production (HTTPS with Let's Encrypt)

```bash
ENABLE_TLS="true"
DOMAIN="yourdomain.com"
ACME_EMAIL="admin@yourdomain.com"
ACME_CA_SERVER="https://acme-v02.api.letsencrypt.org/directory"
```

Access via: `https://ide-u1-r1-main.yourdomain.com`

### Staging (Let's Encrypt Staging)

For testing SSL setup without rate limits:

```bash
ACME_CA_SERVER="https://acme-staging-v02.api.letsencrypt.org/directory"
```

## Routing Patterns

IDE sessions are automatically assigned subdomains based on:

- **User ID**: `u{userId}`
- **Repository ID**: `r{repositoryId}`
- **Branch Name**: Sanitized branch name

Examples:
- User 1, Repo 2, Branch "main" → `ide-u1-r2-main.yourdomain.com`
- User 3, Repo 5, Branch "feature/auth" → `ide-u3-r5-feature-auth.yourdomain.com`

## Security Features

### Rate Limiting

- **IDE Sessions**: 50 requests/minute, burst of 100
- **Admin Panel**: 10 requests/minute, burst of 20

### Security Headers

- Content Security Policy
- HSTS (HTTPS only)
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff

### Network Isolation

- Containers run in isolated Docker network
- No direct access to host system
- Traefik-only communication

## Monitoring and Debugging

### Dashboard Access

When enabled, access the Traefik dashboard at:
- Development: `http://localhost:8080`
- Production: `https://traefik.yourdomain.com`

### Logs

View Traefik logs:

```bash
docker logs cloud-ide-traefik -f
```

### Health Checks

Check Traefik API:

```bash
curl -I http://localhost:8080/api/rawdata
```

### Container Routes

List active routes:

```bash
curl -s http://localhost:8080/api/http/routers | jq
```

## Troubleshooting

### Common Issues

1. **DNS Not Resolving**
   - Verify wildcard DNS configuration
   - Check domain propagation: `nslookup ide-test.yourdomain.com`

2. **SSL Certificate Issues**
   - Check Let's Encrypt rate limits
   - Verify ACME email and domain ownership
   - Use staging server for testing

3. **Container Not Accessible**
   - Verify container is in correct network
   - Check Traefik labels on container
   - Review Traefik logs for routing errors

4. **Dashboard Not Accessible**
   - Ensure `TRAEFIK_DASHBOARD=true`
   - Check basic auth configuration
   - Verify port 8080 is accessible

### Debug Commands

```bash
# Check Traefik container status
docker ps --filter "name=cloud-ide-traefik"

# Inspect container labels
docker inspect <container-id> | jq '.Config.Labels'

# Test network connectivity
docker exec cloud-ide-traefik ping <container-name>

# Check certificate status
docker exec cloud-ide-traefik cat /letsencrypt/acme.json | jq
```

## Advanced Configuration

### Custom Middlewares

Add custom middlewares in `traefik/dynamic.yml`:

```yaml
http:
  middlewares:
    custom-auth:
      basicAuth:
        users:
          - "admin:$2y$10$..."
    
    ip-whitelist:
      ipWhiteList:
        sourceRange:
          - "192.168.1.0/24"
          - "10.0.0.0/8"
```

### Load Balancing

For multiple container instances:

```yaml
http:
  services:
    ide-service:
      loadBalancer:
        servers:
          - url: "http://container1:8080"
          - url: "http://container2:8080"
        healthCheck:
          path: "/health"
          interval: "30s"
```

### Custom TLS Configuration

```yaml
tls:
  certificates:
    - certFile: "/certs/yourdomain.crt"
      keyFile: "/certs/yourdomain.key"
  options:
    custom:
      minVersion: "VersionTLS13"
      cipherSuites:
        - "TLS_AES_256_GCM_SHA384"
```

## Performance Tuning

### Resource Limits

In `docker-compose.traefik.yml`:

```yaml
deploy:
  resources:
    limits:
      memory: 512M
      cpus: '0.5'
    reservations:
      memory: 256M
      cpus: '0.25'
```

### Connection Limits

```yaml
entryPoints:
  websecure:
    address: ":443"
    transport:
      respondingTimeouts:
        readTimeout: "60s"
        writeTimeout: "60s"
        idleTimeout: "180s"
```

## Backup and Recovery

### Certificate Backup

```bash
# Backup Let's Encrypt certificates
cp -r letsencrypt/ backup/letsencrypt-$(date +%Y%m%d)/
```

### Configuration Backup

```bash
# Backup Traefik configuration
tar -czf traefik-config-$(date +%Y%m%d).tar.gz traefik/ docker-compose.traefik.yml
```

### Recovery

```bash
# Restore certificates
cp -r backup/letsencrypt-20240101/ letsencrypt/

# Restart Traefik
docker-compose -f docker-compose.traefik.yml down
docker-compose -f docker-compose.traefik.yml up -d
```

## Integration with CI/CD

### GitHub Actions Example

```yaml
- name: Deploy Traefik
  run: |
    ./scripts/setup-traefik.sh
    
- name: Wait for Traefik
  run: |
    timeout 60 bash -c 'until curl -f http://localhost:8080/api/rawdata; do sleep 2; done'
    
- name: Test routing
  run: |
    # Deploy test container and verify routing
    npm run test:integration
```

## Security Considerations

1. **Keep Traefik Updated**: Regularly update to latest version
2. **Monitor Logs**: Set up log aggregation and alerting
3. **Rate Limiting**: Adjust limits based on usage patterns
4. **Access Control**: Use IP whitelisting for admin interfaces
5. **Certificate Management**: Monitor certificate expiration
6. **Network Segmentation**: Isolate Traefik network from other services

## Support

For issues and questions:

1. Check Traefik logs: `docker logs cloud-ide-traefik`
2. Review configuration files for syntax errors
3. Test with minimal configuration first
4. Consult [Traefik documentation](https://doc.traefik.io/traefik/)
5. Check Docker network connectivity