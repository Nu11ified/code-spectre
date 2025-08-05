import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { db } from "@/server/db"; // your drizzle instance
import { users } from "@/server/db/schema";
import { env } from "@/env";
import { eq } from "drizzle-orm";

export const auth = betterAuth({
    database: drizzleAdapter(db, {
        provider: "pg", // or "mysql", "sqlite"
    }),
    socialProviders: {
        github: {
            clientId: env.GITHUB_CLIENT_ID,
            clientSecret: env.GITHUB_CLIENT_SECRET,
            scope: ["user:email", "repo", "admin:repo_hook", "admin:public_key"],
        },
    },
    hooks: {
        after: createAuthMiddleware(async (ctx) => {
            // Check if this is a social sign-in or sign-up
            if (ctx.path === "/sign-up/social" || ctx.path === "/sign-in/social") {
                const returned = ctx.context.returned as any;
                const user = returned?.user;
                if (!user) return;

                // Sync user data to our custom users table
                try {
                    // Check if user already exists in our custom table
                    const existingUser = await db
                        .select()
                        .from(users)
                        .where(eq(users.githubId, user.id))
                        .limit(1);

                    if (existingUser.length === 0) {
                        // Create new user in our custom table
                        await db.insert(users).values({
                            githubId: user.id,
                            githubUsername: user.name || "unknown",
                            email: user.email,
                            role: user.email === env.ADMIN_EMAIL ? "admin" : "user",
                        });
                    } else {
                        // Update existing user
                        await db
                            .update(users)
                            .set({
                                githubUsername: user.name || "unknown",
                                email: user.email,
                                role: user.email === env.ADMIN_EMAIL ? "admin" : "user",
                            })
                            .where(eq(users.githubId, user.id));
                    }
                } catch (error) {
                    console.error("Error syncing user to custom table:", error);
                }
            }
        }),
    },
});