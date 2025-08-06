import { initializeServices } from '@/lib/init';
import { appLogger } from '@/lib/logger';

// Track if services have been initialized
let servicesInitialized = false;

/**
 * Initialize server services once
 */
export async function ensureServicesInitialized(): Promise<void> {
  if (servicesInitialized) {
    return;
  }

  try {
    await initializeServices();
    servicesInitialized = true;
    appLogger.info('Server services initialized');
  } catch (error) {
    appLogger.critical('Failed to initialize server services', error);
    throw error;
  }
}

// Initialize services when this module is imported
if (typeof window === 'undefined') {
  // Only run on server side
  ensureServicesInitialized().catch((error) => {
    console.error('Failed to initialize services:', error);
  });
}