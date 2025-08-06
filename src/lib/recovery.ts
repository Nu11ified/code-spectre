import { Logger, createLogger } from './logger';
import { AppError, ErrorCode, RetryHandler } from './errors';
import { monitoringService } from './monitoring';

/**
 * Recovery strategy types
 */
export enum RecoveryStrategy {
  RESTART = 'restart',
  RECREATE = 'recreate',
  FAILOVER = 'failover',
  CLEANUP = 'cleanup',
  MANUAL = 'manual',
}

/**
 * Recovery action interface
 */
export interface RecoveryAction {
  id: string;
  timestamp: Date;
  strategy: RecoveryStrategy;
  target: string; // Container ID, session ID, etc.
  reason: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  attempts: number;
  maxAttempts: number;
  metadata?: Record<string, any>;
  error?: string;
  completedAt?: Date;
}

/**
 * Recovery rule interface
 */
export interface RecoveryRule {
  id: string;
  name: string;
  condition: (error: AppError, context: any) => boolean;
  strategy: RecoveryStrategy;
  maxAttempts: number;
  delayMs: number;
  enabled: boolean;
  priority: number; // Higher priority rules are checked first
}

/**
 * Container failure recovery service
 */
export class RecoveryService {
  private logger: Logger;
  private retryHandler: RetryHandler;
  private recoveryActions: Map<string, RecoveryAction> = new Map();
  private recoveryRules: RecoveryRule[] = [];
  private recoveryInterval?: NodeJS.Timeout;

  constructor() {
    this.logger = createLogger('recovery');
    this.retryHandler = new RetryHandler(this.logger);
    this.initializeDefaultRecoveryRules();
  }

  /**
   * Start recovery service
   */
  start(): void {
    this.logger.info('Starting recovery service');
    
    // Check for pending recovery actions every 30 seconds
    this.recoveryInterval = setInterval(() => {
      this.processPendingRecoveries().catch(error => {
        this.logger.error('Failed to process pending recoveries', error);
      });
    }, 30000);
  }

  /**
   * Stop recovery service
   */
  stop(): void {
    this.logger.info('Stopping recovery service');
    
    if (this.recoveryInterval) {
      clearInterval(this.recoveryInterval);
      this.recoveryInterval = undefined;
    }
  }

  /**
   * Handle container failure and attempt recovery
   */
  async handleContainerFailure(
    containerId: string,
    error: AppError,
    context: {
      userId?: number;
      repositoryId?: number;
      branchName?: string;
      sessionId?: string;
    }
  ): Promise<RecoveryAction | null> {
    this.logger.error('Container failure detected', error, {
      containerId,
      ...context,
    });

    // Record error for monitoring
    monitoringService.recordError(error);

    // Find applicable recovery rule
    const rule = this.findApplicableRecoveryRule(error, { containerId, ...context });
    if (!rule) {
      this.logger.warn('No recovery rule found for container failure', {
        containerId,
        errorCode: error.code,
      });
      return null;
    }

    // Create recovery action
    const recoveryAction: RecoveryAction = {
      id: `recovery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      strategy: rule.strategy,
      target: containerId,
      reason: `Container failure: ${error.message}`,
      status: 'pending',
      attempts: 0,
      maxAttempts: rule.maxAttempts,
      metadata: {
        ruleId: rule.id,
        ruleName: rule.name,
        errorCode: error.code,
        ...context,
      },
    };

    this.recoveryActions.set(recoveryAction.id, recoveryAction);

    this.logger.info('Recovery action created', {
      recoveryId: recoveryAction.id,
      strategy: recoveryAction.strategy,
      target: recoveryAction.target,
      ruleId: rule.id,
    });

    // Execute recovery immediately if it's high priority
    if (rule.priority >= 8) {
      await this.executeRecoveryAction(recoveryAction.id);
    }

    return recoveryAction;
  }

  /**
   * Handle session failure and attempt recovery
   */
  async handleSessionFailure(
    sessionId: string,
    error: AppError,
    context: {
      userId: number;
      repositoryId: number;
      branchName: string;
      containerId?: string;
    }
  ): Promise<RecoveryAction | null> {
    this.logger.error('Session failure detected', error, {
      sessionId,
      ...context,
    });

    // Record error for monitoring
    monitoringService.recordError(error);

    // Find applicable recovery rule
    const rule = this.findApplicableRecoveryRule(error, { sessionId, ...context });
    if (!rule) {
      this.logger.warn('No recovery rule found for session failure', {
        sessionId,
        errorCode: error.code,
      });
      return null;
    }

    // Create recovery action
    const recoveryAction: RecoveryAction = {
      id: `recovery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      strategy: rule.strategy,
      target: sessionId,
      reason: `Session failure: ${error.message}`,
      status: 'pending',
      attempts: 0,
      maxAttempts: rule.maxAttempts,
      metadata: {
        ruleId: rule.id,
        ruleName: rule.name,
        errorCode: error.code,
        ...context,
      },
    };

    this.recoveryActions.set(recoveryAction.id, recoveryAction);

    this.logger.info('Recovery action created for session', {
      recoveryId: recoveryAction.id,
      strategy: recoveryAction.strategy,
      target: recoveryAction.target,
      sessionId,
    });

    // Execute recovery immediately for critical session failures
    if (rule.priority >= 7) {
      await this.executeRecoveryAction(recoveryAction.id);
    }

    return recoveryAction;
  }

