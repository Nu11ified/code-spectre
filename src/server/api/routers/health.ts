import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";

export const healthRouter = createTRPCRouter({
  check: publicProcedure.query(() => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      message: "Cloud IDE Orchestrator API is running",
    };
  }),

  echo: publicProcedure
    .input(z.object({ message: z.string() }))
    .query(({ input }) => {
      return {
        echo: input.message,
        timestamp: new Date().toISOString(),
      };
    }),
});