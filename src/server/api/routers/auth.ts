import { z } from "zod";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "@/server/api/trpc";
import { env } from "@/env";

export const authRouter = createTRPCRouter({
  /**
   * Get current session information
   */
  getSession: publicProcedure.query(({ ctx }) => {
    return ctx.session;
  }),

  /**
   * Get current user information (protected)
   */
  getMe: protectedProcedure.query(({ ctx }) => {
    return {
      user: ctx.session.user,
      isAdmin: ctx.session.user.email === env.ADMIN_EMAIL,
    };
  }),

  /**
   * Check if current user is admin
   */
  isAdmin: protectedProcedure.query(({ ctx }) => {
    return ctx.session.user.email === env.ADMIN_EMAIL;
  }),
});