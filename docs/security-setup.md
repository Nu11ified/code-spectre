# Security and Isolation Setup Guide

This guide covers the security and isolation features implemented in the Cloud IDE Orchestrator to ensure safe multi-tenant container execution.

## Overview

The security system provides multiple layers of protection:

1. **Network Isolation** - Containers run in isolated networks with restricted connectivity
2. **File System Security** - Mount restrictions and read-only file systems
3. **Terminal Access Control** - Command filtering and permission-based access
4. **Resource Monitoring** - Real-time resource usage tracking and limits
5. **Security Logging** - Comprehensive audit trail of security events

## Quick Setup

Run the security setup script to configure the infrastructure:

```bash
./scripts/setup-security.sh
```

This script will:
- Create isolated Docker networks
- Set up security directories and configuration
- Create AppArmor and seccomp profiles
- Configure log rotation
- Test the security setup

## Security Features

### 1. Container Network Restrictions

Containers are deployed in isolated networks with the following restrictions:

- **Isolated Network**: `cloud-ide-isolated` (172.20.0.0/16)
  - No external internet access
  - Inter-container communication disabled
  - Internal DNS resolution only

- **Main Network**: `cloud-ide-network` (172.19.0.0/16)
  - Limited external access through reverse proxy
  - Controlled routing via Traefik

#### Configuration

```typescript
// Network security is configured in the SecurityService
const networkConfig = {
  allowedNetworks: ['127.0.0.1', 'localhost'],
  blockedPorts: [22, 23, 25, 53, 80, 443, 993, 995],
  enableNetworkIsolation: true
};
```

### 2. File System Isolation

File system access is strictly controlled through:

#### Read-Only Root File System
- Container root filesystem is mounted read-only
- Writable areas provided via tmpfs mounts
- Prevents system file modifications

#### Mount Restrictions
```typescript
// Allowed mount paths
const allowedPaths = [
  '/home/coder/workspace',     // User workspace
  '/tmp',                      // Temporary files
  '/home/coder/.local/share/code-server' // VS Code settings
];

// Read-only system paths
const readOnlyPaths = [
  '/etc', '/usr', '/bin', '/sbin', '/lib', '/lib64'
];
```

#### Security Validation
All mount configurations are validated before container creation:

```typescript
const validatedMounts = securityService.validateMountConfig(mounts, securityProfile);
```

### 3. Terminal Access Control

Terminal access is controlled based on user permissions and security policies:

#### Permission-Based Access
```typescript
interface UserPermissions {
  allowTerminalAccess: boolean;
  // ... other permissions
}
```

#### Command Filtering
Commands are filtered through allow/block lists:

```typescript
// Allowed commands (safe operations)
const allowedCommands = [
  'ls', 'cd', 'pwd', 'cat', 'less', 'more',
  'git', 'npm', 'yarn', 'node', 'python',
  'vim', 'nano', 'code'
];

// Blocked commands (dangerous operations)
const blockedCommands = [
  'rm -rf /', 'dd if=', 'mkfs', 'fdisk',
  'docker', 'kubectl', 'systemctl',
  'mount', 'umount', 'sudo', 'su'
];
```

#### Command Validation API
```typescript
// Validate command before execution
const validation = await sessionManager.validateTerminalCommand(sessionId, command);
if (!validation.allowed) {
  console.log(`Command blocked: ${validation.reason}`);
}
```

### 4. Resource Limits and Monitoring

Resource usage is monitored and enforced at multiple levels:

#### Container Resource Limits
```typescript
const resourceLimits = {
  memory: '2g',        // 2GB RAM limit
  cpu: '1.0',          // 1 CPU core limit
  diskQuota: '5g'      // 5GB disk limit
};
```

#### Real-Time Monitoring
```typescript
// Monitor resource usage
const resourceCheck = await securityService.monitorResourceUsage(
  containerId,
  securityProfile,
  currentStats
);

if (!resourceCheck.withinLimits) {
  console.log('Resource violations:', resourceCheck.violations);
}
```

#### Docker Security Options
Containers are created with enhanced security:

```typescript
const securityOptions = {
  securityOpt: [
    'no-new-privileges:true',
    'apparmor:docker-default',
    'seccomp:default'
  ],
  capDrop: ['ALL'],           // Drop all capabilities
  readOnlyRootfs: true,       // Read-only root filesystem
  tmpfs: {
    '/tmp': 'rw,noexec,nosuid,size=100m'
  }
};
```

### 5. Security Logging and Monitoring

All security events are logged for audit and monitoring:

#### Violation Types
```typescript
enum SecurityViolationType {
  UNAUTHORIZED_NETWORK_ACCESS = 'UNAUTHORIZED_NETWORK_ACCESS',
  UNAUTHORIZED_FILE_ACCESS = 'UNAUTHORIZED_FILE_ACCESS',
  UNAUTHORIZED_COMMAND = 'UNAUTHORIZED_COMMAND',
  RESOURCE_LIMIT_EXCEEDED = 'RESOURCE_LIMIT_EXCEEDED',
  TERMINAL_ACCESS_DENIED = 'TERMINAL_ACCESS_DENIED',
  CONTAINER_ESCAPE_ATTEMPT = 'CONTAINER_ESCAPE_ATTEMPT'
}
```

