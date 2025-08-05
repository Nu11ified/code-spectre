import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { eq } from "drizzle-orm";

/**
 * Get the custom user table ID from a Better Auth user ID
 */
export async function getCustomUserIdFromAuthId(authUserId: string): Promise<number | null> {
  try {
    const result = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.githubId, authUserId))
      .limit(1);

    return result[0]?.id ?? null;
  } catch (error) {
    console.error("Error getting custom user ID:", error);
    return null;
  }
}

/**
 * Get the custom user record from a Better Auth user ID
 */
export async function getCustomUserFromAuthId(authUserId: string) {
  try {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.githubId, authUserId))
      .limit(1);

    return result[0] ?? null;
  } catch (error) {
    console.error("Error getting custom user:", error);
    return null;
  }
}