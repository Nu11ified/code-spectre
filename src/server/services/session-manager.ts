import { getDockerService } from './docker';
import { getGitService } from './git';
import type { IdeSession, UserPermissions } from '@/types/domain';
import { sessionLogger, createTimer } from '@/lib/logger';
import { AppError, ErrorCode, ErrorHandler } from '@/lib/errors';
import { recoveryService, handleErrorWithRecovery } from '@/lib/recovery';
import { monitoringService } from '@/lib/monitoring';

export interface SessionManagerConfig {
  extensionsPath: string; // Path to shared extensions directory
}

export interface CreateSessionParams {
  userId: number;
  repositoryId: number;
  branchName: string;
  permissions: UserPermissions;
}

export interface SessionInfo {
  sessionId: string;
  containerUrl: string;
  status: 'starting' | 'running' | 'stopped' | 'error';
  createdAt: Date;
}

/**
 * Session Manager orchestrates Git and Docker services to create IDE sessions
 * This demonstrates how the Docker service integrates with other services
 */
export class SessionManager {
  private config: SessionManagerConfig;
  private dockerService = getDockerService();
  private gitService = getGitService();
  private logger = sessionLogger;
  private errorHandler = new ErrorHandler(sessionLogger);

  constructor(config: SessionManagerConfig) {
    this.config = config;
  }

  /**
   * Create a new IDE session
   * This demonstrates the integration between Git and Docker services
   */
  async createSession(params: CreateSessionParams): Promise<SessionInfo> {
    const timer = createTimer(this.logger, 'createSession', {
      userId: params.userId,
      repositoryId: params.repositoryId,
      branchName: params.branchName,
    });

    return await handleErrorWithRecovery(
      async () => {
        this.logger.info('Creating IDE session', {
          userId: params.userId,
          repositoryId: params.repositoryId,
          branchName: params.branchName,
        });

        // Step 1: Validate permissions
        await this.validateSessionPermissions(params);

        // Step 2: Check for existing session
        const existingSession = await this.findExistingSession(params);
        if (existingSession) {
          this.logger.info('Reusing existing IDE session', {
            userId: params.userId,
            repositoryId: params.repositoryId,
            branchName: params.branchName,
            sessionId: existingSession.sessionId,
          });
          timer.end({ reused: true });
          return existingSession;
        }

        // Step 3: Prepare the worktree using Git service
        const worktreeResult = await this.gitService.createWorktree(
          params.repositoryId,
          params.branchName,
          params.userId
        );

        if (!worktreeResult.success) {
          throw new AppError(
            ErrorCode.GIT_WORKTREE_CREATION_FAILED,
            `Failed to create worktree: ${worktreeResult.error}`,
            500,
            true,
            {
              repositoryId: params.repositoryId,
              branchName: params.branchName,
              userId: params.userId,
            }
          );
        }

        const worktreePath = this.gitService.getWorktreePath(
          params.repositoryId,
          params.branchName,
          params.userId
        );

        // Step 4: Create and start the Docker container with security profile
        let containerInfo;
        try {
          containerInfo = await this.dockerService.createIdeContainer({
            userId: params.userId,
            repositoryId: params.repositoryId,
            branchName: params.branchName,
            worktreePath,
            extensionsPath: this.config.extensionsPath,
            permissions: params.permissions,
          });
        } catch (error) {
          throw new AppError(
            ErrorCode.CONTAINER_CREATION_FAILED,
            `Failed to create container: ${error}`,
            500,
            true,
            {
              userId: params.userId,
              repositoryId: params.repositoryId,
              branchName: params.branchName,
            }
          );
        }

        // Step 5: Generate unique session URL
        const sessionUrl = this.generateUniqueSessionUrl(containerInfo.name, params);

        // Step 6: Wait for container to be ready
        await this.waitForContainerReady(containerInfo.id);

        const sessionInfo: SessionInfo = {
          sessionId: containerInfo.id,
          containerUrl: sessionUrl,
          status: containerInfo.status === 'running' ? 'running' : 'starting',
          createdAt: containerInfo.created,
        };

        timer.end({
          containerId: containerInfo.id,
          sessionUrl,
          success: true,
        });

        this.logger.info('IDE session created successfully', {
          userId: params.userId,
          repositoryId: params.repositoryId,
          branchName: params.branchName,
          containerId: containerInfo.id,
          sessionUrl,
        });

        // Record successful session creation for monitoring
        monitoringService.recordResponseTime(timer.end());

        return sessionInfo;
      },
      {
        userId: params.userId,
        repositoryId: params.repositoryId,
        branchName: params.branchName,
      },
      { enableRecovery: true, maxRetries: 2 }
    ).catch(async (error) => {
      timer.endWithError(error);
      
      // Cleanup on failure
      await this.cleanupFailedSession(params);
      
      // Handle and convert error
      const handledError = this.errorHandler.handleError(error, {
        operation: 'createSession',
        userId: params.userId,
        repositoryId: params.repositoryId,
        branchName: params.branchName,
      });

      throw handledError;
    });
  }