  /**
   * Execute a specific recovery action
   */
  async executeRecoveryAction(recoveryId: string): Promise<boolean> {
    const action = this.recoveryActions.get(recoveryId);
    if (!action) {
      this.logger.error('Recovery action not found', { recoveryId });
      return false;
    }

    if (action.status === 'in_progress') {
      this.logger.warn('Recovery action already in progress', { recoveryId });
      return false;
    }

    if (action.attempts >= action.maxAttempts) {
      this.logger.error('Recovery action exceeded max attempts', {
        recoveryId,
        attempts: action.attempts,
        maxAttempts: action.maxAttempts,
      });
      action.status = 'failed';
      action.error = 'Maximum attempts exceeded';
      return false;
    }

    action.status = 'in_progress';
    action.attempts++;

    this.logger.info('Executing recovery action', {
      recoveryId,
      strategy: action.strategy,
      target: action.target,
      attempt: action.attempts,
    });

    try {
      const success = await this.executeRecoveryStrategy(action);
      
      if (success) {
        action.status = 'completed';
        action.completedAt = new Date();
        
        this.logger.info('Recovery action completed successfully', {
          recoveryId,
          strategy: action.strategy,
          target: action.target,
          attempts: action.attempts,
        });
        
        return true;
      } else {
        action.status = 'pending'; // Will retry later
        
        this.logger.warn('Recovery action failed, will retry', {
          recoveryId,
          strategy: action.strategy,
          target: action.target,
          attempts: action.attempts,
        });
        
        return false;
      }
    } catch (error) {
      action.status = 'failed';
      action.error = error instanceof Error ? error.message : String(error);
      
      this.logger.error('Recovery action failed with error', error, {
        recoveryId,
        strategy: action.strategy,
        target: action.target,
        attempts: action.attempts,
      });
      
      return false;
    }
  }

  /**
   * Get recovery action status
   */
  getRecoveryAction(recoveryId: string): RecoveryAction | null {
    return this.recoveryActions.get(recoveryId) || null;
  }

  /**
   * Get all recovery actions
   */
  getAllRecoveryActions(limit: number = 100): RecoveryAction[] {
    return Array.from(this.recoveryActions.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Get pending recovery actions
   */
  getPendingRecoveryActions(): RecoveryAction[] {
    return Array.from(this.recoveryActions.values())
      .filter(action => action.status === 'pending');
  }

  /**
   * Add custom recovery rule
   */
  addRecoveryRule(rule: RecoveryRule): void {
    this.recoveryRules.push(rule);
    this.recoveryRules.sort((a, b) => b.priority - a.priority); // Sort by priority
    
    this.logger.info('Recovery rule added', {
      ruleId: rule.id,
      name: rule.name,
      strategy: rule.strategy,
      priority: rule.priority,
    });
  }

  /**
   * Remove recovery rule
   */
  removeRecoveryRule(ruleId: string): void {
    const index = this.recoveryRules.findIndex(r => r.id === ruleId);
    if (index !== -1) {
      const rule = this.recoveryRules.splice(index, 1)[0];
      this.logger.info('Recovery rule removed', {
        ruleId,
        name: rule?.name,
      });
    }
  }

  // Private methods

  private async processPendingRecoveries(): Promise<void> {
    const pendingActions = this.getPendingRecoveryActions();
    
    if (pendingActions.length === 0) {
      return;
    }

    this.logger.debug('Processing pending recovery actions', {
      count: pendingActions.length,
    });

    // Process actions in parallel, but limit concurrency
    const concurrencyLimit = 3;
    const chunks = this.chunkArray(pendingActions, concurrencyLimit);

    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(action => this.executeRecoveryAction(action.id))
      );
    }
  }

