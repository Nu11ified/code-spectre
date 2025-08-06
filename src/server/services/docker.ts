import Docker from 'dockerode';
import type { 
  ContainerConfig, 
  Mount, 
  ResourceLimits, 
  SessionStatus,
  LogEntry,
  UserPermissions 
} from '@/types/domain';
import { getTraefikService, type ContainerRoute } from './traefik';
import { getSecurityService, type ContainerSecurityProfile } from './security';

export interface DockerServiceConfig {
  socketPath?: string; // Docker socket path (default: /var/run/docker.sock)
  defaultImage: string; // Default code-server image
  networkName: string; // Docker network for containers
  baseUrl: string; // Base URL for container access
  sessionTimeoutMinutes: number; // Timeout for inactive sessions
  maxContainers: number; // Maximum number of concurrent containers
  defaultResources: ResourceLimits; // Default resource limits
}

export interface ContainerInfo {
  id: string;
  name: string;
  status: string;
  created: Date;
  labels: Record<string, string>;
  ports: Array<{
    privatePort: number;
    publicPort?: number;
    type: string;
  }>;
  mounts: Array<{
    source: string;
    destination: string;
    mode: string;
    rw: boolean;
  }>;
  route?: ContainerRoute; // Traefik routing information
}

export interface ContainerStats {
  cpu: number; // CPU usage percentage
  memory: number; // Memory usage in bytes
  memoryLimit: number; // Memory limit in bytes
  networkRx: number; // Network bytes received
  networkTx: number; // Network bytes transmitted
}

export interface ContainerHealthCheck {
  containerId: string;
  healthy: boolean;
  lastCheck: Date;
  error?: string;
}

export class DockerService {
  private docker: Docker;
  private config: DockerServiceConfig;
  private logger: (level: 'info' | 'warn' | 'error', message: string, metadata?: any) => void;
  private cleanupInterval?: NodeJS.Timeout;
  private traefikService: ReturnType<typeof getTraefikService>;
  private securityService = getSecurityService();

  constructor(
    config: DockerServiceConfig,
    logger?: (level: 'info' | 'warn' | 'error', message: string, metadata?: any) => void
  ) {
    this.config = config;
    this.logger = logger || ((level, message, metadata) => {
      console[level](`[DockerService] ${message}`, metadata || '');
    });

    // Initialize Docker client
    this.docker = new Docker({
      socketPath: config.socketPath || '/var/run/docker.sock',
    });

    // Initialize Traefik service
    this.traefikService = getTraefikService();
  }

  /**
   * Initialize the Docker service
   */
  async initialize(): Promise<void> {
    try {
      // Test Docker connection
      await this.docker.ping();
      
      // Initialize Traefik service
      await this.traefikService.initialize();
      
      // Ensure network exists
      await this.ensureNetwork();
      
      // Start cleanup interval
      this.startCleanupInterval();
      
      this.logger('info', 'Docker service initialized', {
        socketPath: this.config.socketPath,
        networkName: this.config.networkName,
        defaultImage: this.config.defaultImage,
      });
    } catch (error) {
      this.logger('error', 'Failed to initialize Docker service', { error });
      throw new Error(`Docker service initialization failed: ${error}`);
    }
  }

  /**
   * Create and start a new IDE container with security isolation
   */
  async createIdeContainer(params: {
    userId: number;
    repositoryId: number;
    branchName: string;
    worktreePath: string;
    extensionsPath: string;
    permissions: UserPermissions;
  }): Promise<ContainerInfo> {
    try {
      const containerName = this.generateContainerName(
        params.userId, 
        params.repositoryId, 
        params.branchName
      );

      // Check if container already exists
      const existingContainer = await this.findContainerByName(containerName);
      if (existingContainer) {
        this.logger('info', 'Container already exists', { containerName });
        return existingContainer;
      }

      // Check container limits
      await this.enforceContainerLimits();

      // Generate security profile for the container
      const securityProfile = this.securityService.generateSecurityProfile(
        params.userId,
        params.permissions,
        params.repositoryId
      );

      const containerConfig = this.buildSecureContainerConfig({
        name: containerName,
        userId: params.userId,
        repositoryId: params.repositoryId,
        branchName: params.branchName,
        worktreePath: params.worktreePath,
        extensionsPath: params.extensionsPath,
        securityProfile,
      });

      this.logger('info', 'Creating IDE container', { 
        containerName, 
        userId: params.userId,
        repositoryId: params.repositoryId,
        branchName: params.branchName,
      });

      // Create container
      const container = await this.docker.createContainer(containerConfig);
      
      // Start container
      await container.start();

      // Wait for container to be ready
      await this.waitForContainerReady(container.id);

      // Register container route with Traefik
      const route = await this.traefikService.registerContainerRoute({
        containerId: container.id,
        containerName,
        userId: params.userId,
        repositoryId: params.repositoryId,
        branchName: params.branchName,
      });

      const containerInfo = await this.getContainerInfo(container.id);
      containerInfo.route = route;
      
      this.logger('info', 'IDE container created and started', { 
        containerId: container.id,
        containerName,
        routeUrl: route.url,
      });

      return containerInfo;
    } catch (error) {
      this.logger('error', 'Failed to create IDE container', { 
        userId: params.userId,
        repositoryId: params.repositoryId,
        branchName: params.branchName,
        error,
      });
      throw new Error(`Container creation failed: ${error}`);
    }
  }

