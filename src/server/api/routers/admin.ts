import { z } from "zod";
import { createTRPCRouter, adminProcedure } from "@/server/api/trpc";
import { users, repositories, permissions, extensions } from "@/server/db/schema";
import { eq, desc, and, like, count } from "drizzle-orm";
import { getCustomUserIdFromAuthId } from "@/lib/user-utils";
import { TRPCError } from "@trpc/server";
import { getDockerService } from "@/server/services/docker";
import { getSessionManager } from "@/server/services/session-manager";
import { getSecurityService } from "@/server/services/security";

// Validation schemas for admin operations
const userRoleSchema = z.enum(["admin", "user"]);

const repositorySchema = z.object({
  name: z.string()
    .min(1, "Repository name is required")
    .max(255, "Repository name must be less than 255 characters")
    .regex(/^[a-zA-Z0-9\-_.]+$/, "Repository name can only contain letters, numbers, hyphens, underscores, and dots"),
  gitUrl: z.string()
    .url("Must be a valid URL")
    .regex(/^https?:\/\/.+\.git$|^git@.+:.+\.git$/, "Must be a valid Git repository URL"),
});

const permissionSchema = z.object({
  canCreateBranches: z.boolean(),
  branchLimit: z.number()
    .min(0, "Branch limit cannot be negative")
    .max(100, "Branch limit cannot exceed 100"),
  allowedBaseBranches: z.array(z.string().min(1))
    .min(1, "At least one base branch must be allowed")
    .max(20, "Cannot have more than 20 allowed base branches"),
  allowTerminalAccess: z.boolean(),
});

