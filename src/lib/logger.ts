import { env } from '@/env';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  CRITICAL = 4,
}

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  service: string;
  message: string;
  metadata?: Record<string, any>;
  userId?: number;
  sessionId?: string;
  requestId?: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
}

export interface LoggerConfig {
  level: LogLevel;
  service: string;
  enableConsole: boolean;
  enableFile: boolean;
  enableStructured: boolean;
  filePath?: string;
}

export class Logger {
  private config: LoggerConfig;
  private context: Record<string, any> = {};

  constructor(config: LoggerConfig) {
    this.config = config;
  }

  /**
   * Set persistent context that will be included in all log entries
   */
  setContext(context: Record<string, any>): void {
    this.context = { ...this.context, ...context };
  }

  /**
   * Clear persistent context
   */
  clearContext(): void {
    this.context = {};
  }

  /**
   * Create a child logger with additional context
   */
  child(context: Record<string, any>): Logger {
    const childLogger = new Logger(this.config);
    childLogger.context = { ...this.context, ...context };
    return childLogger;
  }

  /**
   * Log debug message
   */
  debug(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, metadata);
  }

  /**
   * Log info message
   */
  info(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, metadata);
  }

  /**
   * Log warning message
   */
  warn(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, metadata);
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error | unknown, metadata?: Record<string, any>): void {
    const errorInfo = this.serializeError(error);
    this.log(LogLevel.ERROR, message, { ...metadata, error: errorInfo });
  }

  /**
   * Log critical error message
   */
  critical(message: string, error?: Error | unknown, metadata?: Record<string, any>): void {
    const errorInfo = this.serializeError(error);
    this.log(LogLevel.CRITICAL, message, { ...metadata, error: errorInfo });
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, message: string, metadata?: Record<string, any>): void {
    if (level < this.config.level) {
      return;
    }

    const logEntry: LogEntry = {
      timestamp: new Date(),
      level,
      service: this.config.service,
      message,
      metadata: { ...this.context, ...metadata },
    };

    // Extract common fields from metadata
    if (logEntry.metadata?.userId) {
      logEntry.userId = logEntry.metadata.userId;
    }
    if (logEntry.metadata?.sessionId) {
      logEntry.sessionId = logEntry.metadata.sessionId;
    }
    if (logEntry.metadata?.requestId) {
      logEntry.requestId = logEntry.metadata.requestId;
    }

    this.output(logEntry);
  }

  /**
   * Output log entry to configured destinations
   */
  private output(logEntry: LogEntry): void {
    if (this.config.enableConsole) {
      this.outputToConsole(logEntry);
    }

    if (this.config.enableStructured) {
      this.outputStructured(logEntry);
    }

    // File logging would be implemented here if needed
    if (this.config.enableFile && this.config.filePath) {
      this.outputToFile(logEntry);
    }
  }

  /**
   * Output to console with color coding
   */
  private outputToConsole(logEntry: LogEntry): void {
    const levelName = LogLevel[logEntry.level];
    const timestamp = logEntry.timestamp.toISOString();
    const service = logEntry.service;
    
    let colorCode = '';
    let resetCode = '\x1b[0m';
    
    switch (logEntry.level) {
      case LogLevel.DEBUG:
        colorCode = '\x1b[36m'; // Cyan
        break;
      case LogLevel.INFO:
        colorCode = '\x1b[32m'; // Green
        break;
      case LogLevel.WARN:
        colorCode = '\x1b[33m'; // Yellow
        break;
      case LogLevel.ERROR:
        colorCode = '\x1b[31m'; // Red
        break;
      case LogLevel.CRITICAL:
        colorCode = '\x1b[35m'; // Magenta
        break;
    }

    const baseMessage = `${colorCode}[${timestamp}] ${levelName} [${service}] ${logEntry.message}${resetCode}`;
    
    if (logEntry.metadata && Object.keys(logEntry.metadata).length > 0) {
      console.log(baseMessage, logEntry.metadata);
    } else {
      console.log(baseMessage);
    }

    // Log error stack trace separately for better readability
    if (logEntry.metadata?.error?.stack) {
      console.log(`${colorCode}Stack trace:${resetCode}\n${logEntry.metadata.error.stack}`);
    }
  }

  /**
   * Output structured JSON logs
   */
  private outputStructured(logEntry: LogEntry): void {
    const structuredLog: Record<string, any> = {
      '@timestamp': logEntry.timestamp.toISOString(),
      level: LogLevel[logEntry.level].toLowerCase(),
      service: logEntry.service,
      message: logEntry.message,
      ...logEntry.metadata,
    };

    // Add user and session context if available
    if (logEntry.userId) {
      structuredLog.userId = logEntry.userId;
    }
    if (logEntry.sessionId) {
      structuredLog.sessionId = logEntry.sessionId;
    }
    if (logEntry.requestId) {
      structuredLog.requestId = logEntry.requestId;
    }

    console.log(JSON.stringify(structuredLog));
  }

  /**
   * Output to file (basic implementation)
   */
  private outputToFile(logEntry: LogEntry): void {
    // In a production environment, this would use a proper file logging library
    // For now, we'll just use structured JSON output
    const logLine = JSON.stringify({
      timestamp: logEntry.timestamp.toISOString(),
      level: LogLevel[logEntry.level],
      service: logEntry.service,
      message: logEntry.message,
      ...logEntry.metadata,
    }) + '\n';

    // This would write to file in production
    // For development, we'll just output to console
    if (env.NODE_ENV === 'development') {
      process.stdout.write(logLine);
    }
  }

  /**
   * Serialize error objects for logging
   */
  private serializeError(error: Error | unknown): any {
    if (!error) return undefined;

    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
      };
    }

    if (typeof error === 'string') {
      return {
        name: 'StringError',
        message: error,
      };
    }

    if (typeof error === 'object') {
      try {
        return {
          name: 'ObjectError',
          message: JSON.stringify(error),
          ...error,
        };
      } catch {
        return {
          name: 'ObjectError',
          message: 'Failed to serialize error object',
        };
      }
    }

    return {
      name: 'UnknownError',
      message: String(error),
    };
  }
}

