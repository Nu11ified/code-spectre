import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { repositories, permissions } from "@/server/db/schema";
import { eq, and } from "drizzle-orm";
import { getCustomUserIdFromAuthId } from "@/lib/user-utils";
import { TRPCError } from "@trpc/server";
import { getGitService, GitService } from "@/server/services/git";

// Validation schemas for dashboard operations
const branchNameSchema = z.string()
    .min(1, "Branch name is required")
    .max(100, "Branch name must be less than 100 characters")
    .refine((name) => {
        const validation = GitService.validateBranchName(name);
        return validation.valid;
    }, (name) => {
        const validation = GitService.validateBranchName(name);
        return { message: validation.error || "Invalid branch name" };
    })
    .refine((name) => {
        // Additional convention check for this application
        return /^(feat|fix|hotfix|chore|docs|style|refactor|test)\/[a-zA-Z0-9\-_]+$/.test(name);
    }, "Branch name must follow convention: feat/, fix/, hotfix/, chore/, docs/, style/, refactor/, or test/ followed by alphanumeric characters, hyphens, or underscores");

const baseBranchSchema = z.string()
    .min(1, "Base branch is required")
    .max(100, "Base branch name must be less than 100 characters");

export const dashboardRouter = createTRPCRouter({
    /**
     * Get repositories accessible to the current user
     */
    getMyRepositories: protectedProcedure.query(async ({ ctx }) => {
        const customUserId = await getCustomUserIdFromAuthId(ctx.session.user.id);
        if (!customUserId) {
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to find user in custom table",
            });
        }

        // Get repositories the user has permissions for
        const userRepositories = await ctx.db
            .select({
                id: repositories.id,
                name: repositories.name,
                gitUrl: repositories.gitUrl,
                createdAt: repositories.createdAt,
                canCreateBranches: permissions.canCreateBranches,
                branchLimit: permissions.branchLimit,
                allowedBaseBranches: permissions.allowedBaseBranches,
                allowTerminalAccess: permissions.allowTerminalAccess,
            })
            .from(repositories)
            .innerJoin(permissions, eq(repositories.id, permissions.repositoryId))
            .where(eq(permissions.userId, customUserId));

        return userRepositories;
    }),

    /**
     * Get branches for a specific repository
     */
    getRepositoryBranches: protectedProcedure
        .input(
            z.object({
                repositoryId: z.number().positive("Repository ID must be positive"),
            })
        )
        .query(async ({ input, ctx }) => {
            const customUserId = await getCustomUserIdFromAuthId(ctx.session.user.id);
            if (!customUserId) {
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Failed to find user in custom table",
                });
            }

            // Verify user has permission to access this repository
            const permission = await ctx.db
                .select({
                    repositoryId: permissions.repositoryId,
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

            try {
                const gitService = getGitService();
                
                // Ensure repository is cloned/updated locally
                const cloneResult = await gitService.cloneRepository(
                    permission[0]!.gitUrl,
                    input.repositoryId
                );

                if (!cloneResult.success) {
                    throw new TRPCError({
                        code: "INTERNAL_SERVER_ERROR",
                        message: cloneResult.error || "Failed to clone repository",
                    });
                }

                // Update repository to get latest branches
                await gitService.updateRepository(input.repositoryId);

                // Fetch branches
                const branches = await gitService.listBranches(input.repositoryId);

                return branches.map(branch => branch.name);
            } catch (error) {
                if (error instanceof TRPCError) {
                    throw error;
                }
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Failed to fetch repository branches",
                });
            }
        }),

    /**
     * Create a new branch in a repository
     */
    createBranch: protectedProcedure
        .input(
            z.object({
                repositoryId: z.number().positive("Repository ID must be positive"),
                branchName: branchNameSchema,
                baseBranch: baseBranchSchema,
            })
        )
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

            // Check if user can create branches
            if (!userPermission.canCreateBranches) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "You do not have permission to create branches in this repository",
                });
            }

            // Check if base branch is allowed
            if (!userPermission.allowedBaseBranches.includes(input.baseBranch)) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: `Base branch '${input.baseBranch}' is not allowed. Allowed base branches: ${userPermission.allowedBaseBranches.join(", ")}`,
                });
            }

            // TODO: Check branch limit (would need to count existing branches created by user)
            // This would require tracking branch creation in the database or querying Git history

            try {
                const gitService = getGitService();
                
                // Ensure repository is cloned/updated locally
                const cloneResult = await gitService.cloneRepository(
                    userPermission.gitUrl,
                    input.repositoryId
                );

                if (!cloneResult.success) {
                    throw new TRPCError({
                        code: "INTERNAL_SERVER_ERROR",
                        message: cloneResult.error || "Failed to clone repository",
                    });
                }

                // Create the branch
                const createResult = await gitService.createBranch(
                    input.repositoryId,
                    input.branchName,
                    input.baseBranch
                );

                if (!createResult.success) {
                    throw new TRPCError({
                        code: "INTERNAL_SERVER_ERROR",
                        message: createResult.error || "Failed to create branch",
                    });
                }

                return {
                    success: true,
                    branchName: input.branchName,
                    baseBranch: input.baseBranch,
                    message: `Branch '${input.branchName}' created successfully from '${input.baseBranch}'`,
                };
            } catch (error) {
                if (error instanceof TRPCError) {
                    throw error;
                }
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Failed to create branch",
                });
            }
        }),

    /**
     * Get user's branch creation statistics
     */
    getBranchStats: protectedProcedure
        .input(
            z.object({
                repositoryId: z.number().positive("Repository ID must be positive"),
            })
        )
        .query(async ({ input, ctx }) => {
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
                    branchLimit: permissions.branchLimit,
                    allowedBaseBranches: permissions.allowedBaseBranches,
                })
                .from(permissions)
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

            // TODO: In a real implementation, you would track branch creation
            // and count how many branches the user has created
            const branchesCreated = 0; // Placeholder

            return {
                branchLimit: userPermission.branchLimit,
                branchesCreated,
                remainingBranches: Math.max(0, userPermission.branchLimit - branchesCreated),
                allowedBaseBranches: userPermission.allowedBaseBranches,
            };
        }),
});