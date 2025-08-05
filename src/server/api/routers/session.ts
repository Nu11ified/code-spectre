import { z } from "zod";
import { createTRPCRouter, protectedProcedure, adminProcedure } from "@/server/api/trpc";
import { repositories, permissions, ideSessions } from "@/server/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getCustomUserIdFromAuthId } from "@/lib/user-utils";
import { TRPCError } from "@trpc/server";
import { getSessionManager } from "@/server/services/session-manager";
import type { UserPermissions } from "@/types/domain";

// Validation schemas for session operations
const sessionStartSchema = z.object({
  repositoryId: z.number().positive("Repository ID must be positive"),
  branchName: z.string()
    .min(1, "Branch name is required")
    .max(255, "Branch name must be less than 255 characters"),
});

const sessionStopSchema = z.object({
  sessionId: z.string().min(1, "Session ID is required"),
});

export const sessionRouter = createTRPCRouter({
  /**
   * Start a new IDE session for a specific repository and branch
   */
  start: protectedProcedure
    .input(sessionStartSchema)
    .mutation(async ({ input, ctx }) => {
      const customUserId = await getCustomUserIdFromAuthId(ctx.session.user.id);
      if (!customUserId) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to find user in custom table",
        });
      }

      // Get user permissions for this repository
      const permission = await ctx.db
        .select({
          canCreateBranches: permissions.canCreateBranches,
          branchLimit: permissions.branchLimit,
          allowedBaseBranches: permissions.allowedBaseBranches,
          allowTerminalAccess: permissions.allowTerminalAccess,
          repositoryName: repositories.name,
          gitUrl: repositories.gitUrl,
        })
        .from(permissions)
        .innerJoin(repositories, eq(permissions.repositoryId, repositories.id))
        .where(
          and(
            eq(permissions.userId, customUserId),
            eq(permissions.repositoryId, input.repositoryId)
          )
        )
        .limit(1);

      if (permission.length === 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to access this repository",
        });
      }

      const userPermission = permission[0]!;

      // Check if there's already an active session for this user/repo/branch
      const existingSession = await ctx.db
        .select()
        .from(ideSessions)
        .where(
          and(
            eq(ideSessions.userId, customUserId),
            eq(ideSessions.repositoryId, input.repositoryId),
            eq(ideSessions.branchName, input.branchName),
            eq(ideSessions.status, 'running')
          )
        )
        .limit(1);

      if (existingSession.length > 0) {
        const session = existingSession[0]!;
        
        // Update last accessed time
        await ctx.db
          .update(ideSessions)
          .set({ 
            lastAccessedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(ideSessions.id, session.id));

        return {
          sessionId: session.containerId,
          containerUrl: session.containerUrl,
          status: session.status,
          message: "Existing session found and reactivated",
        };
      }

      try {
        // Create session using SessionManager
        const sessionManager = getSessionManager();
        
        const userPermissions: UserPermissions = {
          canCreateBranches: userPermission.canCreateBranches,
          branchLimit: userPermission.branchLimit,
          allowedBaseBranches: userPermission.allowedBaseBranches,
          allowTerminalAccess: userPermission.allowTerminalAccess,
        };

        const sessionInfo = await sessionManager.createSession({
          userId: customUserId,
          repositoryId: input.repositoryId,
          branchName: input.branchName,
          permissions: userPermissions,
        });

        // Save session to database
        const [dbSession] = await ctx.db
          .insert(ideSessions)
          .values({
            userId: customUserId,
            repositoryId: input.repositoryId,
            branchName: input.branchName,
            containerId: sessionInfo.sessionId,
            containerUrl: sessionInfo.containerUrl,
            status: sessionInfo.status,
            lastAccessedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();

        return {
          sessionId: sessionInfo.sessionId,
          containerUrl: sessionInfo.containerUrl,
          status: sessionInfo.status,
          message: "IDE session created successfully",
          dbSessionId: dbSession?.id,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to create IDE session: ${error}`,
        });
      }
    }),

  /**
   * Stop an IDE session
   */
  stop: protectedProcedure
    .input(sessionStopSchema)
    .mutation(async ({ input, ctx }) => {
      const customUserId = await getCustomUserIdFromAuthId(ctx.session.user.id);
      if (!customUserId) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to find user in custom table",
        });
      }

      // Find the session in database
      const session = await ctx.db
        .select()
        .from(ideSessions)
        .where(
          and(
            eq(ideSessions.containerId, input.sessionId),
            eq(ideSessions.userId, customUserId)
          )
        )
        .limit(1);

      if (session.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found or you don't have permission to stop it",
        });
      }

      const dbSession = session[0]!;

      try {
        // Stop session using SessionManager
        const sessionManager = getSessionManager();
        await sessionManager.stopSession(input.sessionId);

        // Update session status in database
        await ctx.db
          .update(ideSessions)
          .set({ 
            status: 'stopped',
            updatedAt: new Date(),
          })
          .where(eq(ideSessions.id, dbSession.id));

        return {
          success: true,
          message: "IDE session stopped successfully",
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to stop IDE session: ${error}`,
        });
      }
    }),

  /**
   * Get current user's active sessions
   */
  getMySessions: protectedProcedure.query(async ({ ctx }) => {
    const customUserId = await getCustomUserIdFromAuthId(ctx.session.user.id);
    if (!customUserId) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to find user in custom table",
      });
    }

    const sessions = await ctx.db
      .select({
        id: ideSessions.id,
        repositoryId: ideSessions.repositoryId,
        repositoryName: repositories.name,
        branchName: ideSessions.branchName,
        containerId: ideSessions.containerId,
        containerUrl: ideSessions.containerUrl,
        status: ideSessions.status,
        lastAccessedAt: ideSessions.lastAccessedAt,
        createdAt: ideSessions.createdAt,
      })
      .from(ideSessions)
      .innerJoin(repositories, eq(ideSessions.repositoryId, repositories.id))
      .where(eq(ideSessions.userId, customUserId))
      .orderBy(desc(ideSessions.lastAccessedAt));

    return sessions;
  }),

  /**
   * Get session status and health information
   */
  getSessionStatus: protectedProcedure
    .input(z.object({
      sessionId: z.string().min(1, "Session ID is required"),
    }))
    .query(async ({ input, ctx }) => {
      const customUserId = await getCustomUserIdFromAuthId(ctx.session.user.id);
      if (!customUserId) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to find user in custom table",
        });
      }

      // Find the session in database
      const session = await ctx.db
        .select()
        .from(ideSessions)
        .where(
          and(
            eq(ideSessions.containerId, input.sessionId),
            eq(ideSessions.userId, customUserId)
          )
        )
        .limit(1);

      if (session.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found or you don't have permission to access it",
        });
      }

      const dbSession = session[0]!;

      try {
        // Get live session status from SessionManager
        const sessionManager = getSessionManager();
        const sessionInfo = await sessionManager.getSessionStatus(input.sessionId);

        // Update database if status has changed
        if (sessionInfo.status !== dbSession.status) {
          await ctx.db
            .update(ideSessions)
            .set({ 
              status: sessionInfo.status,
              updatedAt: new Date(),
            })
            .where(eq(ideSessions.id, dbSession.id));
        }

        return {
          sessionId: sessionInfo.sessionId,
          containerUrl: sessionInfo.containerUrl,
          status: sessionInfo.status,
          lastAccessedAt: dbSession.lastAccessedAt,
          createdAt: sessionInfo.createdAt,
        };
      } catch (error) {
        // If container is not found, mark session as stopped
        await ctx.db
          .update(ideSessions)
          .set({ 
            status: 'error',
            updatedAt: new Date(),
          })
          .where(eq(ideSessions.id, dbSession.id));

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to get session status: ${error}`,
        });
      }
    }),

  /**
   * Update session last accessed time (heartbeat)
   */
  heartbeat: protectedProcedure
    .input(z.object({
      sessionId: z.string().min(1, "Session ID is required"),
    }))
    .mutation(async ({ input, ctx }) => {
      const customUserId = await getCustomUserIdFromAuthId(ctx.session.user.id);
      if (!customUserId) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to find user in custom table",
        });
      }

      // Update last accessed time for the session
      const result = await ctx.db
        .update(ideSessions)
        .set({ 
          lastAccessedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(ideSessions.containerId, input.sessionId),
            eq(ideSessions.userId, customUserId)
          )
        )
        .returning({ id: ideSessions.id });

      if (result.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found or you don't have permission to access it",
        });
      }

      return {
        success: true,
        timestamp: new Date(),
      };
    }),

  // Admin procedures for session management

  /**
   * Get all active sessions (admin only)
   */
  getAllSessions: adminProcedure.query(async ({ ctx }) => {
    const sessions = await ctx.db
      .select({
        id: ideSessions.id,
        userId: ideSessions.userId,
        repositoryId: ideSessions.repositoryId,
        repositoryName: repositories.name,
        branchName: ideSessions.branchName,
        containerId: ideSessions.containerId,
        containerUrl: ideSessions.containerUrl,
        status: ideSessions.status,
        lastAccessedAt: ideSessions.lastAccessedAt,
        createdAt: ideSessions.createdAt,
      })
      .from(ideSessions)
      .innerJoin(repositories, eq(ideSessions.repositoryId, repositories.id))
      .orderBy(desc(ideSessions.lastAccessedAt));

    return sessions;
  }),

  /**
   * Force stop any session (admin only)
   */
  adminStopSession: adminProcedure
    .input(z.object({
      sessionId: z.string().min(1, "Session ID is required"),
    }))
    .mutation(async ({ input, ctx }) => {
      // Find the session in database
      const session = await ctx.db
        .select()
        .from(ideSessions)
        .where(eq(ideSessions.containerId, input.sessionId))
        .limit(1);

      if (session.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found",
        });
      }

      const dbSession = session[0]!;

      try {
        // Stop session using SessionManager
        const sessionManager = getSessionManager();
        await sessionManager.stopSession(input.sessionId);

        // Update session status in database
        await ctx.db
          .update(ideSessions)
          .set({ 
            status: 'stopped',
            updatedAt: new Date(),
          })
          .where(eq(ideSessions.id, dbSession.id));

        return {
          success: true,
          message: "IDE session stopped successfully by admin",
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to stop IDE session: ${error}`,
        });
      }
    }),

  /**
   * Perform health checks on all sessions (admin only)
   */
  performHealthChecks: adminProcedure.mutation(async ({ ctx }) => {
    try {
      const sessionManager = getSessionManager();
      const healthChecks = await sessionManager.performHealthChecks();

      // Update database with health check results
      for (const check of healthChecks) {
        if (!check.healthy) {
          await ctx.db
            .update(ideSessions)
            .set({ 
              status: 'error',
              updatedAt: new Date(),
            })
            .where(eq(ideSessions.containerId, check.sessionId));
        }
      }

      return {
        totalChecked: healthChecks.length,
        healthy: healthChecks.filter(c => c.healthy).length,
        unhealthy: healthChecks.filter(c => !c.healthy).length,
        results: healthChecks,
      };
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to perform health checks: ${error}`,
      });
    }
  }),

  /**
   * Clean up inactive sessions (admin only)
   */
  cleanupInactiveSessions: adminProcedure.mutation(async ({ ctx }) => {
    try {
      const sessionManager = getSessionManager();
      await sessionManager.cleanupInactiveSessions();

      // Update database to mark cleaned up sessions as stopped
      const cutoffTime = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
      
      await ctx.db
        .update(ideSessions)
        .set({ 
          status: 'stopped',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(ideSessions.status, 'running'),
            // lastAccessedAt is older than cutoff time
          )
        );

      return {
        success: true,
        message: "Inactive sessions cleaned up successfully",
      };
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to cleanup inactive sessions: ${error}`,
      });
    }
  }),
});