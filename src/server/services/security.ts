import type { LogEntry, UserPermissions } from '@/types/domain';

/**
 * Security configuration for container isolation
 */
export interface SecurityConfig {
  // Network security
  allowedNetworks: string[];
  blockedPorts: number[];
  enableNetworkIsolation: boolean;
  
  // File system security
  readOnlyMounts: string[];
  restrictedPaths: string[];
  maxFileSize: number; // in bytes
  
  // Resource limits
  maxMemoryPerContainer: string;
  maxCpuPerContainer: string;
  maxDiskUsage: string;
  
  // Terminal security
  allowedCommands: string[];
  blockedCommands: string[];
  shellTimeout: number; // in seconds
  
  // Monitoring
  logSecurityEvents: boolean;
  alertOnViolations: boolean;
  maxViolationsPerUser: number;
}

/**
 * Security violation types
 */
export enum SecurityViolationType {
  UNAUTHORIZED_NETWORK_ACCESS = 'UNAUTHORIZED_NETWORK_ACCESS',
  UNAUTHORIZED_FILE_ACCESS = 'UNAUTHORIZED_FILE_ACCESS',
  UNAUTHORIZED_COMMAND = 'UNAUTHORIZED_COMMAND',
  RESOURCE_LIMIT_EXCEEDED = 'RESOURCE_LIMIT_EXCEEDED',
  TERMINAL_ACCESS_DENIED = 'TERMINAL_ACCESS_DENIED',
  CONTAINER_ESCAPE_ATTEMPT = 'CONTAINER_ESCAPE_ATTEMPT',
}

/**
 * Security violation event
 */
export interface SecurityViolation {
  id: string;
  type: SecurityViolationType;
  userId: number;
  sessionId: string;
  timestamp: Date;
  details: {
    action: string;
    resource: string;
    blocked: boolean;
    severity: 'low' | 'medium' | 'high' | 'critical';
  };
  metadata?: Record<string, unknown>;
}

/**
 * Container security profile
 */
export interface ContainerSecurityProfile {
  userId: number;
  permissions: UserPermissions;
  networkRestrictions: {
    allowedHosts: string[];
    blockedPorts: number[];
    enableInternet: boolean;
  };
  fileSystemRestrictions: {
    allowedPaths: string[];
    readOnlyPaths: string[];
    maxFileSize: number;
  };
  resourceLimits: {
    memory: string;
    cpu: string;
    diskQuota: string;
  };
  terminalRestrictions: {
    enabled: boolean;
    allowedCommands: string[];
    blockedCommands: string[];
    timeout: number;
  };
}

/**
 * Security monitoring metrics
 */
export interface SecurityMetrics {
  totalViolations: number;
  violationsByType: Record<SecurityViolationType, number>;
  violationsByUser: Record<number, number>;
  blockedActions: number;
  activeThreats: number;
  lastViolation?: Date;
}

/**
 * Security service for container isolation and monitoring
 */
export class SecurityService {
  private config: SecurityConfig;
  private violations: Map<string, SecurityViolation> = new Map();
  private userViolationCounts: Map<number, number> = new Map();
  private logger: (level: 'info' | 'warn' | 'error', message: string, metadata?: any) => void;

  constructor(
    config: SecurityConfig,
    logger?: (level: 'info' | 'warn' | 'error', message: string, metadata?: any) => void
  ) {
    this.config = config;
    this.logger = logger || ((level, message, metadata) => {
      console[level](`[SecurityService] ${message}`, metadata || '');
    });
  }

