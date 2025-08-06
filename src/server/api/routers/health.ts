import { z } from "zod";
import { createTRPCRouter, publicProcedure, adminProcedure } from "@/server/api/trpc";
import { performHealthCheck, monitoringService } from "@/lib/monitoring";

export const healthRouter = createTRPCRouter({
  check: publicProcedure.query(async ({ ctx }) => {
    ctx.logger.debug('Health check requested');
    
    try {
      const healthResult = await performHealthCheck();
      
      ctx.logger.info('Health check completed', {
        status: healthResult.status,
        activeAlerts: healthResult.alerts.active,
      });
      
      return healthResult;
    } catch (error) {
      ctx.logger.error('Health check failed', error);
      
      return {
        status: 'critical' as const,
        timestamp: new Date(),
        uptime: process.uptime(),
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        services: {
          database: 'unhealthy' as const,
          docker: 'unhealthy' as const,
          git: 'unhealthy' as const,
        },
        metrics: null,
        alerts: {
          active: 0,
          critical: 0,
          warnings: 0,
        },
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }),

  echo: publicProcedure
    .input(z.object({ message: z.string() }))
    .query(({ input, ctx }) => {
      ctx.logger.debug('Echo requested', { message: input.message });
      
      return {
        echo: input.message,
        timestamp: new Date().toISOString(),
        requestId: ctx.requestId,
      };
    }),

  metrics: adminProcedure
    .input(z.object({
      minutes: z.number().min(1).max(1440).default(60), // Max 24 hours
    }))
    .query(({ input, ctx }) => {
      ctx.logger.debug('Metrics requested', { minutes: input.minutes });
      
      const metricsHistory = monitoringService.getMetricsHistory(input.minutes);
      const currentMetrics = monitoringService.getCurrentMetrics();
      
      return {
        current: currentMetrics,
        history: metricsHistory,
        timeRange: {
          minutes: input.minutes,
          from: new Date(Date.now() - input.minutes * 60 * 1000),
          to: new Date(),
        },
      };
    }),

  alerts: adminProcedure
    .input(z.object({
      includeResolved: z.boolean().default(false),
      limit: z.number().min(1).max(1000).default(100),
    }))
    .query(({ input, ctx }) => {
      ctx.logger.debug('Alerts requested', input);
      
      const alerts = input.includeResolved 
        ? monitoringService.getAllAlerts(input.limit)
        : monitoringService.getActiveAlerts();
      
      return {
        alerts: alerts.slice(0, input.limit),
        total: alerts.length,
        active: monitoringService.getActiveAlerts().length,
      };
    }),

  resolveAlert: adminProcedure
    .input(z.object({
      alertId: z.string(),
    }))
    .mutation(({ input, ctx }) => {
      ctx.logger.info('Resolving alert', { alertId: input.alertId });
      
      monitoringService.resolveAlert(input.alertId);
      
      return {
        success: true,
        alertId: input.alertId,
        resolvedAt: new Date(),
      };
    }),

  systemStatus: adminProcedure.query(({ ctx }) => {
    ctx.logger.debug('System status requested');
    
    const healthStatus = monitoringService.getHealthStatus();
    const currentMetrics = monitoringService.getCurrentMetrics();
    const activeAlerts = monitoringService.getActiveAlerts();
    
    return {
      ...healthStatus,
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date(),
      alerts: {
        total: activeAlerts.length,
        critical: activeAlerts.filter(a => a.severity === 'critical').length,
        warnings: activeAlerts.filter(a => a.severity === 'warning').length,
        errors: activeAlerts.filter(a => a.severity === 'error').length,
      },
      performance: currentMetrics ? {
        averageResponseTime: currentMetrics.performance.averageResponseTime,
        slowQueries: currentMetrics.performance.slowQueries,
        errorRate: currentMetrics.errors.rate,
      } : null,
    };
  }),
});