/**
 * Create logger with default configuration
 */
export function createLogger(service: string, overrides?: Partial<LoggerConfig>): Logger {
  const defaultConfig: LoggerConfig = {
    level: env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG,
    service,
    enableConsole: true,
    enableFile: false,
    enableStructured: env.NODE_ENV === 'production',
  };

  return new Logger({ ...defaultConfig, ...overrides });
}

/**
 * Application-wide logger instances
 */
export const appLogger = createLogger('app');
export const apiLogger = createLogger('api');
export const dockerLogger = createLogger('docker');
export const gitLogger = createLogger('git');
export const sessionLogger = createLogger('session');
export const securityLogger = createLogger('security');
export const traefikLogger = createLogger('traefik');

/**
 * Performance timing utility
 */
export class PerformanceTimer {
  private startTime: number;
  private logger: Logger;
  private operation: string;
  private metadata?: Record<string, any>;

  constructor(logger: Logger, operation: string, metadata?: Record<string, any>) {
    this.startTime = Date.now();
    this.logger = logger;
    this.operation = operation;
    this.metadata = metadata;
    
    this.logger.debug(`Starting operation: ${operation}`, metadata);
  }

  /**
   * End timing and log duration
   */
  end(additionalMetadata?: Record<string, any>): number {
    const duration = Date.now() - this.startTime;
    const metadata = { ...this.metadata, ...additionalMetadata, duration };
    
    if (duration > 5000) {
      this.logger.warn(`Slow operation completed: ${this.operation}`, metadata);
    } else {
      this.logger.debug(`Operation completed: ${this.operation}`, metadata);
    }
    
    return duration;
  }

  /**
   * End timing with error
   */
  endWithError(error: Error | unknown, additionalMetadata?: Record<string, any>): number {
    const duration = Date.now() - this.startTime;
    const metadata = { ...this.metadata, ...additionalMetadata, duration };
    
    this.logger.error(`Operation failed: ${this.operation}`, error, metadata);
    
    return duration;
  }
}

/**
 * Create performance timer
 */
export function createTimer(logger: Logger, operation: string, metadata?: Record<string, any>): PerformanceTimer {
  return new PerformanceTimer(logger, operation, metadata);
}