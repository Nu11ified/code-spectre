import { TRPCError } from '@trpc/server';
import { Logger } from './logger';

/**
 * Application error codes for consistent error handling
 */
export enum ErrorCode {
  // Authentication & Authorization
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  
  // Resource Errors
  REPOSITORY_NOT_FOUND = 'REPOSITORY_NOT_FOUND',
  BRANCH_NOT_FOUND = 'BRANCH_NOT_FOUND',
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  EXTENSION_NOT_FOUND = 'EXTENSION_NOT_FOUND',
  
  // Container & Docker Errors
  CONTAINER_CREATION_FAILED = 'CONTAINER_CREATION_FAILED',
  CONTAINER_START_FAILED = 'CONTAINER_START_FAILED',
  CONTAINER_STOP_FAILED = 'CONTAINER_STOP_FAILED',
  CONTAINER_NOT_FOUND = 'CONTAINER_NOT_FOUND',
  CONTAINER_LIMIT_EXCEEDED = 'CONTAINER_LIMIT_EXCEEDED',
  DOCKER_CONNECTION_FAILED = 'DOCKER_CONNECTION_FAILED',
  
  // Git Operation Errors
  GIT_CLONE_FAILED = 'GIT_CLONE_FAILED',
  GIT_BRANCH_CREATION_FAILED = 'GIT_BRANCH_CREATION_FAILED',
  GIT_WORKTREE_CREATION_FAILED = 'GIT_WORKTREE_CREATION_FAILED',
  GIT_OPERATION_FAILED = 'GIT_OPERATION_FAILED',
  INVALID_GIT_URL = 'INVALID_GIT_URL',
  INVALID_BRANCH_NAME = 'INVALID_BRANCH_NAME',
  
  // Resource & System Errors
  RESOURCE_LIMIT_EXCEEDED = 'RESOURCE_LIMIT_EXCEEDED',
  INSUFFICIENT_RESOURCES = 'INSUFFICIENT_RESOURCES',
  SYSTEM_OVERLOADED = 'SYSTEM_OVERLOADED',
  DISK_SPACE_EXCEEDED = 'DISK_SPACE_EXCEEDED',
  
  // Security Errors
  SECURITY_VIOLATION = 'SECURITY_VIOLATION',
  INVALID_FILE_ACCESS = 'INVALID_FILE_ACCESS',
  INVALID_NETWORK_ACCESS = 'INVALID_NETWORK_ACCESS',
  INVALID_TERMINAL_COMMAND = 'INVALID_TERMINAL_COMMAND',
  CONTAINER_SECURITY_BREACH = 'CONTAINER_SECURITY_BREACH',
  
  // Validation Errors
  INVALID_INPUT = 'INVALID_INPUT',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  
  // Network & External Service Errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  
  // Database Errors
  DATABASE_ERROR = 'DATABASE_ERROR',
  DATABASE_CONNECTION_FAILED = 'DATABASE_CONNECTION_FAILED',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  
  // Generic Errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  OPERATION_FAILED = 'OPERATION_FAILED',
}

