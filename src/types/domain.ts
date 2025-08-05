// Domain model interfaces for the Cloud IDE Orchestrator
// These interfaces define the shape of data objects used throughout the application

/**
 * User entity representing a platform user
 */
export interface User {
  id: number;
  githubId: string;
  githubUsername: string;
  email: string;
  role: string; // 'admin' | 'user' - using string to match Drizzle output
  createdAt: Date;
  updatedAt: Date | null;
}

/**
 * Repository entity representing a Git repository managed by the platform
 */
export interface Repository {
  id: number;
  name: string;
  gitUrl: string;
  ownerId: number;
  deployKeyPublic: string | null;
  deployKeyPrivate: string | null;
  createdAt: Date;
  updatedAt: Date | null;
}

/**
 * Permission entity defining user access rights to repositories
 */
export interface Permission {
  id: number;
  userId: number;
  repositoryId: number;
  canCreateBranches: boolean;
  branchLimit: number;
  allowedBaseBranches: string[];
  allowTerminalAccess: boolean;
  createdAt: Date;
  updatedAt: Date | null;
}

/**
 * IDE Session entity tracking active container instances
 */
export interface IdeSession {
  id: number;
  userId: number;
  repositoryId: number;
  branchName: string;
  containerId: string;
  containerUrl: string;
  status: string; // 'running' | 'stopped' | 'error' - using string to match Drizzle output
  lastAccessedAt: Date;
  createdAt: Date;
  updatedAt: Date | null;
}

/**
 * Extension entity representing globally installed VS Code extensions
 */
export interface Extension {
  id: number;
  extensionId: string; // e.g., 'ms-python.python'
  name: string;
  version: string;
  enabled: boolean;
  installedBy: number;
  createdAt: Date;
  updatedAt: Date | null;
}

/**
 * Container configuration for Docker container creation
 */
export interface ContainerConfig {
  image: string; // 'codercom/code-server:latest'
  name: string; // Unique container name
  mounts: Mount[];
  environment: Record<string, string>;
  labels: Record<string, string>; // Traefik routing labels
  resources: ResourceLimits;
  networkMode: string;
}

/**
 * Mount configuration for container volumes
 */
export interface Mount {
  source: string; // Host path
  target: string; // Container path
  type: 'bind' | 'volume';
  readOnly?: boolean;
}

/**
 * Resource limits for container instances
 */
export interface ResourceLimits {
  memory: string; // e.g., '2g'
  cpus: string; // e.g., '1.0'
}

/**
 * User permissions aggregated for easy access control
 */
export interface UserPermissions {
  canCreateBranches: boolean;
  branchLimit: number;
  allowedBaseBranches: string[];
  allowTerminalAccess: boolean;
}

/**
 * Session status information
 */
export interface SessionStatus {
  id: number;
  status: string; // 'running' | 'stopped' | 'error'
  containerUrl: string;
  lastAccessedAt: Date;
  resourceUsage?: {
    cpu: number;
    memory: number;
  };
}

/**
 * Repository with branch information
 */
export interface RepositoryWithBranches {
  id: number;
  name: string;
  gitUrl: string;
  branches: string[];
  userPermissions: UserPermissions;
}

/**
 * User with their accessible repositories
 */
export interface UserWithRepositories {
  id: number;
  githubUsername: string;
  email: string;
  role: 'admin' | 'user';
  repositories: RepositoryWithBranches[];
}

/**
 * Session with related repository and user information
 */
export interface SessionWithDetails {
  id: number;
  branchName: string;
  containerId: string;
  containerUrl: string;
  status: string; // 'running' | 'stopped' | 'error'
  lastAccessedAt: Date;
  createdAt: Date;
  repository: {
    id: number;
    name: string;
    gitUrl: string;
  };
  user: {
    id: number;
    githubUsername: string;
  };
}

/**
 * Error codes for API responses
 */
export enum ErrorCode {
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  REPOSITORY_NOT_FOUND = 'REPOSITORY_NOT_FOUND',
  BRANCH_NOT_FOUND = 'BRANCH_NOT_FOUND',
  CONTAINER_CREATION_FAILED = 'CONTAINER_CREATION_FAILED',
  GIT_OPERATION_FAILED = 'GIT_OPERATION_FAILED',
  RESOURCE_LIMIT_EXCEEDED = 'RESOURCE_LIMIT_EXCEEDED',
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
}

/**
 * Structured API error response
 */
export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Log entry for structured logging
 */
export interface LogEntry {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  service: string;
  userId?: number;
  sessionId?: number;
  message: string;
  metadata?: Record<string, unknown>;
}

/**
 * System metrics for monitoring
 */
export interface Metrics {
  activeContainers: number;
  totalSessions: number;
  averageSessionDuration: number;
  resourceUtilization: {
    cpu: number;
    memory: number;
    disk: number;
  };
  errorRates: Record<ErrorCode, number>;
}