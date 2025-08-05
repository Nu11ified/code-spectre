import { healthRouter } from "@/server/api/routers/health";
import { authRouter } from "@/server/api/routers/auth";
import { adminRouter } from "@/server/api/routers/admin";
import { dashboardRouter } from "@/server/api/routers/dashboard";
import { sessionRouter } from "@/server/api/routers/session";
import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  health: healthRouter,
  auth: authRouter,
  admin: adminRouter,
  dashboard: dashboardRouter,
  session: sessionRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