#### Security Metrics
The system tracks comprehensive security metrics:

```typescript
interface SecurityMetrics {
  totalViolations: number;
  violationsByType: Record<SecurityViolationType, number>;
  violationsByUser: Record<number, number>;
  blockedActions: number;
  activeThreats: number;
  lastViolation?: Date;
}
```

#### Admin Dashboard
Access security monitoring through the admin interface:
- Navigate to `/admin/security`
- View real-time security metrics
- Monitor container compliance
- Review user violations
- Manage security policies

## API Endpoints

### Security Monitoring
```typescript
// Get security metrics
const metrics = await api.admin.getSecurityMetrics.query();

// Monitor session security
const sessionSecurity = await api.admin.monitorSessionSecurity.query();

// Get user violations
const violations = await api.admin.getUserSecurityViolations.query({ userId });

// Validate terminal command
const validation = await api.session.validateCommand.query({ sessionId, command });
```

### Container Security
```typescript
// Get container security status
const security = await api.admin.getContainerSecurity.query({ containerId });

// Clear old violations
await api.admin.clearOldSecurityViolations.mutate({ olderThanDays: 30 });
```

## Configuration Files

### Security Configuration
Location: `/etc/cloud-ide-orchestrator/security/config.json`

```json
{
  "networkSecurity": {
    "allowedNetworks": ["127.0.0.1", "localhost"],
    "blockedPorts": [22, 23, 25, 53, 80, 443, 993, 995],
    "enableNetworkIsolation": true
  },
  "fileSystemSecurity": {
    "readOnlyMounts": ["/etc", "/usr", "/bin", "/sbin", "/lib", "/lib64"],
    "restrictedPaths": ["/proc", "/sys", "/dev", "/run", "/var/run"],
    "maxFileSize": 104857600
  },
  "resourceLimits": {
    "maxMemoryPerContainer": "2g",
    "maxCpuPerContainer": "1.0",
    "maxDiskUsage": "5g"
  },
  "terminalSecurity": {
    "allowedCommands": ["ls", "cd", "pwd", "git", "npm", "node"],
    "blockedCommands": ["rm -rf /", "sudo", "docker"],
    "shellTimeout": 3600
  },
  "monitoring": {
    "logSecurityEvents": true,
    "alertOnViolations": true,
    "maxViolationsPerUser": 10
  }
}
```

### AppArmor Profile
Location: `/etc/apparmor.d/cloud-ide-container`

Provides mandatory access control for containers with:
- Capability restrictions
- File system access controls
- Network access controls
- Process isolation

### Seccomp Profile
Location: `/etc/cloud-ide-orchestrator/security/seccomp-profile.json`

Filters system calls to prevent:
- Kernel exploits
- Container escape attempts
- Unauthorized system access

## Log Files

Security events are logged to:
- `/var/log/cloud-ide-orchestrator/security/violations.log`
- `/var/log/cloud-ide-orchestrator/security/monitoring.log`
- `/var/log/cloud-ide-orchestrator/security/audit.log`

Log rotation is configured via `/etc/logrotate.d/cloud-ide-security`.

## Testing Security

### Manual Testing
```bash
# Test network isolation
docker exec <container-id> ping 8.8.8.8  # Should fail

# Test file system restrictions
docker exec <container-id> touch /etc/test  # Should fail

# Test command filtering
# Use the API to validate commands before execution
```

### Automated Testing
Run the security test suite:

```bash
npm test -- src/server/services/__tests__/security.test.ts
```

## Troubleshooting

### Common Issues

1. **Container fails to start**
   - Check AppArmor profile is loaded: `sudo aa-status`
   - Verify seccomp profile syntax: `docker run --security-opt seccomp=profile.json`

2. **Network isolation not working**
   - Verify isolated network exists: `docker network ls`
   - Check network configuration: `docker network inspect cloud-ide-isolated`

3. **File system access denied**
   - Review mount configurations in security profile
   - Check file permissions and ownership

4. **Terminal commands blocked**
   - Review allowed/blocked command lists
   - Check user permissions for terminal access

### Debug Mode
Enable debug logging by setting:

```bash
export DEBUG=cloud-ide:security
export LOG_LEVEL=debug
```

## Security Best Practices

1. **Regular Updates**
   - Keep security profiles updated
   - Review and update command allow/block lists
   - Monitor security metrics regularly

2. **Monitoring**
   - Set up alerts for critical violations
   - Review security logs daily
   - Monitor resource usage patterns

3. **User Management**
   - Apply principle of least privilege
   - Regular permission audits
   - Monitor user violation patterns

4. **Infrastructure**
   - Keep Docker and host OS updated
   - Regular security scans
   - Network segmentation

## Compliance

The security implementation helps meet various compliance requirements:

- **SOC 2**: Comprehensive logging and monitoring
- **ISO 27001**: Access controls and security policies
- **GDPR**: Data protection and audit trails
- **HIPAA**: Access controls and encryption (when configured)

## Support

For security-related issues:
1. Check the troubleshooting section
2. Review security logs
3. Test with minimal configuration
4. Contact security team for critical issues

Remember: Security is a shared responsibility. Regular monitoring and updates are essential for maintaining a secure environment.