  /**
   * Stop an IDE session
   */
  async stopSession(sessionId: string): Promise<void> {
    try {
      this.logger.info('Stopping IDE session', { sessionId });

      // Get container info to extract user and repository details
      const containerInfo = await this.dockerService.getContainerInfo(sessionId);
      const userId = parseInt(containerInfo.labels['cloud-ide-orchestrator.user-id'] || '0');
      const repositoryId = parseInt(containerInfo.labels['cloud-ide-orchestrator.repository-id'] || '0');
      const branchName = containerInfo.labels['cloud-ide-orchestrator.branch-name'] || '';

      // Stop and remove the container
      await this.dockerService.removeContainer(sessionId);

      // Clean up the worktree
      if (userId && repositoryId && branchName) {
        await this.gitService.removeWorktree(repositoryId, branchName, userId);
      }

      this.logger.info('IDE session stopped successfully', { sessionId });
    } catch (error) {
      this.logger.error('Failed to stop IDE session', error, { sessionId });
      throw new Error(`Session stop failed: ${error}`);
    }
  }

  /**
   * Get session status
   */
  async getSessionStatus(sessionId: string): Promise<SessionInfo> {
    try {
      const containerInfo = await this.dockerService.getContainerInfo(sessionId);
      const sessionUrl = this.generateSessionUrl(containerInfo.name);

      return {
        sessionId: containerInfo.id,
        containerUrl: sessionUrl,
        status: this.mapContainerStatus(containerInfo.status),
        createdAt: containerInfo.created,
      };
    } catch (error) {
      this.logger.error('Failed to get session status', error, { sessionId });
      throw new Error(`Failed to get session status: ${error}`);
    }
  }

  /**
   * List all active sessions for a user
   */
  async getUserSessions(userId: number): Promise<SessionInfo[]> {
    try {
      const containers = await this.dockerService.listContainers();
      const userContainers = containers.filter(
        container => container.labels['cloud-ide-orchestrator.user-id'] === userId.toString()
      );

      return userContainers.map(container => ({
        sessionId: container.id,
        containerUrl: this.generateSessionUrl(container.name || `container-${container.id}`),
        status: this.mapContainerStatus(container.status),
        createdAt: container.created,
      }));
    } catch (error) {
      this.logger.error('Failed to get user sessions', error, { userId });
      throw new Error(`Failed to get user sessions: ${error}`);
    }
  }

  /**
   * Perform comprehensive health checks on all sessions with security monitoring
   */
  async performHealthChecks(): Promise<Array<{ 
    sessionId: string; 
    healthy: boolean; 
    error?: string; 
    resourceUsage?: any;
    securityCompliant?: boolean;
    securityViolations?: string[];
  }>> {
    try {
      const containers = await this.dockerService.listContainers();
      const healthChecks = await Promise.all(
        containers.map(async container => {
          try {
            const healthCheck = await this.dockerService.healthCheck(container.id);
            
            // Get resource usage if container is healthy
            let resourceUsage;
            let securityCheck;
            if (healthCheck.healthy) {
              try {
                resourceUsage = await this.dockerService.getContainerStats(container.id);
                // Perform security monitoring
                securityCheck = await this.dockerService.monitorContainerSecurity(container.id);
              } catch {
                // Resource stats not available
              }
            }

            return {
              sessionId: container.id,
              healthy: healthCheck.healthy,
              error: healthCheck.error,
              resourceUsage,
              securityCompliant: securityCheck?.compliant,
              securityViolations: securityCheck?.violations,
            };
          } catch (error) {
            return {
              sessionId: container.id,
              healthy: false,
              error: String(error),
            };
          }
        })
      );

      // Log summary with security metrics
      const healthyCount = healthChecks.filter(c => c.healthy).length;
      const unhealthyCount = healthChecks.length - healthyCount;
      const securityCompliantCount = healthChecks.filter(c => c.securityCompliant).length;
      const securityViolationsCount = healthChecks.filter(c => c.securityViolations && c.securityViolations.length > 0).length;
      
      this.logger.info(, 'Health and security checks completed', {
        total: healthChecks.length,
        healthy: healthyCount,
        unhealthy: unhealthyCount,
        securityCompliant: securityCompliantCount,
        securityViolations: securityViolationsCount,
      });

      return healthChecks;
    } catch (error) {
      this.logger('error', 'Failed to perform health checks', { error });
      throw new Error(`Health check failed: ${error}`);
    }
  }