  private findApplicableRecoveryRule(error: AppError, context: any): RecoveryRule | null {
    for (const rule of this.recoveryRules) {
      if (!rule.enabled) continue;

      try {
        if (rule.condition(error, context)) {
          return rule;
        }
      } catch (ruleError) {
        this.logger.error('Error evaluating recovery rule', ruleError, {
          ruleId: rule.id,
          ruleName: rule.name,
        });
      }
    }

    return null;
  }

  private async executeRecoveryStrategy(action: RecoveryAction): Promise<boolean> {
    switch (action.strategy) {
      case RecoveryStrategy.RESTART:
        return await this.executeRestartStrategy(action);
      
      case RecoveryStrategy.RECREATE:
        return await this.executeRecreateStrategy(action);
      
      case RecoveryStrategy.FAILOVER:
        return await this.executeFailoverStrategy(action);
      
      case RecoveryStrategy.CLEANUP:
        return await this.executeCleanupStrategy(action);
      
      case RecoveryStrategy.MANUAL:
        return await this.executeManualStrategy(action);
      
      default:
        this.logger.error('Unknown recovery strategy', {
          strategy: action.strategy,
          recoveryId: action.id,
        });
        return false;
    }
  }

  private async executeRestartStrategy(action: RecoveryAction): Promise<boolean> {
    this.logger.info('Executing restart recovery strategy', {
      recoveryId: action.id,
      target: action.target,
    });

    try {
      // This would integrate with Docker service to restart container
      // For now, simulate the operation
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // In real implementation:
      // const dockerService = getDockerService();
      // await dockerService.restartContainer(action.target);
      
      return true;
    } catch (error) {
      this.logger.error('Restart strategy failed', error, {
        recoveryId: action.id,
        target: action.target,
      });
      return false;
    }
  }

  private async executeRecreateStrategy(action: RecoveryAction): Promise<boolean> {
    this.logger.info('Executing recreate recovery strategy', {
      recoveryId: action.id,
      target: action.target,
    });

    try {
      // This would integrate with session manager to recreate the session
      // For now, simulate the operation
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // In real implementation:
      // const sessionManager = getSessionManager();
      // await sessionManager.recreateSession(action.metadata);
      
      return true;
    } catch (error) {
      this.logger.error('Recreate strategy failed', error, {
        recoveryId: action.id,
        target: action.target,
      });
      return false;
    }
  }

  private async executeFailoverStrategy(action: RecoveryAction): Promise<boolean> {
    this.logger.info('Executing failover recovery strategy', {
      recoveryId: action.id,
      target: action.target,
    });

    try {
      // This would implement failover to backup systems
      // For now, simulate the operation
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      return true;
    } catch (error) {
      this.logger.error('Failover strategy failed', error, {
        recoveryId: action.id,
        target: action.target,
      });
      return false;
    }
  }

  private async executeCleanupStrategy(action: RecoveryAction): Promise<boolean> {
    this.logger.info('Executing cleanup recovery strategy', {
      recoveryId: action.id,
      target: action.target,
    });

    try {
      // This would clean up failed resources
      // For now, simulate the operation
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // In real implementation:
      // - Remove failed containers
      // - Clean up temporary files
      // - Reset database states
      // - Clear caches
      
      return true;
    } catch (error) {
      this.logger.error('Cleanup strategy failed', error, {
        recoveryId: action.id,
        target: action.target,
      });
      return false;
    }
  }