  /**
   * Generate security profile for a container
   */
  generateSecurityProfile(
    userId: number,
    permissions: UserPermissions,
    repositoryId: number
  ): ContainerSecurityProfile {
    return {
      userId,
      permissions,
      networkRestrictions: {
        allowedHosts: this.config.allowedNetworks,
        blockedPorts: this.config.blockedPorts,
        enableInternet: false, // Disable internet access by default
      },
      fileSystemRestrictions: {
        allowedPaths: [
          '/home/coder/workspace', // Only allow access to workspace
          '/tmp', // Temporary files
          '/home/coder/.local/share/code-server', // VS Code settings
        ],
        readOnlyPaths: [
          '/etc', // System configuration
          '/usr', // System binaries
          '/bin', // System binaries
          '/sbin', // System binaries
          '/lib', // System libraries
          '/lib64', // System libraries
          ...this.config.readOnlyMounts,
        ],
        maxFileSize: this.config.maxFileSize,
      },
      resourceLimits: {
        memory: this.config.maxMemoryPerContainer,
        cpu: this.config.maxCpuPerContainer,
        diskQuota: this.config.maxDiskUsage,
      },
      terminalRestrictions: {
        enabled: permissions.allowTerminalAccess,
        allowedCommands: permissions.allowTerminalAccess ? this.config.allowedCommands : [],
        blockedCommands: [
          'docker', 'kubectl', 'systemctl', 'service',
          'mount', 'umount', 'fdisk', 'mkfs',
          'iptables', 'netstat', 'ss', 'lsof',
          'ps aux', 'kill -9', 'killall',
          'chmod 777', 'chown root',
          'sudo su', 'su -',
          ...this.config.blockedCommands,
        ],
        timeout: this.config.shellTimeout,
      },
    };
  }

  /**
   * Generate Docker security options for container creation
   */
  generateDockerSecurityOptions(profile: ContainerSecurityProfile): {
    securityOpt: string[];
    capAdd: string[];
    capDrop: string[];
    readOnlyRootfs: boolean;
    tmpfs: Record<string, string>;
    ulimits: Array<{ name: string; soft: number; hard: number }>;
  } {
    return {
      // Security options
      securityOpt: [
        'no-new-privileges:true', // Prevent privilege escalation
        'apparmor:docker-default', // Use AppArmor profile
        'seccomp:default', // Use default seccomp profile
      ],
      
      // Capabilities - drop all and add only necessary ones
      capAdd: [],
      capDrop: ['ALL'],
      
      // Read-only root filesystem
      readOnlyRootfs: true,
      
      // Temporary filesystems for writable areas
      tmpfs: {
        '/tmp': 'rw,noexec,nosuid,size=100m',
        '/var/tmp': 'rw,noexec,nosuid,size=50m',
        '/home/coder/.cache': 'rw,noexec,nosuid,size=200m',
      },
      
      // Resource limits
      ulimits: [
        { name: 'nofile', soft: 1024, hard: 2048 }, // File descriptors
        { name: 'nproc', soft: 512, hard: 1024 }, // Process count
        { name: 'fsize', soft: profile.fileSystemRestrictions.maxFileSize, hard: profile.fileSystemRestrictions.maxFileSize }, // File size
      ],
    };
  }

  /**
   * Generate network configuration for container isolation
   */
  generateNetworkConfig(profile: ContainerSecurityProfile): {
    networkMode: string;
    dns: string[];
    extraHosts: string[];
    publishAllPorts: boolean;
    networkingConfig: any;
  } {
    return {
      networkMode: 'cloud-ide-isolated', // Custom isolated network
      dns: ['8.8.8.8', '8.8.4.4'], // Controlled DNS servers
      extraHosts: [], // No extra host mappings
      publishAllPorts: false, // Don't publish ports automatically
      networkingConfig: {
        // Additional network security configurations
        EnableIPv6: false, // Disable IPv6 for simplicity
        Internal: true, // Internal network only
        Attachable: false, // Prevent external attachment
        Ingress: false, // Disable ingress networking
        ConfigOnly: false,
        ConfigFrom: {
          Network: 'cloud-ide-isolated'
        },
        Options: {
          'com.docker.network.bridge.enable_icc': 'false', // Disable inter-container communication
          'com.docker.network.bridge.enable_ip_masquerade': 'false', // Disable IP masquerading
          'com.docker.network.driver.mtu': '1500',
          'com.docker.network.bridge.host_binding_ipv4': '127.0.0.1', // Bind to localhost only
        }
      }
    };
  }