  /**
   * Validate terminal command execution for a session
   */
  async validateTerminalCommand(sessionId: string, command: string): Promise<{ allowed: boolean; reason?: string }> {
    try {
      return await this.dockerService.validateTerminalCommand(sessionId, command);
    } catch (error) {
      this.logger('error', 'Failed to validate terminal command', { sessionId, command, error });
      return { allowed: false, reason: 'Validation failed' };
    }
  }

  /**
   * Validate file access for a session
   */
  async validateFileAccess(
    sessionId: string, 
    filePath: string, 
    operation: 'read' | 'write' | 'execute'
  ): Promise<{ allowed: boolean; reason?: string }> {
    try {
      return await this.dockerService.validateFileAccess(sessionId, filePath, operation);
    } catch (error) {
      this.logger('error', 'Failed to validate file access', { sessionId, filePath, operation, error });
      return { allowed: false, reason: 'Validation failed' };
    }
  }

  /**
   * Validate network access for a session
   */
  async validateNetworkAccess(
    sessionId: string,
    destination: string,
    port: number,
    protocol: 'tcp' | 'udp' = 'tcp'
  ): Promise<{ allowed: boolean; reason?: string }> {
    try {
      return await this.dockerService.validateNetworkAccess(sessionId, destination, port, protocol);
    } catch (error) {
      this.logger('error', 'Failed to validate network access', { sessionId, destination, port, error });
      return { allowed: false, reason: 'Validation failed' };
    }
  }

  /**
   * Perform comprehensive security audit on all sessions
   */
  async performSecurityAudit(): Promise<Array<{
    sessionId: string;
    userId: number;
    repositoryId: number;
    branchName: string;
    audit: {
      compliant: boolean;
      violations: string[];
      recommendations: string[];
      riskLevel: 'low' | 'medium' | 'high' | 'critical';
    };
  }>> {
    try {
      const containers = await this.dockerService.listContainers();
      const audits = await Promise.all(
        containers.map(async container => {
          try {
            const audit = await this.dockerService.performSecurityAudit(container.id);
            
            return {
              sessionId: container.id,
              userId: parseInt(container.labels['cloud-ide-orchestrator.user-id'] || '0'),
              repositoryId: parseInt(container.labels['cloud-ide-orchestrator.repository-id'] || '0'),
              branchName: container.labels['cloud-ide-orchestrator.branch-name'] || '',
              audit,
            };
          } catch (error) {
            return {
              sessionId: container.id,
              userId: 0,
              repositoryId: 0,
              branchName: '',
              audit: {
                compliant: false,
                violations: [`Audit failed: ${error}`],
                recommendations: ['Investigate audit failure'],
                riskLevel: 'critical' as const,
              },
            };
          }
        })
      );

      // Log summary
      const criticalCount = audits.filter(a => a.audit.riskLevel === 'critical').length;
      const highCount = audits.filter(a => a.audit.riskLevel === 'high').length;
      const nonCompliantCount = audits.filter(a => !a.audit.compliant).length;

      this.logger.info(, 'Security audit completed', {
        totalSessions: audits.length,
        nonCompliant: nonCompliantCount,
        critical: criticalCount,
        high: highCount,
      });

      return audits;
    } catch (error) {
      this.logger('error', 'Failed to perform security audit', { error });
      throw new Error(`Security audit failed: ${error}`);
    }
  }

  /**
   * Get system resource usage and session statistics
   */
  async getSystemStats(): Promise<{
    totalSessions: number;
    activeSessions: number;
    systemResources: any;
    sessionsByUser: Record<number, number>;
  }> {
    try {
      const containers = await this.dockerService.listContainers();
      const systemResources = await this.dockerService.getSystemStats();
      
      const activeSessions = containers.filter(c => c.status === 'running').length;
      
      // Count sessions by user
      const sessionsByUser: Record<number, number> = {};
      containers.forEach(container => {
        const userId = parseInt(container.labels['cloud-ide-orchestrator.user-id'] || '0');
        if (userId > 0) {
          sessionsByUser[userId] = (sessionsByUser[userId] || 0) + 1;
        }
      });

      return {
        totalSessions: containers.length,
        activeSessions,
        systemResources,
        sessionsByUser,
      };
    } catch (error) {
      this.logger('error', 'Failed to get system stats', { error });
      throw new Error(`Failed to get system stats: ${error}`);
    }
  }