  private async executeManualStrategy(action: RecoveryAction): Promise<boolean> {
    this.logger.info('Manual recovery strategy - requires human intervention', {
      recoveryId: action.id,
      target: action.target,
    });

    // Manual strategy just logs the issue and waits for human intervention
    // In production, this would trigger notifications to administrators
    
    return false; // Manual strategies don't auto-complete
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private initializeDefaultRecoveryRules(): void {
    const defaultRules: RecoveryRule[] = [
      {
        id: 'container-creation-failed-recreate',
        name: 'Container Creation Failed - Recreate',
        condition: (error) => error.code === ErrorCode.CONTAINER_CREATION_FAILED,
        strategy: RecoveryStrategy.RECREATE,
        maxAttempts: 3,
        delayMs: 5000,
        enabled: true,
        priority: 8,
      },
      {
        id: 'container-start-failed-restart',
        name: 'Container Start Failed - Restart',
        condition: (error) => error.code === ErrorCode.CONTAINER_START_FAILED,
        strategy: RecoveryStrategy.RESTART,
        maxAttempts: 2,
        delayMs: 3000,
        enabled: true,
        priority: 7,
      },
      {
        id: 'docker-connection-failed-cleanup',
        name: 'Docker Connection Failed - Cleanup',
        condition: (error) => error.code === ErrorCode.DOCKER_CONNECTION_FAILED,
        strategy: RecoveryStrategy.CLEANUP,
        maxAttempts: 1,
        delayMs: 1000,
        enabled: true,
        priority: 9,
      },
      {
        id: 'resource-limit-exceeded-cleanup',
        name: 'Resource Limit Exceeded - Cleanup',
        condition: (error) => error.code === ErrorCode.RESOURCE_LIMIT_EXCEEDED,
        strategy: RecoveryStrategy.CLEANUP,
        maxAttempts: 1,
        delayMs: 2000,
        enabled: true,
        priority: 6,
      },
      {
        id: 'git-operation-failed-retry',
        name: 'Git Operation Failed - Recreate',
        condition: (error) => [
          ErrorCode.GIT_CLONE_FAILED,
          ErrorCode.GIT_WORKTREE_CREATION_FAILED,
          ErrorCode.GIT_OPERATION_FAILED,
        ].includes(error.code),
        strategy: RecoveryStrategy.RECREATE,
        maxAttempts: 2,
        delayMs: 3000,
        enabled: true,
        priority: 5,
      },
      {
        id: 'security-violation-manual',
        name: 'Security Violation - Manual Review',
        condition: (error) => error.code === ErrorCode.SECURITY_VIOLATION,
        strategy: RecoveryStrategy.MANUAL,
        maxAttempts: 1,
        delayMs: 0,
        enabled: true,
        priority: 10,
      },
      {
        id: 'system-overloaded-cleanup',
        name: 'System Overloaded - Cleanup',
        condition: (error) => error.code === ErrorCode.SYSTEM_OVERLOADED,
        strategy: RecoveryStrategy.CLEANUP,
        maxAttempts: 1,
        delayMs: 5000,
        enabled: true,
        priority: 8,
      },
    ];

    this.recoveryRules = defaultRules.sort((a, b) => b.priority - a.priority);
    
    this.logger.info('Default recovery rules initialized', {
      ruleCount: defaultRules.length,
    });
  }
}

/**
 * Global recovery service instance
 */
export const recoveryService = new RecoveryService();

/**
 * Utility function to handle errors with automatic recovery
 */
export async function handleErrorWithRecovery<T>(
  operation: () => Promise<T>,
  context: {
    containerId?: string;
    sessionId?: string;
    userId?: number;
    repositoryId?: number;
    branchName?: string;
  },
  options: {
    enableRecovery?: boolean;
    maxRetries?: number;
  } = {}
): Promise<T> {
  const { enableRecovery = true, maxRetries = 3 } = options;
  
  try {
    return await operation();
  } catch (error) {
    const appError = error instanceof AppError ? error : new AppError(
      ErrorCode.OPERATION_FAILED,
      error instanceof Error ? error.message : String(error),
      500,
      true,
      { originalError: error }
    );

    // Attempt recovery if enabled
    if (enableRecovery) {
      if (context.containerId) {
        await recoveryService.handleContainerFailure(context.containerId, appError, context);
      } else if (context.sessionId && context.userId && context.repositoryId && context.branchName) {
        await recoveryService.handleSessionFailure(context.sessionId, appError, {
          userId: context.userId,
          repositoryId: context.repositoryId,
          branchName: context.branchName,
          containerId: context.containerId,
        });
      }
    }

    throw appError;
  }
}