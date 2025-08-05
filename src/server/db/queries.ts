// Database query utilities for the Cloud IDE Orchestrator
// This file contains common database operations and query helpers

import { eq, and, desc, asc } from "drizzle-orm";
import { db } from "./index";
import { users, repositories, permissions, ideSessions, extensions } from "./schema";
import type { 
  User, 
  Repository, 
  Permission, 
  IdeSession, 
  Extension,
  SessionWithDetails 
} from "@/types";

/**
 * User-related database operations
 */
export const userQueries = {
  /**
   * Find user by GitHub ID
   */
  findByGithubId: async (githubId: string): Promise<User | undefined> => {
    const result = await db.select().from(users).where(eq(users.githubId, githubId)).limit(1);
    return result[0];
  },

  /**
   * Create or update user from GitHub OAuth
   */
  upsertFromGithub: async (userData: {
    githubId: string;
    githubUsername: string;
    email: string;
  }): Promise<User> => {
    const result = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.githubId,
        set: {
          githubUsername: userData.githubUsername,
          email: userData.email,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result[0]!;
  },

  /**
   * Get all users (admin only)
   */
  getAll: async (): Promise<User[]> => {
    return db.select().from(users).orderBy(asc(users.createdAt));
  },

  /**
   * Update user role
   */
  updateRole: async (userId: number, role: 'admin' | 'user'): Promise<User | undefined> => {
    const result = await db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return result[0];
  },
};

/**
 * Repository-related database operations
 */
export const repositoryQueries = {
  /**
   * Create a new repository
   */
  create: async (repoData: {
    name: string;
    gitUrl: string;
    ownerId: number;
    deployKeyPublic?: string;
    deployKeyPrivate?: string;
  }): Promise<Repository> => {
    const result = await db.insert(repositories).values(repoData).returning();
    return result[0]!;
  },

  /**
   * Get all repositories
   */
  getAll: async (): Promise<Repository[]> => {
    return db.select().from(repositories).orderBy(asc(repositories.name));
  },

  /**
   * Get repository by ID
   */
  getById: async (id: number): Promise<Repository | undefined> => {
    const result = await db.select().from(repositories).where(eq(repositories.id, id)).limit(1);
    return result[0];
  },

  /**
   * Get repositories accessible by user
   */
  getByUserId: async (userId: number): Promise<Repository[]> => {
    return db
      .select({
        id: repositories.id,
        name: repositories.name,
        gitUrl: repositories.gitUrl,
        ownerId: repositories.ownerId,
        deployKeyPublic: repositories.deployKeyPublic,
        deployKeyPrivate: repositories.deployKeyPrivate,
        createdAt: repositories.createdAt,
        updatedAt: repositories.updatedAt,
      })
      .from(repositories)
      .innerJoin(permissions, eq(permissions.repositoryId, repositories.id))
      .where(eq(permissions.userId, userId))
      .orderBy(asc(repositories.name));
  },

  /**
   * Update repository deploy keys
   */
  updateDeployKeys: async (
    id: number,
    deployKeyPublic: string,
    deployKeyPrivate: string
  ): Promise<Repository | undefined> => {
    const result = await db
      .update(repositories)
      .set({ deployKeyPublic, deployKeyPrivate, updatedAt: new Date() })
      .where(eq(repositories.id, id))
      .returning();
    return result[0];
  },
};

/**
 * Permission-related database operations
 */
export const permissionQueries = {
  /**
   * Create or update user permission for repository
   */
  upsert: async (permissionData: {
    userId: number;
    repositoryId: number;
    canCreateBranches: boolean;
    branchLimit: number;
    allowedBaseBranches: string[];
    allowTerminalAccess: boolean;
  }): Promise<Permission> => {
    const result = await db
      .insert(permissions)
      .values(permissionData)
      .onConflictDoUpdate({
        target: [permissions.userId, permissions.repositoryId],
        set: {
          canCreateBranches: permissionData.canCreateBranches,
          branchLimit: permissionData.branchLimit,
          allowedBaseBranches: permissionData.allowedBaseBranches,
          allowTerminalAccess: permissionData.allowTerminalAccess,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result[0]!;
  },

  /**
   * Get user permission for repository
   */
  getByUserAndRepository: async (
    userId: number,
    repositoryId: number
  ): Promise<Permission | undefined> => {
    const result = await db
      .select()
      .from(permissions)
      .where(and(eq(permissions.userId, userId), eq(permissions.repositoryId, repositoryId)))
      .limit(1);
    return result[0];
  },

  /**
   * Get all permissions for a user
   */
  getByUserId: async (userId: number): Promise<Permission[]> => {
    return db.select().from(permissions).where(eq(permissions.userId, userId));
  },

  /**
   * Remove user permission for repository
   */
  remove: async (userId: number, repositoryId: number): Promise<void> => {
    await db
      .delete(permissions)
      .where(and(eq(permissions.userId, userId), eq(permissions.repositoryId, repositoryId)));
  },
};

/**
 * IDE Session-related database operations
 */
export const sessionQueries = {
  /**
   * Create a new IDE session
   */
  create: async (sessionData: {
    userId: number;
    repositoryId: number;
    branchName: string;
    containerId: string;
    containerUrl: string;
  }): Promise<IdeSession> => {
    const result = await db.insert(ideSessions).values(sessionData).returning();
    return result[0]!;
  },

  /**
   * Get session by ID
   */
  getById: async (id: number): Promise<IdeSession | undefined> => {
    const result = await db.select().from(ideSessions).where(eq(ideSessions.id, id)).limit(1);
    return result[0];
  },

  /**
   * Get active sessions for user
   */
  getActiveByUserId: async (userId: number): Promise<IdeSession[]> => {
    return db
      .select()
      .from(ideSessions)
      .where(and(eq(ideSessions.userId, userId), eq(ideSessions.status, 'running')))
      .orderBy(desc(ideSessions.lastAccessedAt));
  },

  /**
   * Get all active sessions (admin only)
   */
  getAllActive: async (): Promise<SessionWithDetails[]> => {
    return db
      .select({
        id: ideSessions.id,
        branchName: ideSessions.branchName,
        containerId: ideSessions.containerId,
        containerUrl: ideSessions.containerUrl,
        status: ideSessions.status,
        lastAccessedAt: ideSessions.lastAccessedAt,
        createdAt: ideSessions.createdAt,
        repository: {
          id: repositories.id,
          name: repositories.name,
          gitUrl: repositories.gitUrl,
        },
        user: {
          id: users.id,
          githubUsername: users.githubUsername,
        },
      })
      .from(ideSessions)
      .innerJoin(repositories, eq(ideSessions.repositoryId, repositories.id))
      .innerJoin(users, eq(ideSessions.userId, users.id))
      .where(eq(ideSessions.status, 'running'))
      .orderBy(desc(ideSessions.lastAccessedAt));
  },

  /**
   * Update session status
   */
  updateStatus: async (
    id: number,
    status: 'running' | 'stopped' | 'error'
  ): Promise<IdeSession | undefined> => {
    const result = await db
      .update(ideSessions)
      .set({ status, updatedAt: new Date() })
      .where(eq(ideSessions.id, id))
      .returning();
    return result[0];
  },

  /**
   * Update last accessed time
   */
  updateLastAccessed: async (id: number): Promise<void> => {
    await db
      .update(ideSessions)
      .set({ lastAccessedAt: new Date(), updatedAt: new Date() })
      .where(eq(ideSessions.id, id));
  },

  /**
   * Find existing session for user, repository, and branch
   */
  findExisting: async (
    userId: number,
    repositoryId: number,
    branchName: string
  ): Promise<IdeSession | undefined> => {
    const result = await db
      .select()
      .from(ideSessions)
      .where(
        and(
          eq(ideSessions.userId, userId),
          eq(ideSessions.repositoryId, repositoryId),
          eq(ideSessions.branchName, branchName),
          eq(ideSessions.status, 'running')
        )
      )
      .limit(1);
    return result[0];
  },

  /**
   * Remove session
   */
  remove: async (id: number): Promise<void> => {
    await db.delete(ideSessions).where(eq(ideSessions.id, id));
  },
};

/**
 * Extension-related database operations
 */
export const extensionQueries = {
  /**
   * Install a new extension
   */
  install: async (extensionData: {
    extensionId: string;
    name: string;
    version: string;
    installedBy: number;
  }): Promise<Extension> => {
    const result = await db
      .insert(extensions)
      .values(extensionData)
      .onConflictDoUpdate({
        target: extensions.extensionId,
        set: {
          name: extensionData.name,
          version: extensionData.version,
          enabled: true,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result[0]!;
  },

  /**
   * Get all enabled extensions
   */
  getEnabled: async (): Promise<Extension[]> => {
    return db
      .select()
      .from(extensions)
      .where(eq(extensions.enabled, true))
      .orderBy(asc(extensions.name));
  },

  /**
   * Get all extensions (admin only)
   */
  getAll: async (): Promise<Extension[]> => {
    return db.select().from(extensions).orderBy(asc(extensions.name));
  },

  /**
   * Toggle extension enabled status
   */
  toggleEnabled: async (id: number, enabled: boolean): Promise<Extension | undefined> => {
    const result = await db
      .update(extensions)
      .set({ enabled, updatedAt: new Date() })
      .where(eq(extensions.id, id))
      .returning();
    return result[0];
  },

  /**
   * Remove extension
   */
  remove: async (id: number): Promise<void> => {
    await db.delete(extensions).where(eq(extensions.id, id));
  },
};