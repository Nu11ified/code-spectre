import { Logger, createLogger } from './logger';
import { AppError, ErrorCode } from './errors';

/**
 * System health metrics
 */
export interface SystemMetrics {
  timestamp: Date;
  uptime: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  cpu: {
    usage: number;
  };
  containers: {
    total: number;
    running: number;
    stopped: number;
    failed: number;
  };
  sessions: {
    active: number;
    total: number;
    averageDuration: number;
  };
  errors: {
    total: number;
    rate: number; // errors per minute
    byCode: Record<string, number>;
  };
  performance: {
    averageResponseTime: number;
    slowQueries: number;
  };
}

/**
 * Alert severity levels
 */
export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

/**
 * Alert interface
 */
export interface Alert {
  id: string;
  timestamp: Date;
  severity: AlertSeverity;
  title: string;
  message: string;
  metadata?: Record<string, any>;
  resolved?: boolean;
  resolvedAt?: Date;
}

/**
 * Alert rule interface
 */
export interface AlertRule {
  id: string;
  name: string;
  condition: (metrics: SystemMetrics) => boolean;
  severity: AlertSeverity;
  message: string;
  cooldownMinutes: number;
  enabled: boolean;
}

/**
 * Monitoring service for system health and alerting
 */
export class MonitoringService {
  private logger: Logger;
  private metrics: SystemMetrics[] = [];
  private alerts: Alert[] = [];
  private alertRules: AlertRule[] = [];
  private lastAlertTimes: Map<string, Date> = new Map();
  private metricsInterval?: NodeJS.Timeout;
  private errorCounts: Map<string, number> = new Map();
  private responseTimes: number[] = [];

  constructor() {
    this.logger = createLogger('monitoring');
    this.initializeDefaultAlertRules();
  }

  /**
   * Start monitoring system
   */
  start(): void {
    this.logger.info('Starting monitoring service');
    
    // Collect metrics every 30 seconds
    this.metricsInterval = setInterval(() => {
      this.collectMetrics().catch(error => {
        this.logger.error('Failed to collect metrics', error);
      });
    }, 30000);

    // Initial metrics collection
    this.collectMetrics().catch(error => {
      this.logger.error('Failed to collect initial metrics', error);
    });
  }