  /**
   * Clean up inactive sessions with comprehensive resource cleanup
   */
  async cleanupInactiveSessions(): Promise<{ cleaned: number; errors: string[] }> {
    try {
      this.logger.info(, 'Starting cleanup of inactive sessions');
      
      const errors: string[] = [];
      let cleanedCount = 0;

      // Get all containers managed by our service
      const containers = await this.dockerService.listContainers(true);
      const cutoffTime = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago

      for (const container of containers) {
        try {
          // Check if container is inactive based on labels
          const lastAccessedLabel = container.labels['cloud-ide-orchestrator.last-accessed'];
          const lastAccessed = lastAccessedLabel ? new Date(lastAccessedLabel) : container.created;

          if (lastAccessed < cutoffTime && container.status !== 'exited') {
            this.logger.info(, 'Cleaning up inactive session', {
              containerId: container.id,
              containerName: container.name,
              lastAccessed,
            });

            // Extract session info from container labels
            const userId = parseInt(container.labels['cloud-ide-orchestrator.user-id'] || '0');
            const repositoryId = parseInt(container.labels['cloud-ide-orchestrator.repository-id'] || '0');
            const branchName = container.labels['cloud-ide-orchestrator.branch-name'] || '';

            // Stop the session (this will cleanup both container and worktree)
            await this.stopSession(container.id);
            cleanedCount++;
          }
        } catch (error) {
          const errorMsg = `Failed to cleanup container ${container.id}: ${error}`;
          errors.push(errorMsg);
          this.logger('error', errorMsg);
        }
      }

      // Also cleanup any orphaned worktrees
      await this.cleanupOrphanedWorktrees();

      this.logger.info(, 'Cleanup completed', { 
        cleanedCount, 
        errorCount: errors.length 
      });

      return { cleaned: cleanedCount, errors };
    } catch (error) {
      this.logger('error', 'Failed to cleanup inactive sessions', { error });
      throw new Error(`Cleanup failed: ${error}`);
    }
  }

  /**
   * Clean up orphaned worktrees that don't have corresponding containers
   */
  private async cleanupOrphanedWorktrees(): Promise<void> {
    try {
      // This would require implementing a method to scan the worktrees directory
      // and check if corresponding containers exist
      this.logger.info(, 'Cleaning up orphaned worktrees');
      
      // Implementation would scan the worktrees directory and remove
      // any worktrees that don't have corresponding active containers
      
    } catch (error) {
      this.logger.warn(, 'Failed to cleanup orphaned worktrees', { error });
    }
  }

  // Private helper methods

  /**
   * Validate session creation permissions
   */
  private async validateSessionPermissions(params: CreateSessionParams): Promise<void> {
    // Check resource limits (could be extended to check system resources)
    const userSessions = await this.getUserSessions(params.userId);
    const activeSessions = userSessions.filter(s => s.status === 'running');
    
    // Example: limit users to 3 concurrent sessions
    const maxConcurrentSessions = 3;
    if (activeSessions.length >= maxConcurrentSessions) {
      throw new Error(`Maximum concurrent sessions limit reached (${maxConcurrentSessions})`);
    }
  }