  /**
   * Stop a container
   */
  async stopContainer(containerId: string): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      
      // Check if container exists and is running
      const containerInfo = await container.inspect();
      if (!containerInfo.State.Running) {
        this.logger('info', 'Container already stopped', { containerId });
        return;
      }

      this.logger('info', 'Stopping container', { containerId });
      
      // Graceful stop with timeout
      await container.stop({ t: 10 });
      
      this.logger('info', 'Container stopped', { containerId });
    } catch (error) {
      this.logger('error', 'Failed to stop container', { containerId, error });
      throw new Error(`Container stop failed: ${error}`);
    }
  }

  /**
   * Remove a container
   */
  async removeContainer(containerId: string): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      
      // Stop container if running
      try {
        await this.stopContainer(containerId);
      } catch {
        // Container might already be stopped
      }

      // Unregister route from Traefik
      try {
        await this.traefikService.unregisterContainerRoute(containerId);
      } catch (error) {
        this.logger('warn', 'Failed to unregister Traefik route', { containerId, error });
      }

      this.logger('info', 'Removing container', { containerId });
      
      // Remove container
      await container.remove({ force: true });
      
      this.logger('info', 'Container removed', { containerId });
    } catch (error) {
      this.logger('error', 'Failed to remove container', { containerId, error });
      throw new Error(`Container removal failed: ${error}`);
    }
  }

  /**
   * Get container information
   */
  async getContainerInfo(containerId: string): Promise<ContainerInfo> {
    try {
      const container = this.docker.getContainer(containerId);
      const containerData = await container.inspect();
      
      return {
        id: containerData.Id,
        name: containerData.Name.replace('/', ''), // Remove leading slash
        status: containerData.State.Status,
        created: new Date(containerData.Created),
        labels: containerData.Config.Labels || {},
        ports: Object.entries(containerData.NetworkSettings.Ports || {}).map(([port, bindings]) => ({
          privatePort: parseInt(port.split('/')[0] || '0'),
          publicPort: bindings?.[0]?.HostPort ? parseInt(bindings[0].HostPort) : undefined,
          type: port.split('/')[1] || 'tcp',
        })),
        mounts: containerData.Mounts.map(mount => ({
          source: mount.Source,
          destination: mount.Destination,
          mode: mount.Mode,
          rw: mount.RW,
        })),
      };
    } catch (error) {
      this.logger('error', 'Failed to get container info', { containerId, error });
      throw new Error(`Failed to get container info: ${error}`);
    }
  }

  /**
   * Get container statistics
   */
  async getContainerStats(containerId: string): Promise<ContainerStats> {
    try {
      const container = this.docker.getContainer(containerId);
      const stats = await container.stats({ stream: false });
      
      // Calculate CPU usage percentage
      const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - 
                      (stats.precpu_stats.cpu_usage?.total_usage || 0);
      const systemDelta = stats.cpu_stats.system_cpu_usage - 
                         (stats.precpu_stats.system_cpu_usage || 0);
      const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * 100 : 0;

      // Get memory usage
      const memoryUsage = stats.memory_stats.usage || 0;
      const memoryLimit = stats.memory_stats.limit || 0;

      // Get network stats
      const networks = stats.networks || {};
      let networkRx = 0;
      let networkTx = 0;
      
      Object.values(networks).forEach((network: any) => {
        networkRx += network.rx_bytes || 0;
        networkTx += network.tx_bytes || 0;
      });

      return {
        cpu: Math.round(cpuPercent * 100) / 100,
        memory: memoryUsage,
        memoryLimit,
        networkRx,
        networkTx,
      };
    } catch (error) {
      this.logger('error', 'Failed to get container stats', { containerId, error });
      throw new Error(`Failed to get container stats: ${error}`);
    }
  }

  /**
   * List all containers managed by this service
   */
  async listContainers(includeAll = false): Promise<ContainerInfo[]> {
    try {
      const containers = await this.docker.listContainers({ 
        all: includeAll,
        filters: {
          label: [`${this.getLabelPrefix()}.managed=true`],
        },
      });

      const containerInfos: ContainerInfo[] = [];
      
      for (const containerData of containers) {
        containerInfos.push({
          id: containerData.Id,
          name: containerData.Names[0]?.replace('/', '') || '',
          status: containerData.State,
          created: new Date(containerData.Created * 1000),
          labels: containerData.Labels || {},
          ports: containerData.Ports.map(port => ({
            privatePort: port.PrivatePort,
            publicPort: port.PublicPort,
            type: port.Type,
          })),
          mounts: containerData.Mounts.map(mount => ({
            source: mount.Source,
            destination: mount.Destination,
            mode: mount.Mode,
            rw: mount.RW,
          })),
        });
      }

      return containerInfos;
    } catch (error) {
      this.logger('error', 'Failed to list containers', { error });
      throw new Error(`Failed to list containers: ${error}`);
    }
  }

  /**
   * Perform health check on a container
   */
  async healthCheck(containerId: string): Promise<ContainerHealthCheck> {
    try {
      const container = this.docker.getContainer(containerId);
      const containerInfo = await container.inspect();
      
      const isHealthy = containerInfo.State.Running && 
                       containerInfo.State.Health?.Status !== 'unhealthy';

      return {
        containerId,
        healthy: isHealthy,
        lastCheck: new Date(),
        error: !isHealthy ? containerInfo.State.Health?.FailingStreak?.toString() : undefined,
      };
    } catch (error) {
      return {
        containerId,
        healthy: false,
        lastCheck: new Date(),
        error: String(error),
      };
    }
  }

  /**
   * Clean up inactive containers
   */
  async cleanupInactiveContainers(): Promise<void> {
    try {
      const containers = await this.listContainers(true);
      const cutoffTime = new Date(Date.now() - this.config.sessionTimeoutMinutes * 60 * 1000);
      
      for (const container of containers) {
        const lastAccessed = this.getLastAccessedTime(container);
        
        if (lastAccessed < cutoffTime && container.status !== 'exited') {
          this.logger('info', 'Cleaning up inactive container', {
            containerId: container.id,
            containerName: container.name,
            lastAccessed,
          });
          
          try {
            await this.removeContainer(container.id);
          } catch (error) {
            this.logger('error', 'Failed to cleanup container', {
              containerId: container.id,
              error,
            });
          }
        }
      }
    } catch (error) {
      this.logger('error', 'Failed to cleanup inactive containers', { error });
    }
  }

  /**
   * Get system resource usage with security monitoring
   */
  async getSystemStats(): Promise<{
    containerCount: number;
    totalCpuUsage: number;
    totalMemoryUsage: number;
    securityMetrics: any;
  }> {
    try {
      const containers = await this.listContainers();
      let totalCpuUsage = 0;
      let totalMemoryUsage = 0;
      
      for (const container of containers) {
        if (container.status === 'running') {
          try {
            const stats = await this.getContainerStats(container.id);
            totalCpuUsage += stats.cpu;
            totalMemoryUsage += stats.memory;
          } catch {
            // Skip containers that can't provide stats
          }
        }
      }

      // Get security metrics
      const securityMetrics = this.securityService.getSecurityMetrics();

      return {
        containerCount: containers.length,
        totalCpuUsage: Math.round(totalCpuUsage * 100) / 100,
        totalMemoryUsage,
        securityMetrics,
      };
    } catch (error) {
      this.logger('error', 'Failed to get system stats', { error });
      throw new Error(`Failed to get system stats: ${error}`);
    }
  }

  /**
   * Monitor container security and resource compliance
   */
  async monitorContainerSecurity(containerId: string): Promise<{
    compliant: boolean;
    violations: string[];
    resourceUsage: any;
  }> {
    try {
      const containerInfo = await this.getContainerInfo(containerId);
      const stats = await this.getContainerStats(containerId);
      
      // Get user ID and generate security profile for validation
      const userId = parseInt(containerInfo.labels[`${this.getLabelPrefix()}.user-id`] || '0');
      const repositoryId = parseInt(containerInfo.labels[`${this.getLabelPrefix()}.repository-id`] || '0');
      
      if (!userId || !repositoryId) {
        return {
          compliant: false,
          violations: ['Container missing required security labels'],
          resourceUsage: stats,
        };
      }

      // For monitoring, we need to reconstruct the security profile
      // In a real implementation, this could be stored or retrieved from database
      const mockPermissions: UserPermissions = {
        canCreateBranches: true,
        branchLimit: 5,
        allowedBaseBranches: ['main', 'develop'],
        allowTerminalAccess: true,
      };

      const securityProfile = this.securityService.generateSecurityProfile(
        userId,
        mockPermissions,
        repositoryId
      );

      // Monitor resource usage against security profile
      const resourceCheck = await this.securityService.monitorResourceUsage(
        containerId,
        securityProfile,
        {
          cpu: stats.cpu,
          memory: stats.memory,
        }
      );

      return {
        compliant: resourceCheck.withinLimits,
        violations: resourceCheck.violations,
        resourceUsage: stats,
      };
    } catch (error) {
      this.logger('error', 'Failed to monitor container security', { containerId, error });
      return {
        compliant: false,
        violations: [`Monitoring error: ${error}`],
        resourceUsage: null,
      };
    }
  }

  /**
   * Validate terminal command execution with enhanced security
   */
  async validateTerminalCommand(
    containerId: string,
    command: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    try {
      const containerInfo = await this.getContainerInfo(containerId);
      const userId = parseInt(containerInfo.labels[`${this.getLabelPrefix()}.user-id`] || '0');
      const repositoryId = parseInt(containerInfo.labels[`${this.getLabelPrefix()}.repository-id`] || '0');
      
      if (!userId || !repositoryId) {
        return { allowed: false, reason: 'Container security context not found' };
      }

      // Reconstruct security profile for validation
      const mockPermissions: UserPermissions = {
        canCreateBranches: true,
        branchLimit: 5,
        allowedBaseBranches: ['main', 'develop'],
        allowTerminalAccess: true,
      };

      const securityProfile = this.securityService.generateSecurityProfile(
        userId,
        mockPermissions,
        repositoryId
      );

      return this.securityService.validateTerminalCommand(command, securityProfile, containerId);
    } catch (error) {
      this.logger('error', 'Failed to validate terminal command', { containerId, command, error });
      return { allowed: false, reason: 'Validation error' };
    }
  }

  /**
   * Validate file access attempts
   */
  async validateFileAccess(
    containerId: string,
    filePath: string,
    operation: 'read' | 'write' | 'execute'
  ): Promise<{ allowed: boolean; reason?: string }> {
    try {
      const containerInfo = await this.getContainerInfo(containerId);
      const userId = parseInt(containerInfo.labels[`${this.getLabelPrefix()}.user-id`] || '0');
      const repositoryId = parseInt(containerInfo.labels[`${this.getLabelPrefix()}.repository-id`] || '0');
      
      if (!userId || !repositoryId) {
        return { allowed: false, reason: 'Container security context not found' };
      }

      const mockPermissions: UserPermissions = {
        canCreateBranches: true,
        branchLimit: 5,
        allowedBaseBranches: ['main', 'develop'],
        allowTerminalAccess: true,
      };

      const securityProfile = this.securityService.generateSecurityProfile(
        userId,
        mockPermissions,
        repositoryId
      );

      return this.securityService.validateFileAccess(filePath, operation, securityProfile, containerId);
    } catch (error) {
      this.logger('error', 'Failed to validate file access', { containerId, filePath, operation, error });
      return { allowed: false, reason: 'Validation error' };
    }
  }

  /**
   * Validate network access attempts
   */
  async validateNetworkAccess(
    containerId: string,
    destination: string,
    port: number,
    protocol: 'tcp' | 'udp' = 'tcp'
  ): Promise<{ allowed: boolean; reason?: string }> {
    try {
      const containerInfo = await this.getContainerInfo(containerId);
      const userId = parseInt(containerInfo.labels[`${this.getLabelPrefix()}.user-id`] || '0');
      const repositoryId = parseInt(containerInfo.labels[`${this.getLabelPrefix()}.repository-id`] || '0');
      
      if (!userId || !repositoryId) {
        return { allowed: false, reason: 'Container security context not found' };
      }

      const mockPermissions: UserPermissions = {
        canCreateBranches: true,
        branchLimit: 5,
        allowedBaseBranches: ['main', 'develop'],
        allowTerminalAccess: true,
      };

      const securityProfile = this.securityService.generateSecurityProfile(
        userId,
        mockPermissions,
        repositoryId
      );

      return this.securityService.validateNetworkAccess(destination, port, protocol, securityProfile, containerId);
    } catch (error) {
      this.logger('error', 'Failed to validate network access', { containerId, destination, port, error });
      return { allowed: false, reason: 'Validation error' };
    }
  }

  /**
   * Perform comprehensive security audit on a container
   */
  async performSecurityAudit(containerId: string): Promise<{
    compliant: boolean;
    violations: string[];
    recommendations: string[];
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
  }> {
    try {
      const containerInfo = await this.getContainerInfo(containerId);
      const stats = await this.getContainerStats(containerId);
      
      const violations: string[] = [];
      const recommendations: string[] = [];
      let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';

      // Check container configuration
      if (!containerInfo.labels[`${this.getLabelPrefix()}.security-profile`]) {
        violations.push('Container missing security profile');
        riskLevel = 'high';
      }

      // Check resource usage
      const memoryUsagePercent = (stats.memory / stats.memoryLimit) * 100;
      if (memoryUsagePercent > 90) {
        violations.push(`High memory usage: ${memoryUsagePercent.toFixed(1)}%`);
        if (riskLevel === 'low') riskLevel = 'medium';
      }

      if (stats.cpu > 90) {
        violations.push(`High CPU usage: ${stats.cpu.toFixed(1)}%`);
        if (riskLevel === 'low') riskLevel = 'medium';
      }

      // Check container age
      const containerAge = Date.now() - containerInfo.created.getTime();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      if (containerAge > maxAge) {
        recommendations.push('Container has been running for more than 24 hours, consider restarting');
      }

      // Check for security labels
      const requiredLabels = [
        `${this.getLabelPrefix()}.user-id`,
        `${this.getLabelPrefix()}.repository-id`,
        `${this.getLabelPrefix()}.branch-name`,
      ];

      for (const label of requiredLabels) {
        if (!containerInfo.labels[label]) {
          violations.push(`Missing required security label: ${label}`);
          riskLevel = 'high';
        }
      }

      // Additional security checks
      if (containerInfo.status !== 'running') {
        violations.push('Container is not in running state');
        if (riskLevel === 'low') riskLevel = 'medium';
      }

      // Check for suspicious network activity
      if (stats.networkTx > 1024 * 1024 * 100) { // 100MB
        recommendations.push('High network transmission detected, monitor for data exfiltration');
        if (riskLevel === 'low') riskLevel = 'medium';
      }

      return {
        compliant: violations.length === 0,
        violations,
        recommendations,
        riskLevel,
      };
    } catch (error) {
      this.logger('error', 'Failed to perform security audit', { containerId, error });
      return {
        compliant: false,
        violations: [`Audit error: ${error}`],
        recommendations: ['Investigate audit failure'],
        riskLevel: 'critical',
      };
    }
  }

  /**
   * Shutdown the Docker service
   */
  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.logger('info', 'Docker service shutdown');
  }

  // Private helper methods

  private generateContainerName(userId: number, repositoryId: number, branchName: string): string {
    const safeBranchName = branchName.replace(/[^a-zA-Z0-9-_]/g, '_');
    return `ide_user_${userId}_repo_${repositoryId}_${safeBranchName}`;
  }

  private getLabelPrefix(): string {
    return 'cloud-ide-orchestrator';
  }

  private async findContainerByName(name: string): Promise<ContainerInfo | null> {
    try {
      const containers = await this.listContainers(true);
      return containers.find(c => c.name === name) || null;
    } catch {
      return null;
    }
  }

  private async enforceContainerLimits(): Promise<void> {
    const containers = await this.listContainers();
    const runningContainers = containers.filter(c => c.status === 'running');
    
    if (runningContainers.length >= this.config.maxContainers) {
      throw new Error(`Maximum container limit reached (${this.config.maxContainers})`);
    }
  }

  private buildSecureContainerConfig(params: {
    name: string;
    userId: number;
    repositoryId: number;
    branchName: string;
    worktreePath: string;
    extensionsPath: string;
    securityProfile: ContainerSecurityProfile;
  }): any {
    const labels = {
      [`${this.getLabelPrefix()}.managed`]: 'true',
      [`${this.getLabelPrefix()}.user-id`]: params.userId.toString(),
      [`${this.getLabelPrefix()}.repository-id`]: params.repositoryId.toString(),
      [`${this.getLabelPrefix()}.branch-name`]: params.branchName,
      [`${this.getLabelPrefix()}.created`]: new Date().toISOString(),
      [`${this.getLabelPrefix()}.last-accessed`]: new Date().toISOString(),
      [`${this.getLabelPrefix()}.security-profile`]: 'enabled',
      // Basic Traefik labels (detailed routing handled by TraefikService)
      'traefik.enable': 'true',
      [`traefik.http.services.${params.name}.loadbalancer.server.port`]: '8080',
    };

    // Base mounts with security validation
    const baseMounts = [
      {
        source: params.worktreePath,
        target: '/home/coder/workspace',
        type: 'bind',
        readOnly: false,
      },
      {
        source: params.extensionsPath,
        target: '/home/coder/.local/share/code-server/extensions',
        type: 'bind',
        readOnly: true,
      },
    ];

    // Validate and secure mounts
    const securedMounts = this.securityService.validateMountConfig(baseMounts, params.securityProfile);

    // Convert to Docker mount format
    const dockerMounts = securedMounts.map(mount => ({
      Target: mount.target,
      Source: mount.source,
      Type: mount.type,
      ReadOnly: mount.readOnly,
    }));

    // Environment variables with security considerations
    const environment = [
      'PASSWORD=', // Disable password authentication
      'SUDO_PASSWORD=', // Disable sudo password
      'DISABLE_TELEMETRY=true',
      'DISABLE_UPDATE_CHECK=true',
      'DISABLE_GETTING_STARTED_OVERRIDE=true',
    ];

    // Configure terminal access based on security profile
    if (!params.securityProfile.terminalRestrictions.enabled) {
      environment.push('DISABLE_TERMINAL=true');
    } else {
      // Add terminal timeout
      environment.push(`SHELL_TIMEOUT=${params.securityProfile.terminalRestrictions.timeout}`);
    }

    // Get security options from security service
    const securityOptions = this.securityService.generateDockerSecurityOptions(params.securityProfile);
    const networkConfig = this.securityService.generateNetworkConfig(params.securityProfile);

    return {
      Image: this.config.defaultImage,
      name: params.name,
      Labels: labels,
      Env: environment,
      ExposedPorts: {
        '8080/tcp': {},
      },
      HostConfig: {
        // Resource limits from security profile
        Memory: this.parseMemoryLimit(params.securityProfile.resourceLimits.memory),
        CpuQuota: this.parseCpuLimit(params.securityProfile.resourceLimits.cpu),
        CpuPeriod: 100000, // Standard CPU period
        
        // Secure mounts
        Mounts: dockerMounts,
        
        // Network configuration with enhanced security
        NetworkMode: networkConfig.networkMode,
        Dns: networkConfig.dns,
        ExtraHosts: networkConfig.extraHosts,
        PublishAllPorts: networkConfig.publishAllPorts,
        
        // Additional network security
        DnsOptions: ['ndots:0'], // Minimize DNS lookups
        DnsSearch: [], // No DNS search domains
        
        // Security options
        SecurityOpt: securityOptions.securityOpt,
        CapAdd: securityOptions.capAdd,
        CapDrop: securityOptions.capDrop,
        ReadonlyRootfs: securityOptions.readOnlyRootfs,
        Tmpfs: securityOptions.tmpfs,
        Ulimits: securityOptions.ulimits,
        
        // Restart policy
        RestartPolicy: {
          Name: 'unless-stopped',
        },
        
        // Additional security: disable privileged mode
        Privileged: false,
        
        // PID mode isolation
        PidMode: '',
        
        // User namespace remapping (if supported)
        UsernsMode: '',
      },
      NetworkingConfig: {
        EndpointsConfig: {
          [networkConfig.networkMode]: {
            // Additional network security could be configured here
          },
        },
      },
      // Working directory
      WorkingDir: '/home/coder/workspace',
      
      // User configuration (run as non-root)
      User: 'coder:coder',
    };
  }

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

  private parseCpuLimit(cpus: string): number {
    const value = parseFloat(cpus);
    return Math.floor(value * 100000); // Convert to CPU quota (microseconds)
  }

  private async ensureNetwork(): Promise<void> {
    try {
      // Ensure main network exists
      await this.ensureNetworkExists(this.config.networkName, {
        Driver: 'bridge',
        Labels: {
          [`${this.getLabelPrefix()}.managed`]: 'true',
        },
      });

      // Ensure isolated network exists for security
      await this.ensureNetworkExists('cloud-ide-isolated', {
        Driver: 'bridge',
        Internal: true, // No external connectivity
        Labels: {
          [`${this.getLabelPrefix()}.managed`]: 'true',
          [`${this.getLabelPrefix()}.type`]: 'isolated',
        },
        IPAM: {
          Driver: 'default',
          Config: [{
            Subnet: '172.20.0.0/16',
            Gateway: '172.20.0.1',
          }],
        },
        Options: {
          'com.docker.network.bridge.enable_icc': 'false', // Disable inter-container communication
          'com.docker.network.bridge.enable_ip_masquerade': 'false', // Disable IP masquerading
          'com.docker.network.driver.mtu': '1500',
        },
      });
    } catch (error) {
      this.logger('error', 'Failed to ensure networks exist', { error });
      throw error;
    }
  }

  private async ensureNetworkExists(networkName: string, config: any): Promise<void> {
    try {
      const networks = await this.docker.listNetworks({
        filters: { name: [networkName] },
      });
      
      if (networks.length === 0) {
        this.logger('info', 'Creating Docker network', { networkName });
        
        await this.docker.createNetwork({
          Name: networkName,
          ...config,
        });
      }
    } catch (error) {
      this.logger('error', 'Failed to create network', { networkName, error });
      throw error;
    }
  }

  private async waitForContainerReady(containerId: string, timeoutMs = 30000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        const container = this.docker.getContainer(containerId);
        const containerInfo = await container.inspect();
        
        if (containerInfo.State.Running) {
          // Additional check: try to connect to the service
          // This would typically involve an HTTP check to port 8080
          return;
        }
      } catch {
        // Container not ready yet
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error(`Container ${containerId} failed to become ready within ${timeoutMs}ms`);
  }

  private getLastAccessedTime(container: ContainerInfo): Date {
    const lastAccessedLabel = container.labels[`${this.getLabelPrefix()}.last-accessed`];
    if (lastAccessedLabel) {
      return new Date(lastAccessedLabel);
    }
    return container.created;
  }

  private startCleanupInterval(): void {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveContainers().catch(error => {
        this.logger('error', 'Cleanup interval error', { error });
      });
    }, 5 * 60 * 1000);
  }
}

// Default configuration factory
export function createDefaultDockerConfig(): DockerServiceConfig {
  return {
    socketPath: process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock',
    defaultImage: process.env.CODE_SERVER_IMAGE || 'codercom/code-server:latest',
    networkName: process.env.DOCKER_NETWORK_NAME || 'cloud-ide-network',
    baseUrl: process.env.DOMAIN || 'localhost',
    sessionTimeoutMinutes: parseInt(process.env.SESSION_TIMEOUT_MINUTES || '60'),
    maxContainers: parseInt(process.env.MAX_CONTAINERS || '50'),
    defaultResources: {
      memory: process.env.DEFAULT_MEMORY_LIMIT || '2g',
      cpus: process.env.DEFAULT_CPU_LIMIT || '1.0',
    },
  };
}

// Singleton instance for the application
let dockerServiceInstance: DockerService | null = null;

export function getDockerService(): DockerService {
  if (!dockerServiceInstance) {
    const config = createDefaultDockerConfig();
    dockerServiceInstance = new DockerService(config);
  }
  return dockerServiceInstance;
}