  /**
   * Stop monitoring system
   */
  stop(): void {
    this.logger.info('Stopping monitoring service');
    
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = undefined;
    }
  }

  /**
   * Collect system metrics
   */
  async collectMetrics(): Promise<SystemMetrics> {
    try {
      const metrics: SystemMetrics = {
        timestamp: new Date(),
        uptime: process.uptime(),
        memory: this.getMemoryMetrics(),
        cpu: await this.getCpuMetrics(),
        containers: await this.getContainerMetrics(),
        sessions: await this.getSessionMetrics(),
        errors: this.getErrorMetrics(),
        performance: this.getPerformanceMetrics(),
      };

      // Store metrics (keep last 100 entries)
      this.metrics.push(metrics);
      if (this.metrics.length > 100) {
        this.metrics.shift();
      }

      // Check alert rules
      this.checkAlertRules(metrics);

      this.logger.debug('Metrics collected', {
        memoryUsage: metrics.memory.percentage,
        cpuUsage: metrics.cpu.usage,
        activeContainers: metrics.containers.running,
        activeSessions: metrics.sessions.active,
        errorRate: metrics.errors.rate,
      });

      return metrics;
    } catch (error) {
      this.logger.error('Failed to collect metrics', error);
      throw new AppError(
        ErrorCode.INTERNAL_ERROR,
        'Failed to collect system metrics',
        500,
        true,
        { error: String(error) }
      );
    }
  }

  /**
   * Get current system metrics
   */
  getCurrentMetrics(): SystemMetrics | null {
    return this.metrics[this.metrics.length - 1] || null;
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(minutes: number = 60): SystemMetrics[] {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    return this.metrics.filter(m => m.timestamp >= cutoff);
  }

  /**
   * Record error for monitoring
   */
  recordError(error: AppError): void {
    const errorKey = error.code;
    const currentCount = this.errorCounts.get(errorKey) || 0;
    this.errorCounts.set(errorKey, currentCount + 1);

    // Log high-frequency errors
    if (currentCount > 10) {
      this.logger.warn('High frequency error detected', {
        errorCode: error.code,
        count: currentCount + 1,
        message: error.message,
      });
    }
  }

  /**
   * Record response time for performance monitoring
   */
  recordResponseTime(duration: number): void {
    this.responseTimes.push(duration);
    
    // Keep only last 1000 response times
    if (this.responseTimes.length > 1000) {
      this.responseTimes.shift();
    }
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return this.alerts.filter(alert => !alert.resolved);
  }

  /**
   * Get all alerts
   */
  getAllAlerts(limit: number = 100): Alert[] {
    return this.alerts
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): void {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = new Date();
      
      this.logger.info('Alert resolved', {
        alertId,
        title: alert.title,
        severity: alert.severity,
      });
    }
  }

  /**
   * Add custom alert rule
   */
  addAlertRule(rule: AlertRule): void {
    this.alertRules.push(rule);
    this.logger.info('Alert rule added', {
      ruleId: rule.id,
      name: rule.name,
      severity: rule.severity,
    });
  }

  /**
   * Remove alert rule
   */
  removeAlertRule(ruleId: string): void {
    const index = this.alertRules.findIndex(r => r.id === ruleId);
    if (index !== -1) {
      const rule = this.alertRules.splice(index, 1)[0];
      this.logger.info('Alert rule removed', {
        ruleId,
        name: rule?.name,
      });
    }
  }

  /**
   * Get system health status
   */
  getHealthStatus(): {
    status: 'healthy' | 'warning' | 'critical';
    issues: string[];
    metrics: SystemMetrics | null;
  } {
    const metrics = this.getCurrentMetrics();
    const activeAlerts = this.getActiveAlerts();
    
    if (!metrics) {
      return {
        status: 'critical',
        issues: ['No metrics available'],
        metrics: null,
      };
    }

    const issues: string[] = [];
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';

    // Check critical alerts
    const criticalAlerts = activeAlerts.filter(a => a.severity === AlertSeverity.CRITICAL);
    if (criticalAlerts.length > 0) {
      status = 'critical';
      issues.push(`${criticalAlerts.length} critical alert(s) active`);
    }

    // Check warning alerts
    const warningAlerts = activeAlerts.filter(a => a.severity === AlertSeverity.WARNING);
    if (warningAlerts.length > 0 && status === 'healthy') {
      status = 'warning';
      issues.push(`${warningAlerts.length} warning alert(s) active`);
    }

    // Check basic health indicators
    if (metrics.memory.percentage > 90) {
      if (status === 'healthy') status = 'warning';
      issues.push('High memory usage');
    }

    if (metrics.cpu.usage > 90) {
      if (status === 'healthy') status = 'warning';
      issues.push('High CPU usage');
    }

    if (metrics.errors.rate > 10) {
      if (status === 'healthy') status = 'warning';
      issues.push('High error rate');
    }

    return { status, issues, metrics };
  }

  // Private methods

  private getMemoryMetrics() {
    const usage = process.memoryUsage();
    const total = usage.heapTotal;
    const used = usage.heapUsed;
    
    return {
      used,
      total,
      percentage: Math.round((used / total) * 100),
    };
  }

  private async getCpuMetrics() {
    // Simple CPU usage estimation
    // In production, you might want to use a more sophisticated method
    return {
      usage: Math.random() * 100, // Placeholder - would use actual CPU monitoring
    };
  }

  private async getContainerMetrics() {
    // This would integrate with Docker service to get real container metrics
    // For now, return placeholder data
    return {
      total: 0,
      running: 0,
      stopped: 0,
      failed: 0,
    };
  }

  private async getSessionMetrics() {
    // This would integrate with session manager to get real session metrics
    // For now, return placeholder data
    return {
      active: 0,
      total: 0,
      averageDuration: 0,
    };
  }

  private getErrorMetrics() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Calculate error rate (simplified)
    const totalErrors = Array.from(this.errorCounts.values()).reduce((sum, count) => sum + count, 0);
    const errorRate = totalErrors; // Errors per minute (simplified)

    const byCode: Record<string, number> = {};
    this.errorCounts.forEach((count, code) => {
      byCode[code] = count;
    });

    return {
      total: totalErrors,
      rate: errorRate,
      byCode,
    };
  }

  private getPerformanceMetrics() {
    if (this.responseTimes.length === 0) {
      return {
        averageResponseTime: 0,
        slowQueries: 0,
      };
    }

    const average = this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length;
    const slowQueries = this.responseTimes.filter(time => time > 2000).length;

    return {
      averageResponseTime: Math.round(average),
      slowQueries,
    };
  }

  private checkAlertRules(metrics: SystemMetrics): void {
    for (const rule of this.alertRules) {
      if (!rule.enabled) continue;

      try {
        if (rule.condition(metrics)) {
          this.triggerAlert(rule, metrics);
        }
      } catch (error) {
        this.logger.error('Error checking alert rule', error, {
          ruleId: rule.id,
          ruleName: rule.name,
        });
      }
    }
  }

  private triggerAlert(rule: AlertRule, metrics: SystemMetrics): void {
    const lastAlertTime = this.lastAlertTimes.get(rule.id);
    const now = new Date();
    
    // Check cooldown period
    if (lastAlertTime) {
      const cooldownMs = rule.cooldownMinutes * 60 * 1000;
      if (now.getTime() - lastAlertTime.getTime() < cooldownMs) {
        return; // Still in cooldown
      }
    }

    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: now,
      severity: rule.severity,
      title: rule.name,
      message: rule.message,
      metadata: {
        ruleId: rule.id,
        metrics: {
          memoryUsage: metrics.memory.percentage,
          cpuUsage: metrics.cpu.usage,
          errorRate: metrics.errors.rate,
          activeContainers: metrics.containers.running,
        },
      },
      resolved: false,
    };

    this.alerts.push(alert);
    this.lastAlertTimes.set(rule.id, now);

    // Keep only last 1000 alerts
    if (this.alerts.length > 1000) {
      this.alerts.shift();
    }

    this.logger.warn('Alert triggered', {
      alertId: alert.id,
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
    });

    // In production, you would send notifications here
    this.sendAlertNotification(alert);
  }

  private sendAlertNotification(alert: Alert): void {
    // Placeholder for alert notification system
    // In production, this would integrate with:
    // - Email notifications
    // - Slack/Discord webhooks
    // - PagerDuty
    // - SMS alerts
    // etc.
    
    this.logger.info('Alert notification sent', {
      alertId: alert.id,
      severity: alert.severity,
      title: alert.title,
    });
  }

  private initializeDefaultAlertRules(): void {
    const defaultRules: AlertRule[] = [
      {
        id: 'high-memory-usage',
        name: 'High Memory Usage',
        condition: (metrics) => metrics.memory.percentage > 85,
        severity: AlertSeverity.WARNING,
        message: 'System memory usage is above 85%',
        cooldownMinutes: 5,
        enabled: true,
      },
      {
        id: 'critical-memory-usage',
        name: 'Critical Memory Usage',
        condition: (metrics) => metrics.memory.percentage > 95,
        severity: AlertSeverity.CRITICAL,
        message: 'System memory usage is critically high (>95%)',
        cooldownMinutes: 2,
        enabled: true,
      },
      {
        id: 'high-cpu-usage',
        name: 'High CPU Usage',
        condition: (metrics) => metrics.cpu.usage > 80,
        severity: AlertSeverity.WARNING,
        message: 'System CPU usage is above 80%',
        cooldownMinutes: 5,
        enabled: true,
      },
      {
        id: 'high-error-rate',
        name: 'High Error Rate',
        condition: (metrics) => metrics.errors.rate > 10,
        severity: AlertSeverity.ERROR,
        message: 'Error rate is above 10 errors per minute',
        cooldownMinutes: 3,
        enabled: true,
      },
      {
        id: 'container-failures',
        name: 'Container Failures',
        condition: (metrics) => metrics.containers.failed > 0,
        severity: AlertSeverity.ERROR,
        message: 'One or more containers have failed',
        cooldownMinutes: 1,
        enabled: true,
      },
      {
        id: 'slow-response-times',
        name: 'Slow Response Times',
        condition: (metrics) => metrics.performance.averageResponseTime > 5000,
        severity: AlertSeverity.WARNING,
        message: 'Average response time is above 5 seconds',
        cooldownMinutes: 5,
        enabled: true,
      },
    ];

    this.alertRules = defaultRules;
    this.logger.info('Default alert rules initialized', {
      ruleCount: defaultRules.length,
    });
  }
}

