/**
 * YOU PROBABLY DON'T NEED TO EDIT THIS FILE, UNLESS:
 * 1. You want to modify request context (see Part 1).
 * 2. You want to create a new middleware or type of procedure (see Part 3).
 *
 * TL;DR - This is where all the tRPC server stuff is created and plugged in. The pieces you will
 * need to use are documented accordingly near the end.
 */
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";

import { db } from "@/server/db";
import { auth } from "@/lib/auth";
import { env } from "@/env";
import { getCustomUserFromAuthId } from "@/lib/user-utils";
import { apiLogger, createTimer } from "@/lib/logger";
import { AppError, ErrorHandler, globalErrorHandler } from "@/lib/errors";
import { ensureServicesInitialized } from "@/server/init";

/**
 * 1. CONTEXT
 *
 * This section defines the "contexts" that are available in the backend API.
 *
 * These allow you to access things when processing a request, like the database, the session, etc.
 *
 * This helper generates the "internals" for a tRPC context. The API handler and RSC clients each
 * wrap this and provides the required context.
 *
 * @see https://trpc.io/docs/server/context
 */
export const createTRPCContext = async (opts: { headers: Headers }) => {
  // Ensure services are initialized
  await ensureServicesInitialized();
  
  // Generate request ID for tracing
  const requestId = generateRequestId();
  
  // Get session from Better Auth
  const session = await auth.api.getSession({
    headers: opts.headers,
  });

  // Create logger with request context
  const logger = apiLogger.child({
    requestId,
    userId: session?.user?.id,
    userEmail: session?.user?.email,
  });

  return {
    db,
    session,
    user: session?.user ?? null,
    logger,
    requestId,
    errorHandler: new ErrorHandler(logger),
    ...opts,
  };
};

/**
 * Generate unique request ID for tracing
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 2. INITIALIZATION
 *
 * This is where the tRPC API is initialized, connecting the context and transformer. We also parse
 * ZodErrors so that you get typesafety on the frontend if your procedure fails due to validation
 * errors on the backend.
 */
const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error, ctx }) {
    // Enhanced error formatting with logging and user-friendly messages
    const logger = ctx?.logger || apiLogger;
    
    // Log the error with context
    if (error.cause instanceof AppError) {
      // AppError is already handled by ErrorHandler
      const userFriendlyMessage = globalErrorHandler.createUserFriendlyMessage(error.cause);
      const recoverySuggestions = globalErrorHandler.getRecoverySuggestions(error.cause);
      
      return {
        ...shape,
        message: userFriendlyMessage,
        data: {
          ...shape.data,
          code: error.cause.code,
          suggestions: recoverySuggestions,
          zodError: null,
          timestamp: error.cause.timestamp.toISOString(),
        },
      };
    }
    
    if (error.cause instanceof ZodError) {
      logger.warn('Validation error in tRPC procedure', {
        zodError: error.cause.flatten(),
      });
      
      return {
        ...shape,
        message: 'Invalid input provided',
        data: {
          ...shape.data,
          zodError: error.cause.flatten(),
          suggestions: ['Please check your input and try again'],
        },
      };
    }
    
    // Handle unexpected errors
    if (error.code === 'INTERNAL_SERVER_ERROR') {
      logger.error('Unhandled error in tRPC procedure', error.cause, {
        code: error.code,
      });
      
      return {
        ...shape,
        message: 'An unexpected error occurred. Please try again.',
        data: {
          ...shape.data,
          suggestions: ['Try again in a few moments', 'Contact support if the problem persists'],
          zodError: null,
        },
      };
    }
    
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: null,
      },
    };
  },
});

/**
 * Create a server-side caller.
 *
 * @see https://trpc.io/docs/server/server-side-calls
 */
export const createCallerFactory = t.createCallerFactory;

/**
 * 3. ROUTER & PROCEDURE (THE IMPORTANT BIT)
 *
 * These are the pieces you use to build your tRPC API. You should import these a lot in the
 * "/src/server/api/routers" directory.
 */

/**
 * This is how you create new routers and sub-routers in your tRPC API.
 *
 * @see https://trpc.io/docs/router
 */
export const createTRPCRouter = t.router;

/**
 * Enhanced middleware for timing, logging, and error handling
 */