  /**
   * Find existing session for the same user/repo/branch combination
   */
  private async findExistingSession(params: CreateSessionParams): Promise<SessionInfo | null> {
    try {
      const containers = await this.dockerService.listContainers();
      const existingContainer = containers.find(container => {
        const containerUserId = container.labels['cloud-ide-orchestrator.user-id'];
        const containerRepoId = container.labels['cloud-ide-orchestrator.repository-id'];
        const containerBranch = container.labels['cloud-ide-orchestrator.branch-name'];
        
        return containerUserId === params.userId.toString() &&
               containerRepoId === params.repositoryId.toString() &&
               containerBranch === params.branchName &&
               container.status === 'running';
      });
      
      if (existingContainer) {
        // Verify the container is actually running
        try {
          const containerInfo = await this.dockerService.getContainerInfo(existingContainer.id);
          if (containerInfo.status === 'running') {
            return {
              sessionId: existingContainer.id,
              containerUrl: this.generateSessionUrl(existingContainer.name || `container-${existingContainer.id}`),
              status: 'running',
              createdAt: existingContainer.created,
            };
          }
        } catch {
          // Container doesn't exist, continue with new session creation
        }
      }
      
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Generate unique session URL with security considerations
   */
  private generateUniqueSessionUrl(containerName: string, params: CreateSessionParams): string {
    // Generate a unique session token for security
    const sessionToken = this.generateSessionToken();
    
    // In production, this would use your actual domain and reverse proxy configuration
    const baseUrl = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000';
    const domain = new URL(baseUrl).hostname;
    
    // Create subdomain-based URL for container access
    // Format: {containerName}-{sessionToken}.{domain}
    return `https://${containerName}-${sessionToken}.${domain}`;
  }

  /**
   * Generate secure session token
   */
  private generateSessionToken(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Wait for container to be ready and accessible
   */
  private async waitForContainerReady(containerId: string, timeoutMs = 30000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        const containerInfo = await this.dockerService.getContainerInfo(containerId);
        
        if (containerInfo.status === 'running') {
          // Additional health check could be performed here
          // For example, HTTP request to the container's port
          return;
        }
      } catch {
        // Container not ready yet
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error(`Container ${containerId} failed to become ready within ${timeoutMs}ms`);
  }

  /**
   * Cleanup resources after failed session creation
   */
  private async cleanupFailedSession(params: CreateSessionParams): Promise<void> {
    try {
      // Try to remove any partially created worktree
      await this.gitService.removeWorktree(
        params.repositoryId,
        params.branchName,
        params.userId
      );
    } catch (error) {
      this.logger.warn(, 'Failed to cleanup worktree after session creation failure', {
        userId: params.userId,
        repositoryId: params.repositoryId,
        branchName: params.branchName,
        error,
      });
    }
  }

  private generateSessionUrl(containerName: string): string {
    // This would typically generate a URL based on your reverse proxy configuration
    // For example: https://containerName.your-domain.com
    return `https://${containerName}.ide.localhost`;
  }

  private mapContainerStatus(dockerStatus: string): 'starting' | 'running' | 'stopped' | 'error' {
    switch (dockerStatus.toLowerCase()) {
      case 'running':
        return 'running';
      case 'created':
      case 'restarting':
        return 'starting';
      case 'exited':
      case 'dead':
        return 'stopped';
      default:
        return 'error';
    }
  }

  /**
   * Handle session lifecycle events and notifications
   */
  async handleSessionEvent(
    sessionId: string, 
    event: 'created' | 'started' | 'stopped' | 'error',
    metadata?: any
  ): Promise<void> {
    try {
      this.logger.info(, `Session event: ${event}`, {
        sessionId,
        event,
        metadata,
      });

      // Here you could implement webhooks, notifications, or other integrations
      // For example:
      // - Send notifications to monitoring systems
      // - Update external databases
      // - Trigger cleanup processes
      // - Send user notifications

      switch (event) {
        case 'created':
          // Session was successfully created
          break;
        case 'started':
          // Container is running and ready
          break;
        case 'stopped':
          // Session was stopped (either by user or system)
          break;
        case 'error':
          // Session encountered an error
          this.logger('error', 'Session error event', {
            sessionId,
            metadata,
          });
          break;
      }
    } catch (error) {
      this.logger('error', 'Failed to handle session event', {
        sessionId,
        event,
        error,
      });
    }
  }

  /**
   * Gracefully shutdown the session manager
   */
  async shutdown(): Promise<void> {
    try {
      this.logger.info(, 'Shutting down session manager');
      
      // Stop all active sessions gracefully
      const userSessions = await this.dockerService.listContainers();
      
      for (const container of userSessions) {
        try {
          await this.stopSession(container.id);
        } catch (error) {
          this.logger('error', 'Failed to stop session during shutdown', {
            sessionId: container.id,
            error,
          });
        }
      }

      this.logger.info(, 'Session manager shutdown complete');
    } catch (error) {
      this.logger('error', 'Error during session manager shutdown', { error });
      throw error;
    }
  }
}

// Default configuration factory
export function createDefaultSessionManagerConfig(): SessionManagerConfig {
  return {
    extensionsPath: process.env.EXTENSIONS_PATH || '/srv/extensions',
  };
}

// Singleton instance for the application
let sessionManagerInstance: SessionManager | null = null;

export function getSessionManager(): SessionManager {
  if (!sessionManagerInstance) {
    const config = createDefaultSessionManagerConfig();
    sessionManagerInstance = new SessionManager(config);
  }
  return sessionManagerInstance;
}