  /**
   * Validate and sanitize mount configurations
   */
  validateMountConfig(
    mounts: Array<{ source: string; target: string; type: string; readOnly?: boolean }>,
    profile: ContainerSecurityProfile
  ): Array<{ source: string; target: string; type: string; readOnly: boolean }> {
    const validatedMounts: Array<{ source: string; target: string; type: string; readOnly: boolean }> = [];

    for (const mount of mounts) {
      // Validate target path is allowed
      const isAllowedPath = profile.fileSystemRestrictions.allowedPaths.some(
        allowedPath => mount.target.startsWith(allowedPath)
      );

      if (!isAllowedPath) {
        this.logSecurityViolation({
          type: SecurityViolationType.UNAUTHORIZED_FILE_ACCESS,
          userId: profile.userId,
          sessionId: 'mount-validation',
          action: 'mount_attempt',
          resource: mount.target,
          blocked: true,
          severity: 'high',
        });
        continue;
      }

      // Check if path should be read-only
      const shouldBeReadOnly = profile.fileSystemRestrictions.readOnlyPaths.some(
        readOnlyPath => mount.target.startsWith(readOnlyPath)
      );

      validatedMounts.push({
        source: mount.source,
        target: mount.target,
        type: mount.type,
        readOnly: shouldBeReadOnly || mount.readOnly || false,
      });
    }

    return validatedMounts;
  }

  /**
   * Log security violation
   */
  logSecurityViolation(violation: {
    type: SecurityViolationType;
    userId: number;
    sessionId: string;
    action: string;
    resource: string;
    blocked: boolean;
    severity: 'low' | 'medium' | 'high' | 'critical';
    metadata?: Record<string, unknown>;
  }): void {
    const violationId = `${violation.userId}-${violation.sessionId}-${Date.now()}`;
    const securityViolation: SecurityViolation = {
      id: violationId,
      type: violation.type,
      userId: violation.userId,
      sessionId: violation.sessionId,
      timestamp: new Date(),
      details: {
        action: violation.action,
        resource: violation.resource,
        blocked: violation.blocked,
        severity: violation.severity,
      },
      metadata: violation.metadata,
    };

    // Store violation
    this.violations.set(violationId, securityViolation);

    // Update user violation count
    const currentCount = this.userViolationCounts.get(violation.userId) || 0;
    this.userViolationCounts.set(violation.userId, currentCount + 1);

    // Log the violation
    if (this.config.logSecurityEvents) {
      this.logger('warn', `Security violation detected`, {
        violationId,
        type: violation.type,
        userId: violation.userId,
        sessionId: violation.sessionId,
        action: violation.action,
        resource: violation.resource,
        blocked: violation.blocked,
        severity: violation.severity,
        metadata: violation.metadata,
      });
    }

    // Check if user has exceeded violation threshold
    if (currentCount + 1 >= this.config.maxViolationsPerUser) {
      this.logger('error', `User exceeded security violation threshold`, {
        userId: violation.userId,
        violationCount: currentCount + 1,
        threshold: this.config.maxViolationsPerUser,
      });

      // In a production system, this could trigger:
      // - Account suspension
      // - Session termination
      // - Admin notifications
      // - Additional monitoring
    }

    // Alert on critical violations
    if (violation.severity === 'critical' && this.config.alertOnViolations) {
      this.alertCriticalViolation(securityViolation);
    }
  }

