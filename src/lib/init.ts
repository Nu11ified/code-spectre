import { appLogger } from './logger';
import { monitoringService } from './monitoring';
import { recoveryService } from './recovery';

/**
 * Initialize application services
 */
export async function initializeServices(): Promise<void> {
  appLogger.info('Initializing application services');

  try {
    // Start monitoring service
    monitoringService.start();
    appLogger.info('Monitoring service started');

    // Start recovery service
    recoveryService.start();
    appLogger.info('Recovery service started');

    // Set up graceful shutdown handlers
    setupGracefulShutdown();

    appLogger.info('All services initialized successfully');
  } catch (error) {
    appLogger.critical('Failed to initialize services', error);
    throw error;
  }
}

/**
 * Shutdown application services gracefully
 */
export async function shutdownServices(): Promise<void> {
  appLogger.info('Shutting down application services');

  try {
    // Stop recovery service
    recoveryService.stop();
    appLogger.info('Recovery service stopped');

    // Stop monitoring service
    monitoringService.stop();
    appLogger.info('Monitoring service stopped');

    appLogger.info('All services shut down successfully');
  } catch (error) {
    appLogger.error('Error during service shutdown', error);
    throw error;
  }
}

/**
 * Set up graceful shutdown handlers
 */
function setupGracefulShutdown(): void {
  const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'] as const;

  signals.forEach((signal) => {
    process.on(signal, async () => {
      appLogger.info(`Received ${signal}, starting graceful shutdown`);
      
      try {
        await shutdownServices();
        process.exit(0);
      } catch (error) {
        appLogger.error('Error during graceful shutdown', error);
        process.exit(1);
      }
    });
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    appLogger.critical('Uncaught exception', error);
    
    // Try to shutdown gracefully, but don't wait too long
    shutdownServices()
      .catch(() => {
        // Ignore shutdown errors in this case
      })
      .finally(() => {
        process.exit(1);
      });
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    appLogger.critical('Unhandled promise rejection', reason, {
      promise: promise.toString(),
    });
    
    // Try to shutdown gracefully, but don't wait too long
    shutdownServices()
      .catch(() => {
        // Ignore shutdown errors in this case
      })
      .finally(() => {
        process.exit(1);
      });
  });

  appLogger.info('Graceful shutdown handlers configured');
}