/**
 * Base application error class
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly metadata?: Record<string, any>;
  public readonly timestamp: Date;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    metadata?: Record<string, any>
  ) {
    super(message);
    
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.metadata = metadata;
    this.timestamp = new Date();

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, AppError);
  }

  /**
   * Convert to tRPC error
   */
  toTRPCError(): TRPCError {
    const trpcCode = this.mapToTRPCCode();
    
    return new TRPCError({
      code: trpcCode,
      message: this.message,
      cause: this,
    });
  }

  /**
   * Map application error code to tRPC error code
   */
  private mapToTRPCCode(): TRPCError['code'] {
    switch (this.code) {
      case ErrorCode.UNAUTHORIZED:
      case ErrorCode.INVALID_CREDENTIALS:
      case ErrorCode.SESSION_EXPIRED:
        return 'UNAUTHORIZED';
        
      case ErrorCode.FORBIDDEN:
      case ErrorCode.SECURITY_VIOLATION:
      case ErrorCode.INVALID_FILE_ACCESS:
      case ErrorCode.INVALID_NETWORK_ACCESS:
      case ErrorCode.INVALID_TERMINAL_COMMAND:
        return 'FORBIDDEN';
        
      case ErrorCode.REPOSITORY_NOT_FOUND:
      case ErrorCode.BRANCH_NOT_FOUND:
      case ErrorCode.SESSION_NOT_FOUND:
      case ErrorCode.USER_NOT_FOUND:
      case ErrorCode.EXTENSION_NOT_FOUND:
      case ErrorCode.CONTAINER_NOT_FOUND:
        return 'NOT_FOUND';
        
      case ErrorCode.INVALID_INPUT:
      case ErrorCode.VALIDATION_FAILED:
      case ErrorCode.MISSING_REQUIRED_FIELD:
      case ErrorCode.INVALID_GIT_URL:
      case ErrorCode.INVALID_BRANCH_NAME:
        return 'BAD_REQUEST';
        
      case ErrorCode.CONTAINER_LIMIT_EXCEEDED:
      case ErrorCode.RESOURCE_LIMIT_EXCEEDED:
      case ErrorCode.SYSTEM_OVERLOADED:
      case ErrorCode.DISK_SPACE_EXCEEDED:
        return 'TOO_MANY_REQUESTS';
        
      case ErrorCode.TIMEOUT_ERROR:
        return 'TIMEOUT';
        
      case ErrorCode.NETWORK_ERROR:
      case ErrorCode.EXTERNAL_SERVICE_ERROR:
      case ErrorCode.DOCKER_CONNECTION_FAILED:
      case ErrorCode.DATABASE_CONNECTION_FAILED:
        return 'INTERNAL_SERVER_ERROR';
        
      default:
        return 'INTERNAL_SERVER_ERROR';
    }
  }

  /**
   * Serialize error for logging
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      isOperational: this.isOperational,
      metadata: this.metadata,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
    };
  }
}

/**
 * Specific error classes for different domains
 */

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed', metadata?: Record<string, any>) {
    super(ErrorCode.UNAUTHORIZED, message, 401, true, metadata);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Access denied', metadata?: Record<string, any>) {
    super(ErrorCode.FORBIDDEN, message, 403, true, metadata);
    this.name = 'AuthorizationError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, field?: string, metadata?: Record<string, any>) {
    const errorMetadata = field ? { ...metadata, field } : metadata;
    super(ErrorCode.VALIDATION_FAILED, message, 400, true, errorMetadata);
    this.name = 'ValidationError';
  }
}

export class ResourceNotFoundError extends AppError {
  constructor(resource: string, identifier?: string | number, metadata?: Record<string, any>) {
    const message = identifier 
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    const errorMetadata = { ...metadata, resource, identifier };
    super(ErrorCode.REPOSITORY_NOT_FOUND, message, 404, true, errorMetadata);
    this.name = 'ResourceNotFoundError';
  }
}

export class ContainerError extends AppError {
  constructor(
    code: ErrorCode,
    message: string,
    containerId?: string,
    metadata?: Record<string, any>
  ) {
    const errorMetadata = containerId ? { ...metadata, containerId } : metadata;
    super(code, message, 500, true, errorMetadata);
    this.name = 'ContainerError';
  }
}

export class GitError extends AppError {
  constructor(
    code: ErrorCode,
    message: string,
    repositoryId?: number,
    metadata?: Record<string, any>
  ) {
    const errorMetadata = repositoryId ? { ...metadata, repositoryId } : metadata;
    super(code, message, 500, true, errorMetadata);
    this.name = 'GitError';
  }
}

export class SecurityError extends AppError {
  constructor(
    message: string,
    violation: string,
    userId?: number,
    sessionId?: string,
    metadata?: Record<string, any>
  ) {
    const errorMetadata = {
      ...metadata,
      violation,
      userId,
      sessionId,
      severity: 'high',
    };
    super(ErrorCode.SECURITY_VIOLATION, message, 403, true, errorMetadata);
    this.name = 'SecurityError';
  }
}

export class ResourceLimitError extends AppError {
  constructor(
    resource: string,
    limit: number,
    current: number,
    metadata?: Record<string, any>
  ) {
    const message = `${resource} limit exceeded: ${current}/${limit}`;
    const errorMetadata = { ...metadata, resource, limit, current };
    super(ErrorCode.RESOURCE_LIMIT_EXCEEDED, message, 429, true, errorMetadata);
    this.name = 'ResourceLimitError';
  }
}