const loggingMiddleware = t.middleware(async ({ next, path, ctx, type, input }) => {
  const timer = createTimer(ctx.logger, `${type}:${path}`, {
    path,
    type,
    userId: ctx.user?.id,
    requestId: ctx.requestId,
  });

  // Log procedure start
  ctx.logger.debug(`Starting ${type} procedure: ${path}`, {
    input: type === 'query' ? input : '[REDACTED]', // Don't log mutation inputs for security
  });

  if (t._config.isDev) {
    // artificial delay in dev
    const waitMs = Math.floor(Math.random() * 400) + 100;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  try {
    const result = await next();
    
    const duration = timer.end({
      success: true,
      resultSize: JSON.stringify(result).length,
    });

    // Log slow procedures
    if (duration > 2000) {
      ctx.logger.warn(`Slow procedure detected: ${path}`, {
        duration,
        path,
        type,
      });
    }

    return result;
  } catch (error) {
    timer.endWithError(error, {
      success: false,
      errorType: error instanceof Error ? error.constructor.name : 'Unknown',
    });

    // Handle and convert errors
    const handledError = ctx.errorHandler.handleError(error, {
      path,
      type,
      userId: ctx.user?.id,
      requestId: ctx.requestId,
    });

    // Convert to tRPC error
    throw handledError.toTRPCError();
  }
});

/**
 * Public (unauthenticated) procedure
 *
 * This is the base piece you use to build new queries and mutations on your tRPC API. It does not
 * guarantee that a user querying is authorized, but you can still access user session data if they
 * are logged in.
 */
export const publicProcedure = t.procedure.use(loggingMiddleware);

/**
 * Protected (authenticated) procedure
 *
 * If you want a query or mutation to ONLY be accessible to logged in users, use this. It verifies
 * the session is valid and guarantees `ctx.session.user` is not null.
 */
export const protectedProcedure = t.procedure
  .use(loggingMiddleware)
  .use(({ ctx, next }) => {
    if (!ctx.session?.user) {
      ctx.logger.warn('Unauthorized access attempt', {
        path: 'protected-procedure',
        hasSession: !!ctx.session,
        requestId: ctx.requestId,
      });
      throw new AppError(
        'UNAUTHORIZED' as any,
        'Authentication required',
        401,
        true,
        { requestId: ctx.requestId }
      ).toTRPCError();
    }
    
    ctx.logger.debug('Authenticated user accessing protected procedure', {
      userId: ctx.session.user.id,
      userEmail: ctx.session.user.email,
    });
    
    return next({
      ctx: {
        ...ctx,
        // infers the `session` as non-nullable
        session: { ...ctx.session, user: ctx.session.user },
      },
    });
  });

/**
 * Admin procedure
 *
 * If you want a query or mutation to ONLY be accessible to admin users, use this. It verifies
 * the session is valid and the user is an admin.
 */
export const adminProcedure = t.procedure
  .use(loggingMiddleware)
  .use(async ({ ctx, next }) => {
    if (!ctx.session?.user) {
      ctx.logger.warn('Unauthorized admin access attempt', {
        path: 'admin-procedure',
        hasSession: !!ctx.session,
        requestId: ctx.requestId,
      });
      throw new AppError(
        'UNAUTHORIZED' as any,
        'Authentication required',
        401,
        true,
        { requestId: ctx.requestId }
      ).toTRPCError();
    }
    
    // Check if user is admin by email first (quick check)
    let isAdmin = ctx.session.user.email === env.ADMIN_EMAIL;
    
    // If not admin by email, check the custom user table
    if (!isAdmin) {
      try {
        const customUser = await getCustomUserFromAuthId(ctx.session.user.id);
        isAdmin = customUser?.role === 'admin';
      } catch (error) {
        ctx.logger.error('Failed to check admin status', error, {
          userId: ctx.session.user.id,
          requestId: ctx.requestId,
        });
        throw new AppError(
          'DATABASE_ERROR' as any,
          'Failed to verify admin permissions',
          500,
          true,
          { requestId: ctx.requestId }
        ).toTRPCError();
      }
    }
    
    if (!isAdmin) {
      ctx.logger.warn('Forbidden admin access attempt', {
        userId: ctx.session.user.id,
        userEmail: ctx.session.user.email,
        requestId: ctx.requestId,
      });
      throw new AppError(
        'FORBIDDEN' as any,
        'Admin privileges required',
        403,
        true,
        { 
          userId: ctx.session.user.id,
          requestId: ctx.requestId 
        }
      ).toTRPCError();
    }
    
    ctx.logger.debug('Admin user accessing admin procedure', {
      userId: ctx.session.user.id,
      userEmail: ctx.session.user.email,
      adminMethod: isAdmin ? 'email' : 'database',
    });
    
    return next({
      ctx: {
        ...ctx,
        // infers the `session` as non-nullable
        session: { ...ctx.session, user: ctx.session.user },
      },
    });
  });