  /**
   * Validate terminal command before execution with enhanced security checks
   */
  validateTerminalCommand(
    command: string,
    profile: ContainerSecurityProfile,
    sessionId: string
  ): { allowed: boolean; reason?: string } {
    // Check if terminal access is enabled
    if (!profile.terminalRestrictions.enabled) {
      this.logSecurityViolation({
        type: SecurityViolationType.TERMINAL_ACCESS_DENIED,
        userId: profile.userId,
        sessionId,
        action: 'terminal_command',
        resource: command,
        blocked: true,
        severity: 'medium',
      });
      return { allowed: false, reason: 'Terminal access disabled for user' };
    }

    // Enhanced security checks for dangerous patterns
    const dangerousPatterns = [
      /rm\s+-rf\s+\//, // rm -rf /
      /dd\s+if=/, // dd commands
      /mkfs/, // filesystem creation
      /fdisk/, // disk partitioning
      /mount\s+/, // mounting filesystems
      /umount\s+/, // unmounting filesystems
      /iptables/, // firewall rules
      /netstat/, // network information
      /ss\s+/, // socket statistics
      /lsof/, // list open files
      /ps\s+aux/, // process listing
      /kill\s+-9/, // force kill
      /killall/, // kill all processes
      /chmod\s+777/, // dangerous permissions
      /chown\s+root/, // change ownership to root
      /sudo\s+su/, // privilege escalation
      /su\s+-/, // switch user
      /docker/, // docker commands
      /kubectl/, // kubernetes commands
      /systemctl/, // systemd commands
      /service\s+/, // service management
      /\.\.\/\.\.\//, // directory traversal
      /\/proc\//, // proc filesystem access
      /\/sys\//, // sys filesystem access
      /\/dev\//, // device access
      /nc\s+/, // netcat
      /ncat\s+/, // ncat
      /telnet/, // telnet
      /ssh\s+/, // ssh connections
      /scp\s+/, // secure copy
      /rsync/, // rsync
      /wget\s+/, // wget downloads
      /curl.*-o/, // curl downloads
      /python.*-c/, // python code execution
      /node.*-e/, // node code execution
      /eval\s*\(/, // eval functions
      /exec\s*\(/, // exec functions
      /system\s*\(/, // system calls
      /`.*`/, // command substitution
      /\$\(.*\)/, // command substitution
    ];

    // Check for dangerous patterns
    const hasDangerousPattern = dangerousPatterns.some(pattern => pattern.test(command));
    if (hasDangerousPattern) {
      this.logSecurityViolation({
        type: SecurityViolationType.UNAUTHORIZED_COMMAND,
        userId: profile.userId,
        sessionId,
        action: 'dangerous_pattern',
        resource: command,
        blocked: true,
        severity: 'critical',
      });
      return { allowed: false, reason: 'Command contains dangerous patterns' };
    }

    // Check against blocked commands
    const isBlocked = profile.terminalRestrictions.blockedCommands.some(
      blockedCmd => command.toLowerCase().includes(blockedCmd.toLowerCase())
    );

    if (isBlocked) {
      this.logSecurityViolation({
        type: SecurityViolationType.UNAUTHORIZED_COMMAND,
        userId: profile.userId,
        sessionId,
        action: 'blocked_command',
        resource: command,
        blocked: true,
        severity: 'high',
      });
      return { allowed: false, reason: 'Command is blocked by security policy' };
    }

    // Check against allowed commands (if whitelist is configured)
    if (profile.terminalRestrictions.allowedCommands.length > 0) {
      const isAllowed = profile.terminalRestrictions.allowedCommands.some(
        allowedCmd => command.toLowerCase().startsWith(allowedCmd.toLowerCase())
      );

      if (!isAllowed) {
        this.logSecurityViolation({
          type: SecurityViolationType.UNAUTHORIZED_COMMAND,
          userId: profile.userId,
          sessionId,
          action: 'unauthorized_command',
          resource: command,
          blocked: true,
          severity: 'medium',
        });
        return { allowed: false, reason: 'Command not in allowed list' };
      }
    }

    // Check for path traversal attempts
    if (command.includes('../') || command.includes('..\\')) {
      this.logSecurityViolation({
        type: SecurityViolationType.UNAUTHORIZED_FILE_ACCESS,
        userId: profile.userId,
        sessionId,
        action: 'path_traversal',
        resource: command,
        blocked: true,
        severity: 'high',
      });
      return { allowed: false, reason: 'Path traversal attempts are not allowed' };
    }

    // Check for attempts to access restricted directories
    const restrictedPaths = ['/etc/', '/proc/', '/sys/', '/dev/', '/root/', '/var/run/', '/run/'];
    const hasRestrictedPath = restrictedPaths.some(path => command.includes(path));
    if (hasRestrictedPath) {
      this.logSecurityViolation({
        type: SecurityViolationType.UNAUTHORIZED_FILE_ACCESS,
        userId: profile.userId,
        sessionId,
        action: 'restricted_path_access',
        resource: command,
        blocked: true,
        severity: 'high',
      });
      return { allowed: false, reason: 'Access to restricted system paths is not allowed' };
    }

    return { allowed: true };
  }

  /**
   * Monitor container resource usage and enforce limits
   */
  async monitorResourceUsage(
    containerId: string,
    profile: ContainerSecurityProfile,
    currentStats: { cpu: number; memory: number; disk?: number }
  ): Promise<{ withinLimits: boolean; violations: string[] }> {
    const violations: string[] = [];

    // Check memory usage
    const memoryLimitBytes = this.parseMemoryLimit(profile.resourceLimits.memory);
    if (currentStats.memory > memoryLimitBytes) {
      violations.push(`Memory usage (${currentStats.memory}) exceeds limit (${memoryLimitBytes})`);
      
      this.logSecurityViolation({
        type: SecurityViolationType.RESOURCE_LIMIT_EXCEEDED,
        userId: profile.userId,
        sessionId: containerId,
        action: 'memory_limit_exceeded',
        resource: `${currentStats.memory}/${memoryLimitBytes}`,
        blocked: false,
        severity: 'medium',
        metadata: { currentMemory: currentStats.memory, limitMemory: memoryLimitBytes },
      });
    }

    // Check CPU usage
    const cpuLimit = parseFloat(profile.resourceLimits.cpu);
    if (currentStats.cpu > cpuLimit * 100) { // CPU is in percentage
      violations.push(`CPU usage (${currentStats.cpu}%) exceeds limit (${cpuLimit * 100}%)`);
      
      this.logSecurityViolation({
        type: SecurityViolationType.RESOURCE_LIMIT_EXCEEDED,
        userId: profile.userId,
        sessionId: containerId,
        action: 'cpu_limit_exceeded',
        resource: `${currentStats.cpu}%/${cpuLimit * 100}%`,
        blocked: false,
        severity: 'medium',
        metadata: { currentCpu: currentStats.cpu, limitCpu: cpuLimit * 100 },
      });
    }

    return {
      withinLimits: violations.length === 0,
      violations,
    };
  }

  /**
   * Get security metrics
   */
  getSecurityMetrics(): SecurityMetrics {
    const violationsByType: Record<SecurityViolationType, number> = {} as Record<SecurityViolationType, number>;
    const violationsByUser: Record<number, number> = {};
    let totalViolations = 0;
    let blockedActions = 0;
    let lastViolation: Date | undefined;

    // Initialize violation counts
    Object.values(SecurityViolationType).forEach(type => {
      violationsByType[type] = 0;
    });

    // Count violations
    for (const violation of this.violations.values()) {
      totalViolations++;
      violationsByType[violation.type]++;
      
      if (violation.details.blocked) {
        blockedActions++;
      }

      violationsByUser[violation.userId] = (violationsByUser[violation.userId] || 0) + 1;

      if (!lastViolation || violation.timestamp > lastViolation) {
        lastViolation = violation.timestamp;
      }
    }

    // Count active threats (recent critical violations)
    const recentThreshold = new Date(Date.now() - 60 * 60 * 1000); // Last hour
    const activeThreats = Array.from(this.violations.values()).filter(
      v => v.details.severity === 'critical' && v.timestamp > recentThreshold
    ).length;

    return {
      totalViolations,
      violationsByType,
      violationsByUser,
      blockedActions,
      activeThreats,
      lastViolation,
    };
  }

  /**
   * Get violations for a specific user
   */
  getUserViolations(userId: number): SecurityViolation[] {
    return Array.from(this.violations.values()).filter(v => v.userId === userId);
  }

  /**
   * Monitor file system access attempts
   */
  validateFileAccess(
    filePath: string,
    operation: 'read' | 'write' | 'execute',
    profile: ContainerSecurityProfile,
    sessionId: string
  ): { allowed: boolean; reason?: string } {
    // Check if path is in allowed directories
    const isAllowedPath = profile.fileSystemRestrictions.allowedPaths.some(
      allowedPath => filePath.startsWith(allowedPath)
    );

    if (!isAllowedPath) {
      this.logSecurityViolation({
        type: SecurityViolationType.UNAUTHORIZED_FILE_ACCESS,
        userId: profile.userId,
        sessionId,
        action: `file_${operation}`,
        resource: filePath,
        blocked: true,
        severity: 'high',
      });
      return { allowed: false, reason: 'File access outside allowed directories' };
    }

    // Check if path is read-only and operation is write
    if (operation === 'write') {
      const isReadOnlyPath = profile.fileSystemRestrictions.readOnlyPaths.some(
        readOnlyPath => filePath.startsWith(readOnlyPath)
      );

      if (isReadOnlyPath) {
        this.logSecurityViolation({
          type: SecurityViolationType.UNAUTHORIZED_FILE_ACCESS,
          userId: profile.userId,
          sessionId,
          action: 'write_to_readonly',
          resource: filePath,
          blocked: true,
          severity: 'medium',
        });
        return { allowed: false, reason: 'Write access denied to read-only path' };
      }
    }

    // Check for suspicious file patterns
    const suspiciousPatterns = [
      /\.ssh\//, // SSH keys
      /\.aws\//, // AWS credentials
      /\.docker\//, // Docker config
      /\.kube\//, // Kubernetes config
      /passwd$/, // Password files
      /shadow$/, // Shadow files
      /sudoers/, // Sudoers files
      /authorized_keys/, // SSH authorized keys
      /id_rsa/, // SSH private keys
      /\.pem$/, // Certificate files
      /\.key$/, // Key files
      /\.crt$/, // Certificate files
    ];

    const hasSuspiciousPattern = suspiciousPatterns.some(pattern => pattern.test(filePath));
    if (hasSuspiciousPattern) {
      this.logSecurityViolation({
        type: SecurityViolationType.UNAUTHORIZED_FILE_ACCESS,
        userId: profile.userId,
        sessionId,
        action: `suspicious_file_${operation}`,
        resource: filePath,
        blocked: true,
        severity: 'critical',
      });
      return { allowed: false, reason: 'Access to sensitive file types is not allowed' };
    }

    return { allowed: true };
  }

  /**
   * Monitor network access attempts
   */
  validateNetworkAccess(
    destination: string,
    port: number,
    protocol: 'tcp' | 'udp',
    profile: ContainerSecurityProfile,
    sessionId: string
  ): { allowed: boolean; reason?: string } {
    // Check if network access is enabled
    if (!profile.networkRestrictions.enableInternet) {
      // Only allow localhost connections
      if (!['127.0.0.1', 'localhost', '::1'].includes(destination)) {
        this.logSecurityViolation({
          type: SecurityViolationType.UNAUTHORIZED_NETWORK_ACCESS,
          userId: profile.userId,
          sessionId,
          action: 'external_network_access',
          resource: `${destination}:${port}`,
          blocked: true,
          severity: 'high',
        });
        return { allowed: false, reason: 'External network access is disabled' };
      }
    }

    // Check blocked ports
    if (profile.networkRestrictions.blockedPorts.includes(port)) {
      this.logSecurityViolation({
        type: SecurityViolationType.UNAUTHORIZED_NETWORK_ACCESS,
        userId: profile.userId,
        sessionId,
        action: 'blocked_port_access',
        resource: `${destination}:${port}`,
        blocked: true,
        severity: 'medium',
      });
      return { allowed: false, reason: `Access to port ${port} is blocked` };
    }

    // Check for suspicious ports
    const suspiciousPorts = [22, 23, 25, 53, 135, 139, 445, 993, 995, 1433, 3306, 3389, 5432, 6379, 27017];
    if (suspiciousPorts.includes(port)) {
      this.logSecurityViolation({
        type: SecurityViolationType.UNAUTHORIZED_NETWORK_ACCESS,
        userId: profile.userId,
        sessionId,
        action: 'suspicious_port_access',
        resource: `${destination}:${port}`,
        blocked: false, // Log but don't block (might be legitimate)
        severity: 'medium',
      });
    }

    return { allowed: true };
  }

  /**
   * Detect potential container escape attempts
   */
  detectEscapeAttempt(
    activity: string,
    details: Record<string, unknown>,
    profile: ContainerSecurityProfile,
    sessionId: string
  ): boolean {
    const escapePatterns = [
      'proc/self/root', // Accessing host root via proc
      'docker.sock', // Docker socket access
      'runc', // Container runtime access
      'cgroup', // Control group manipulation
      'namespace', // Namespace manipulation
      'capabilities', // Capability manipulation
      'seccomp', // Seccomp bypass
      'apparmor', // AppArmor bypass
      'selinux', // SELinux bypass
    ];

    const isEscapeAttempt = escapePatterns.some(pattern => 
      activity.toLowerCase().includes(pattern)
    );

    if (isEscapeAttempt) {
      this.logSecurityViolation({
        type: SecurityViolationType.CONTAINER_ESCAPE_ATTEMPT,
        userId: profile.userId,
        sessionId,
        action: 'container_escape_attempt',
        resource: activity,
        blocked: true,
        severity: 'critical',
        metadata: details,
      });

      // In a production system, this should immediately terminate the container
      this.logger('error', 'CRITICAL: Container escape attempt detected', {
        userId: profile.userId,
        sessionId,
        activity,
        details,
      });

      return true;
    }

    return false;
  }

  /**
   * Clear old violations (cleanup)
   */
  clearOldViolations(olderThanDays: number = 30): number {
    const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    let clearedCount = 0;

    for (const [id, violation] of this.violations.entries()) {
      if (violation.timestamp < cutoffDate) {
        this.violations.delete(id);
        clearedCount++;
      }
    }

    this.logger('info', `Cleared ${clearedCount} old security violations`);
    return clearedCount;
  }

  // Private helper methods

  private parseMemoryLimit(memory: string): number {
    const match = memory.match(/^(\d+)([kmg]?)$/i);
    if (!match) return 2 * 1024 * 1024 * 1024; // Default 2GB
    
    const value = parseInt(match[1] || '2');
    const unit = (match[2] || '').toLowerCase();
    
    switch (unit) {
      case 'k': return value * 1024;
      case 'm': return value * 1024 * 1024;
      case 'g': return value * 1024 * 1024 * 1024;
      default: return value;
    }
  }

  private alertCriticalViolation(violation: SecurityViolation): void {
    this.logger('error', `CRITICAL SECURITY VIOLATION`, {
      violationId: violation.id,
      type: violation.type,
      userId: violation.userId,
      sessionId: violation.sessionId,
      details: violation.details,
      metadata: violation.metadata,
    });

    // In a production system, this could:
    // - Send alerts to security team
    // - Trigger automated responses
    // - Escalate to incident management
    // - Terminate sessions immediately
  }
}

// Default security configuration
export function createDefaultSecurityConfig(): SecurityConfig {
  return {
    // Network security
    allowedNetworks: ['127.0.0.1', 'localhost'],
    blockedPorts: [22, 23, 25, 53, 80, 443, 993, 995],
    enableNetworkIsolation: true,
    
    // File system security
    readOnlyMounts: ['/etc', '/usr', '/bin', '/sbin', '/lib', '/lib64'],
    restrictedPaths: ['/proc', '/sys', '/dev', '/run', '/var/run'],
    maxFileSize: 100 * 1024 * 1024, // 100MB
    
    // Resource limits
    maxMemoryPerContainer: process.env.MAX_MEMORY_PER_CONTAINER || '2g',
    maxCpuPerContainer: process.env.MAX_CPU_PER_CONTAINER || '1.0',
    maxDiskUsage: process.env.MAX_DISK_PER_CONTAINER || '5g',
    
    // Terminal security
    allowedCommands: [
      'ls', 'cd', 'pwd', 'cat', 'less', 'more', 'head', 'tail',
      'grep', 'find', 'which', 'echo', 'printf',
      'git', 'npm', 'yarn', 'node', 'python', 'pip',
      'make', 'cmake', 'gcc', 'g++', 'javac', 'java',
      'vim', 'nano', 'emacs', 'code',
    ],
    blockedCommands: [
      'rm -rf /', 'dd if=', 'mkfs', 'fdisk',
      'iptables', 'netstat', 'ss', 'lsof',
      'docker', 'kubectl', 'systemctl', 'service',
      'mount', 'umount', 'sudo', 'su',
    ],
    shellTimeout: 3600, // 1 hour
    
    // Monitoring
    logSecurityEvents: true,
    alertOnViolations: true,
    maxViolationsPerUser: 10,
  };
}

// Singleton instance
let securityServiceInstance: SecurityService | null = null;

export function getSecurityService(): SecurityService {
  if (!securityServiceInstance) {
    const config = createDefaultSecurityConfig();
    securityServiceInstance = new SecurityService(config);
  }
  return securityServiceInstance;
}