/**
 * Error handling utilities
 */
export class ErrorHandler {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Handle and log application errors
   */
  handleError(error: Error | AppError | unknown, context?: Record<string, any>): AppError {
    if (error instanceof AppError) {
      // Log operational errors at appropriate level
      if (error.isOperational) {
        if (error.statusCode >= 500) {
          this.logger.error(`Operational error: ${error.message}`, error, {
            ...context,
            ...error.metadata,
          });
        } else {
          this.logger.warn(`Client error: ${error.message}`, {
            ...context,
            ...error.metadata,
            code: error.code,
          });
        }
      } else {
        // Non-operational errors are always critical
        this.logger.critical(`Non-operational error: ${error.message}`, error, {
          ...context,
          ...error.metadata,
        });
      }
      
      return error;
    }

    if (error instanceof Error) {
      // Convert generic errors to AppError
      const appError = new AppError(
        ErrorCode.INTERNAL_ERROR,
        error.message,
        500,
        false,
        { ...context, originalError: error.name }
      );
      
      this.logger.critical(`Unhandled error: ${error.message}`, error, context);
      
      return appError;
    }

    // Handle unknown error types
    const unknownError = new AppError(
      ErrorCode.UNKNOWN_ERROR,
      'An unknown error occurred',
      500,
      false,
      { ...context, originalError: String(error) }
    );
    
    this.logger.critical('Unknown error type encountered', error, context);
    
    return unknownError;
  }

  /**
   * Create user-friendly error messages
   */
  createUserFriendlyMessage(error: AppError): string {
    switch (error.code) {
      case ErrorCode.UNAUTHORIZED:
        return 'Please log in to access this resource.';
        
      case ErrorCode.FORBIDDEN:
        return 'You do not have permission to perform this action.';
        
      case ErrorCode.REPOSITORY_NOT_FOUND:
        return 'The requested repository could not be found.';
        
      case ErrorCode.BRANCH_NOT_FOUND:
        return 'The requested branch does not exist.';
        
      case ErrorCode.SESSION_NOT_FOUND:
        return 'Your IDE session could not be found. Please start a new session.';
        
      case ErrorCode.CONTAINER_CREATION_FAILED:
        return 'Failed to create your development environment. Please try again.';
        
      case ErrorCode.CONTAINER_LIMIT_EXCEEDED:
        return 'You have reached the maximum number of active development environments.';
        
      case ErrorCode.GIT_CLONE_FAILED:
        return 'Failed to access the repository. Please check the repository URL and permissions.';
        
      case ErrorCode.INVALID_BRANCH_NAME:
        return 'The branch name contains invalid characters. Please use only letters, numbers, hyphens, and underscores.';
        
      case ErrorCode.RESOURCE_LIMIT_EXCEEDED:
        return 'System resources are currently limited. Please try again later.';
        
      case ErrorCode.SECURITY_VIOLATION:
        return 'This action is not allowed for security reasons.';
        
      case ErrorCode.VALIDATION_FAILED:
        return 'The provided information is invalid. Please check your input and try again.';
        
      case ErrorCode.NETWORK_ERROR:
        return 'A network error occurred. Please check your connection and try again.';
        
      case ErrorCode.TIMEOUT_ERROR:
        return 'The operation timed out. Please try again.';
        
      default:
        return 'An unexpected error occurred. Please try again or contact support if the problem persists.';
    }
  }

  /**
   * Determine if error should be retried
   */
  isRetryable(error: AppError): boolean {
    const retryableCodes = [
      ErrorCode.NETWORK_ERROR,
      ErrorCode.TIMEOUT_ERROR,
      ErrorCode.EXTERNAL_SERVICE_ERROR,
      ErrorCode.DATABASE_CONNECTION_FAILED,
      ErrorCode.DOCKER_CONNECTION_FAILED,
      ErrorCode.SYSTEM_OVERLOADED,
    ];
    
    return retryableCodes.includes(error.code);
  }