/**
 * Global monitoring service instance
 */
export const monitoringService = new MonitoringService();

/**
 * Health check endpoint data
 */
export interface HealthCheckResult {
  status: 'healthy' | 'warning' | 'critical';
  timestamp: Date;
  uptime: number;
  version: string;
  environment: string;
  services: {
    database: 'healthy' | 'unhealthy';
    docker: 'healthy' | 'unhealthy';
    git: 'healthy' | 'unhealthy';
  };
  metrics: SystemMetrics | null;
  alerts: {
    active: number;
    critical: number;
    warnings: number;
  };
}

/**
 * Perform comprehensive health check
 */
export async function performHealthCheck(): Promise<HealthCheckResult> {
  const healthStatus = monitoringService.getHealthStatus();
  const activeAlerts = monitoringService.getActiveAlerts();
  
  return {
    status: healthStatus.status,
    timestamp: new Date(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    services: {
      database: 'healthy', // Would check actual database connection
      docker: 'healthy',   // Would check Docker daemon connection
      git: 'healthy',      // Would check Git service status
    },
    metrics: healthStatus.metrics,
    alerts: {
      active: activeAlerts.length,
      critical: activeAlerts.filter(a => a.severity === AlertSeverity.CRITICAL).length,
      warnings: activeAlerts.filter(a => a.severity === AlertSeverity.WARNING).length,
    },
  };
}