const extensionSchema = z.object({
  extensionId: z.string()
    .min(1, "Extension ID is required")
    .regex(/^[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+$/, "Extension ID must be in format 'publisher.extension'"),
  name: z.string()
    .min(1, "Extension name is required")
    .max(255, "Extension name must be less than 255 characters"),
  version: z.string()
    .min(1, "Extension version is required")
    .regex(/^\d+\.\d+\.\d+(-.*)?$/, "Version must be in semantic versioning format (e.g., 1.0.0)"),
});

export const adminRouter = createTRPCRouter({
  /**
   * Get all users in the system
   */
  getUsers: adminProcedure.query(async ({ ctx }) => {
    return await ctx.db
      .select()
      .from(users)
      .orderBy(desc(users.createdAt));
  }),

  /**
   * Update user role
   */
  updateUserRole: adminProcedure
    .input(
      z.object({
        userId: z.number().positive("User ID must be positive"),
        role: userRoleSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify user exists
      const existingUser = await ctx.db
        .select()
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);

      if (existingUser.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      const [updatedUser] = await ctx.db
        .update(users)
        .set({ role: input.role })
        .where(eq(users.id, input.userId))
        .returning();

      return updatedUser;
    }),

  /**
   * Get user statistics
   */
  getUserStats: adminProcedure.query(async ({ ctx }) => {
    const [totalUsers] = await ctx.db
      .select({ count: count() })
      .from(users);

    const [adminUsers] = await ctx.db
      .select({ count: count() })
      .from(users)
      .where(eq(users.role, "admin"));

    return {
      totalUsers: totalUsers?.count ?? 0,
      adminUsers: adminUsers?.count ?? 0,
      regularUsers: (totalUsers?.count ?? 0) - (adminUsers?.count ?? 0),
    };
  }),

  /**
   * Get all repositories
   */
  getRepositories: adminProcedure.query(async ({ ctx }) => {
    return await ctx.db
      .select()
      .from(repositories)
      .orderBy(desc(repositories.createdAt));
  }),

  /**
   * Add a new repository
   */
  addRepository: adminProcedure
    .input(repositorySchema)
    .mutation(async ({ input, ctx }) => {
      // Check if repository with same name or URL already exists
      const existingRepo = await ctx.db
        .select()
        .from(repositories)
        .where(eq(repositories.name, input.name))
        .limit(1);

      if (existingRepo.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Repository with this name already exists",
        });
      }

      const existingUrl = await ctx.db
        .select()
        .from(repositories)
        .where(eq(repositories.gitUrl, input.gitUrl))
        .limit(1);

      if (existingUrl.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Repository with this Git URL already exists",
        });
      }

      const customUserId = await getCustomUserIdFromAuthId(ctx.session.user.id);
      if (!customUserId) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to find user in custom table",
        });
      }

      // In a real implementation, you would:
      // 1. Validate the Git URL is accessible
      // 2. Generate deploy keys for the repository
      // 3. Store the keys securely

      const [newRepository] = await ctx.db
        .insert(repositories)
        .values({
          name: input.name,
          gitUrl: input.gitUrl,
          ownerId: customUserId,
        })
        .returning();

      return newRepository;
    }),

  /**
   * Update an existing repository
   */
  updateRepository: adminProcedure
    .input(
      z.object({
        repositoryId: z.number().positive("Repository ID must be positive"),
        name: repositorySchema.shape.name,
        gitUrl: repositorySchema.shape.gitUrl,
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify repository exists
      const existingRepo = await ctx.db
        .select()
        .from(repositories)
        .where(eq(repositories.id, input.repositoryId))
        .limit(1);

      if (existingRepo.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Repository not found",
        });
      }

      // Check for name conflicts (excluding current repository)
      const nameConflict = await ctx.db
        .select()
        .from(repositories)
        .where(
          and(
            eq(repositories.name, input.name),
            eq(repositories.id, input.repositoryId)
          )
        )
        .limit(1);

      if (nameConflict.length > 0 && nameConflict[0]!.id !== input.repositoryId) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Repository with this name already exists",
        });
      }

      const [updatedRepository] = await ctx.db
        .update(repositories)
        .set({
          name: input.name,
          gitUrl: input.gitUrl,
        })
        .where(eq(repositories.id, input.repositoryId))
        .returning();

      return updatedRepository;
    }),

  /**
   * Delete a repository
   */
  deleteRepository: adminProcedure
    .input(
      z.object({
        repositoryId: z.number().positive("Repository ID must be positive"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Check if repository exists
      const existingRepo = await ctx.db
        .select()
        .from(repositories)
        .where(eq(repositories.id, input.repositoryId))
        .limit(1);

      if (existingRepo.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Repository not found",
        });
      }

      // Check if there are active permissions for this repository
      const activePermissions = await ctx.db
        .select({ count: count() })
        .from(permissions)
        .where(eq(permissions.repositoryId, input.repositoryId));

      if ((activePermissions[0]?.count ?? 0) > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Cannot delete repository with active user permissions. Remove all permissions first.",
        });
      }

      // In a real implementation, you would also:
      // 1. Stop any active IDE sessions for this repository
      // 2. Clean up repository files and worktrees
      // 3. Revoke deploy keys

      const [deletedRepository] = await ctx.db
        .delete(repositories)
        .where(eq(repositories.id, input.repositoryId))
        .returning();

      return deletedRepository;
    }),

  /**
   * Get repository statistics
   */
  getRepositoryStats: adminProcedure.query(async ({ ctx }) => {
    const [totalRepos] = await ctx.db
      .select({ count: count() })
      .from(repositories);

    const [totalPermissions] = await ctx.db
      .select({ count: count() })
      .from(permissions);

    return {
      totalRepositories: totalRepos?.count ?? 0,
      totalPermissions: totalPermissions?.count ?? 0,
    };
  }),

  /**
   * Get all permissions
   */
  getPermissions: adminProcedure.query(async ({ ctx }) => {
    return await ctx.db
      .select({
        id: permissions.id,
        userId: permissions.userId,
        repositoryId: permissions.repositoryId,
        canCreateBranches: permissions.canCreateBranches,
        branchLimit: permissions.branchLimit,
        allowedBaseBranches: permissions.allowedBaseBranches,
        allowTerminalAccess: permissions.allowTerminalAccess,
        createdAt: permissions.createdAt,
        updatedAt: permissions.updatedAt,
        userName: users.githubUsername,
        userEmail: users.email,
        repositoryName: repositories.name,
      })
      .from(permissions)
      .leftJoin(users, eq(permissions.userId, users.id))
      .leftJoin(repositories, eq(permissions.repositoryId, repositories.id))
      .orderBy(desc(permissions.createdAt));
  }),

  /**
   * Manage user permissions for a repository
   */
  managePermissions: adminProcedure
    .input(
      z.object({
        userId: z.number().positive("User ID must be positive"),
        repositoryId: z.number().positive("Repository ID must be positive"),
        permissions: permissionSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify user exists
      const userExists = await ctx.db
        .select()
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);

      if (userExists.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      // Verify repository exists
      const repoExists = await ctx.db
        .select()
        .from(repositories)
        .where(eq(repositories.id, input.repositoryId))
        .limit(1);

      if (repoExists.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Repository not found",
        });
      }

      // Check if permission already exists
      const existingPermission = await ctx.db
        .select()
        .from(permissions)
        .where(
          and(
            eq(permissions.userId, input.userId),
            eq(permissions.repositoryId, input.repositoryId)
          )
        )
        .limit(1);

      if (existingPermission.length > 0) {
        // Update existing permission
        const [updatedPermission] = await ctx.db
          .update(permissions)
          .set({
            canCreateBranches: input.permissions.canCreateBranches,
            branchLimit: input.permissions.branchLimit,
            allowedBaseBranches: input.permissions.allowedBaseBranches,
            allowTerminalAccess: input.permissions.allowTerminalAccess,
          })
          .where(eq(permissions.id, existingPermission[0]!.id))
          .returning();

        return updatedPermission;
      } else {
        // Create new permission
        const [newPermission] = await ctx.db
          .insert(permissions)
          .values({
            userId: input.userId,
            repositoryId: input.repositoryId,
            canCreateBranches: input.permissions.canCreateBranches,
            branchLimit: input.permissions.branchLimit,
            allowedBaseBranches: input.permissions.allowedBaseBranches,
            allowTerminalAccess: input.permissions.allowTerminalAccess,
          })
          .returning();

        return newPermission;
      }
    }),

  /**
   * Remove user permissions for a repository
   */
  removePermissions: adminProcedure
    .input(
      z.object({
        userId: z.number().positive("User ID must be positive"),
        repositoryId: z.number().positive("Repository ID must be positive"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const existingPermission = await ctx.db
        .select()
        .from(permissions)
        .where(
          and(
            eq(permissions.userId, input.userId),
            eq(permissions.repositoryId, input.repositoryId)
          )
        )
        .limit(1);

      if (existingPermission.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Permission not found",
        });
      }

      const [deletedPermission] = await ctx.db
        .delete(permissions)
        .where(eq(permissions.id, existingPermission[0]!.id))
        .returning();

      return deletedPermission;
    }),

  /**
   * Get permissions for a specific user
   */
  getUserPermissions: adminProcedure
    .input(
      z.object({
        userId: z.number().positive("User ID must be positive"),
      })
    )
    .query(async ({ input, ctx }) => {
      return await ctx.db
        .select({
          id: permissions.id,
          repositoryId: permissions.repositoryId,
          canCreateBranches: permissions.canCreateBranches,
          branchLimit: permissions.branchLimit,
          allowedBaseBranches: permissions.allowedBaseBranches,
          allowTerminalAccess: permissions.allowTerminalAccess,
          repositoryName: repositories.name,
          repositoryUrl: repositories.gitUrl,
        })
        .from(permissions)
        .leftJoin(repositories, eq(permissions.repositoryId, repositories.id))
        .where(eq(permissions.userId, input.userId));
    }),

  /**
   * Get all extensions
   */
  getExtensions: adminProcedure.query(async ({ ctx }) => {
    return await ctx.db
      .select()
      .from(extensions)
      .orderBy(desc(extensions.createdAt));
  }),

  /**
   * Install a new extension
   */
  installExtension: adminProcedure
    .input(extensionSchema)
    .mutation(async ({ input, ctx }) => {
      // Check if extension already exists
      const existingExtension = await ctx.db
        .select()
        .from(extensions)
        .where(eq(extensions.extensionId, input.extensionId))
        .limit(1);

      if (existingExtension.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Extension with this ID already exists",
        });
      }

      const customUserId = await getCustomUserIdFromAuthId(ctx.session.user.id);
      if (!customUserId) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to find user in custom table",
        });
      }

      // In a real implementation, you would:
      // 1. Validate the extension exists in the VS Code marketplace
      // 2. Download and install the extension
      // 3. Update the shared extension volume

      const [newExtension] = await ctx.db
        .insert(extensions)
        .values({
          extensionId: input.extensionId,
          name: input.name,
          version: input.version,
          installedBy: customUserId,
        })
        .returning();

      return newExtension;
    }),

  /**
   * Update an existing extension
   */
  updateExtension: adminProcedure
    .input(
      z.object({
        id: z.number().positive("Extension ID must be positive"),
        name: extensionSchema.shape.name,
        version: extensionSchema.shape.version,
      })
    )
    .mutation(async ({ input, ctx }) => {
      const existingExtension = await ctx.db
        .select()
        .from(extensions)
        .where(eq(extensions.id, input.id))
        .limit(1);

      if (existingExtension.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Extension not found",
        });
      }

      const [updatedExtension] = await ctx.db
        .update(extensions)
        .set({
          name: input.name,
          version: input.version,
        })
        .where(eq(extensions.id, input.id))
        .returning();

      return updatedExtension;
    }),

  /**
   * Toggle extension enabled status
   */
  toggleExtension: adminProcedure
    .input(
      z.object({
        extensionId: z.number().positive("Extension ID must be positive"),
        enabled: z.boolean(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const existingExtension = await ctx.db
        .select()
        .from(extensions)
        .where(eq(extensions.id, input.extensionId))
        .limit(1);

      if (existingExtension.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Extension not found",
        });
      }

      const [updatedExtension] = await ctx.db
        .update(extensions)
        .set({ enabled: input.enabled })
        .where(eq(extensions.id, input.extensionId))
        .returning();

      return updatedExtension;
    }),

  /**
   * Delete an extension
   */
  deleteExtension: adminProcedure
    .input(
      z.object({
        extensionId: z.number().positive("Extension ID must be positive"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const existingExtension = await ctx.db
        .select()
        .from(extensions)
        .where(eq(extensions.id, input.extensionId))
        .limit(1);

      if (existingExtension.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Extension not found",
        });
      }

      // In a real implementation, you would:
      // 1. Remove the extension from the shared extension volume
      // 2. Update any active IDE sessions

      const [deletedExtension] = await ctx.db
        .delete(extensions)
        .where(eq(extensions.id, input.extensionId))
        .returning();

      return deletedExtension;
    }),

  /**
   * Search extensions
   */
  searchExtensions: adminProcedure
    .input(
      z.object({
        query: z.string().min(1, "Search query is required"),
        enabled: z.boolean().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const conditions = [like(extensions.name, `%${input.query}%`)];

      if (input.enabled !== undefined) {
        conditions.push(eq(extensions.enabled, input.enabled));
      }

      return await ctx.db
        .select()
        .from(extensions)
        .where(and(...conditions))
        .orderBy(desc(extensions.createdAt));
    }),

  /**
   * Get extension statistics
   */
  getExtensionStats: adminProcedure.query(async ({ ctx }) => {
    const [totalExtensions] = await ctx.db
      .select({ count: count() })
      .from(extensions);

    const [enabledExtensions] = await ctx.db
      .select({ count: count() })
      .from(extensions)
      .where(eq(extensions.enabled, true));

    return {
      totalExtensions: totalExtensions?.count ?? 0,
      enabledExtensions: enabledExtensions?.count ?? 0,
      disabledExtensions: (totalExtensions?.count ?? 0) - (enabledExtensions?.count ?? 0),
    };
  }),

  /**
   * Get system overview statistics
   */
  getSystemStats: adminProcedure.query(async ({ ctx }) => {
    const [userStats] = await ctx.db.select({ count: count() }).from(users);
    const [adminStats] = await ctx.db.select({ count: count() }).from(users).where(eq(users.role, "admin"));
    const [repoStats] = await ctx.db.select({ count: count() }).from(repositories);
    const [permissionStats] = await ctx.db.select({ count: count() }).from(permissions);
    const [extensionStats] = await ctx.db.select({ count: count() }).from(extensions);
    const [enabledExtensionStats] = await ctx.db.select({ count: count() }).from(extensions).where(eq(extensions.enabled, true));

    return {
      users: {
        total: userStats?.count ?? 0,
        admins: adminStats?.count ?? 0,
        regular: (userStats?.count ?? 0) - (adminStats?.count ?? 0),
      },
      repositories: {
        total: repoStats?.count ?? 0,
      },
      permissions: {
        total: permissionStats?.count ?? 0,
      },
      extensions: {
        total: extensionStats?.count ?? 0,
        enabled: enabledExtensionStats?.count ?? 0,
        disabled: (extensionStats?.count ?? 0) - (enabledExtensionStats?.count ?? 0),
      },
    };
  }),

  /**
   * Bulk update user roles
   */
  bulkUpdateUserRoles: adminProcedure
    .input(
      z.object({
        userIds: z.array(z.number().positive()).min(1, "At least one user ID is required"),
        role: userRoleSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify all users exist
      const existingUsers = await ctx.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, input.userIds[0]!)); // This is a simplified check

      const updatedUsers = [];
      for (const userId of input.userIds) {
        const [updatedUser] = await ctx.db
          .update(users)
          .set({ role: input.role })
          .where(eq(users.id, userId))
          .returning();

        if (updatedUser) {
          updatedUsers.push(updatedUser);
        }
      }

      return updatedUsers;
    }),

  /**
   * Get security metrics and violations
   */
  getSecurityMetrics: adminProcedure.query(async ({ ctx }) => {
    try {
      const securityService = getSecurityService();
      const dockerService = getDockerService();

      // Get security metrics
      const securityMetrics = securityService.getSecurityMetrics();

      // Get system stats with security information
      const systemStats = await dockerService.getSystemStats();

      return {
        violations: securityMetrics,
        systemStats: systemStats.securityMetrics,
        containerStats: {
          total: systemStats.containerCount,
          cpuUsage: systemStats.totalCpuUsage,
          memoryUsage: systemStats.totalMemoryUsage,
        },
      };
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to get security metrics",
        cause: error,
      });
    }
  }),

  /**
   * Get security violations for a specific user
   */
  getUserSecurityViolations: adminProcedure
    .input(
      z.object({
        userId: z.number().positive("User ID must be positive"),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const securityService = getSecurityService();
        return securityService.getUserViolations(input.userId);
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get user security violations",
          cause: error,
        });
      }
    }),

  /**
   * Monitor all active sessions for security compliance
   */
  monitorSessionSecurity: adminProcedure.query(async ({ ctx }) => {
    try {
      const sessionManager = getSessionManager();
      const healthChecks = await sessionManager.performHealthChecks();

      return healthChecks.map(check => ({
        sessionId: check.sessionId,
        healthy: check.healthy,
        securityCompliant: check.securityCompliant ?? false,
        securityViolations: check.securityViolations ?? [],
        resourceUsage: check.resourceUsage,
        error: check.error,
      }));
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to monitor session security",
        cause: error,
      });
    }
  }),



  /**
   * Get detailed container security information
   */
  getContainerSecurity: adminProcedure
    .input(
      z.object({
        containerId: z.string().min(1, "Container ID is required"),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const dockerService = getDockerService();
        return await dockerService.monitorContainerSecurity(input.containerId);
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get container security information",
          cause: error,
        });
      }
    }),

  /**
   * Clear old security violations (cleanup)
   */
  clearOldSecurityViolations: adminProcedure
    .input(
      z.object({
        olderThanDays: z.number().min(1).max(365).default(30),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const securityService = getSecurityService();
        const clearedCount = securityService.clearOldViolations(input.olderThanDays);

        return {
          success: true,
          clearedCount,
          message: `Cleared ${clearedCount} security violations older than ${input.olderThanDays} days`,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to clear old security violations",
          cause: error,
        });
      }
    }),

  /**
   * Perform comprehensive security audit on all sessions
   */
  performSecurityAudit: adminProcedure.query(async ({ ctx }) => {
    try {
      const sessionManager = getSessionManager();
      const auditResults = await sessionManager.performSecurityAudit();

      return {
        success: true,
        audits: auditResults,
        summary: {
          totalSessions: auditResults.length,
          compliantSessions: auditResults.filter(a => a.audit.compliant).length,
          criticalRisk: auditResults.filter(a => a.audit.riskLevel === 'critical').length,
          highRisk: auditResults.filter(a => a.audit.riskLevel === 'high').length,
          mediumRisk: auditResults.filter(a => a.audit.riskLevel === 'medium').length,
          lowRisk: auditResults.filter(a => a.audit.riskLevel === 'low').length,
        },
      };
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to perform security audit",
        cause: error,
      });
    }
  }),

  /**
   * Validate terminal command for a specific session
   */
  validateTerminalCommand: adminProcedure
    .input(
      z.object({
        sessionId: z.string(),
        command: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const sessionManager = getSessionManager();
        const result = await sessionManager.validateTerminalCommand(input.sessionId, input.command);

        return {
          success: true,
          allowed: result.allowed,
          reason: result.reason,
          command: input.command,
          sessionId: input.sessionId,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to validate terminal command",
          cause: error,
        });
      }
    }),

  /**
   * Validate file access for a specific session
   */
  validateFileAccess: adminProcedure
    .input(
      z.object({
        sessionId: z.string(),
        filePath: z.string(),
        operation: z.enum(['read', 'write', 'execute']),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const sessionManager = getSessionManager();
        const result = await sessionManager.validateFileAccess(
          input.sessionId,
          input.filePath,
          input.operation
        );

        return {
          success: true,
          allowed: result.allowed,
          reason: result.reason,
          filePath: input.filePath,
          operation: input.operation,
          sessionId: input.sessionId,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to validate file access",
          cause: error,
        });
      }
    }),

  /**
   * Validate network access for a specific session
   */
  validateNetworkAccess: adminProcedure
    .input(
      z.object({
        sessionId: z.string(),
        destination: z.string(),
        port: z.number().min(1).max(65535),
        protocol: z.enum(['tcp', 'udp']).default('tcp'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const sessionManager = getSessionManager();
        const result = await sessionManager.validateNetworkAccess(
          input.sessionId,
          input.destination,
          input.port,
          input.protocol
        );

        return {
          success: true,
          allowed: result.allowed,
          reason: result.reason,
          destination: input.destination,
          port: input.port,
          protocol: input.protocol,
          sessionId: input.sessionId,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to validate network access",
          cause: error,
        });
      }
    }),
});