  /**
   * Get error recovery suggestions
   */
  getRecoverySuggestions(error: AppError): string[] {
    const suggestions: string[] = [];
    
    switch (error.code) {
      case ErrorCode.CONTAINER_LIMIT_EXCEEDED:
        suggestions.push('Stop unused development environments');
        suggestions.push('Wait for inactive sessions to timeout');
        break;
        
      case ErrorCode.RESOURCE_LIMIT_EXCEEDED:
        suggestions.push('Try again in a few minutes');
        suggestions.push('Close other applications to free up resources');
        break;
        
      case ErrorCode.GIT_CLONE_FAILED:
        suggestions.push('Verify the repository URL is correct');
        suggestions.push('Check that you have access to the repository');
        suggestions.push('Ensure the repository exists and is not private');
        break;
        
      case ErrorCode.CONTAINER_CREATION_FAILED:
        suggestions.push('Try starting the session again');
        suggestions.push('Check system resources');
        suggestions.push('Contact support if the problem persists');
        break;
        
      case ErrorCode.NETWORK_ERROR:
        suggestions.push('Check your internet connection');
        suggestions.push('Try again in a few moments');
        break;
        
      case ErrorCode.VALIDATION_FAILED:
        if (error.metadata?.field) {
          suggestions.push(`Check the ${error.metadata.field} field`);
        }
        suggestions.push('Ensure all required fields are filled correctly');
        break;
    }
    
    return suggestions;
  }
}

/**
 * Retry mechanism for operations that might fail temporarily
 */
export class RetryHandler {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Retry an operation with exponential backoff
   */
  async retry<T>(
    operation: () => Promise<T>,
    options: {
      maxAttempts?: number;
      baseDelay?: number;
      maxDelay?: number;
      backoffMultiplier?: number;
      retryCondition?: (error: any) => boolean;
      onRetry?: (attempt: number, error: any) => void;
    } = {}
  ): Promise<T> {
    const {
      maxAttempts = 3,
      baseDelay = 1000,
      maxDelay = 10000,
      backoffMultiplier = 2,
      retryCondition = (error) => error instanceof AppError && new ErrorHandler(this.logger).isRetryable(error),
      onRetry,
    } = options;

    let lastError: any;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        if (attempt === maxAttempts || !retryCondition(error)) {
          throw error;
        }

        const delay = Math.min(baseDelay * Math.pow(backoffMultiplier, attempt - 1), maxDelay);
        
        this.logger.warn(`Operation failed, retrying in ${delay}ms`, {
          attempt,
          maxAttempts,
          error: error instanceof Error ? error.message : String(error),
        });

        if (onRetry) {
          onRetry(attempt, error);
        }

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }
}

/**
 * Circuit breaker pattern for external service calls
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private logger: Logger;

  constructor(
    private options: {
      failureThreshold: number;
      resetTimeout: number;
      monitoringPeriod: number;
    },
    logger: Logger
  ) {
    this.logger = logger;
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>, fallback?: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.options.resetTimeout) {
        this.state = 'half-open';
        this.logger.info('Circuit breaker transitioning to half-open state');
      } else {
        this.logger.warn('Circuit breaker is open, using fallback');
        if (fallback) {
          return await fallback();
        }
        throw new AppError(
          ErrorCode.EXTERNAL_SERVICE_ERROR,
          'Service is currently unavailable',
          503,
          true,
          { circuitBreakerState: this.state }
        );
      }
    }

    try {
      const result = await operation();
      
      if (this.state === 'half-open') {
        this.reset();
      }
      
      return result;
    } catch (error) {
      this.recordFailure();
      
      if (fallback && this.state === 'open') {
        this.logger.warn('Circuit breaker triggered, using fallback');
        return await fallback();
      }
      
      throw error;
    }
  }

  private recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.options.failureThreshold) {
      this.state = 'open';
      this.logger.error('Circuit breaker opened due to repeated failures', {
        failures: this.failures,
        threshold: this.options.failureThreshold,
      });
    }
  }

  private reset(): void {
    this.failures = 0;
    this.state = 'closed';
    this.logger.info('Circuit breaker reset to closed state');
  }

  getState(): { state: string; failures: number; lastFailureTime: number } {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
    };
  }
}

/**
 * Global error handler instance
 */
export const globalErrorHandler = new ErrorHandler(new Logger({
  level: 0,
  service: 'error-handler',
  enableConsole: true,
  enableFile: false,
  enableStructured: true,
}));