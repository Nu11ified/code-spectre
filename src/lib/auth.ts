import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { db } from "@/server/db";
import { env } from "@/env";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    // If we later import Better Auth tables into our Drizzle schema, we can
    // map them explicitly via `schema: { user: schema.user, ... }`.
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
      mapProfileToUser: (profile: any) => ({
        // Better Auth default fields
        name: profile.name ?? profile.login ?? "",
        email: profile.email,
        image: profile.avatar_url,
      }),
    },
  },
  // Optionally set base URL if deploying behind a different domain
  baseURL: process.env.BETTER_AUTH_URL ?? undefined,
  plugins: [nextCookies()],
});

export type Auth = typeof auth;

