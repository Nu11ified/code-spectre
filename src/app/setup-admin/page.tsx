import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { env } from "@/env";

async function setupAdmin() {
    "use server";

    const session = await auth.api.getSession({
        headers: await headers(),
    });

    if (!session?.user) {
        throw new Error("No session found");
    }

    try {
        // Check if user already exists in our custom table
        const existingUser = await db
            .select()
            .from(users)
            .where(eq(users.githubId, session.user.id))
            .limit(1);

        if (existingUser.length === 0) {
            // Create new user in our custom table
            await db.insert(users).values({
                githubId: session.user.id,
                githubUsername: session.user.name || "unknown",
                email: session.user.email,
                role: "admin", // Force admin role
            });
            console.log("Admin user created successfully!");
        } else {
            // Update existing user to admin
            await db
                .update(users)
                .set({
                    githubUsername: session.user.name || "unknown",
                    email: session.user.email,
                    role: "admin", // Force admin role
                })
                .where(eq(users.githubId, session.user.id));
            console.log("User updated to admin successfully!");
        }
    } catch (error) {
        console.error("Error setting up admin:", error);
        throw new Error(`Failed to setup admin: ${error}`);
    }

    // Redirect to admin panel after successful setup (outside try-catch)
    redirect("/admin");
}

export default async function SetupAdminPage() {
    const session = await auth.api.getSession({
        headers: await headers(),
    });

    if (!session?.user) {
        return (
            <div className="p-6">
                <h1 className="text-2xl font-bold mb-4">Setup Admin Access</h1>
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                    <strong>Error:</strong> You must be signed in to set up admin access.
                </div>
                <div className="mt-4">
                    <a href="/" className="text-blue-600 underline">Go back to home page and sign in</a>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-4">Setup Admin Access</h1>

            <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded mb-4">
                <strong>Current User:</strong>
                <ul className="mt-2 list-disc list-inside">
                    <li>Email: {session.user.email}</li>
                    <li>Name: {session.user.name}</li>
                    <li>ID: {session.user.id}</li>
                </ul>
            </div>

            <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded mb-4">
                <strong>Admin Email in Config:</strong> {env.ADMIN_EMAIL}
                <br />
                {session.user.email === env.ADMIN_EMAIL ? (
                    <span className="text-green-600 font-bold">✅ Your email matches the admin email!</span>
                ) : (
                    <span className="text-red-600 font-bold">❌ Your email does not match the admin email.</span>
                )}
            </div>

            <form action={setupAdmin}>
                <button
                    type="submit"
                    className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                >
                    Setup Admin Access
                </button>
            </form>

            <div className="mt-4">
                <p className="text-sm text-gray-600">
                    This will create or update your user record in the custom users table, grant admin privileges, and redirect you to the admin panel.
                </p>
            </div>

            <div className="mt-6">
                <h2 className="text-lg font-semibold mb-2">After Setup:</h2>
                <ul className="list-disc list-inside text-sm text-gray-600">
                    <li>Visit <a href="/debug-admin" className="text-blue-600 underline">/debug-admin</a> to verify your admin status</li>
                    <li>Try accessing <a href="/admin" className="text-blue-600 underline">/admin</a> again</li>
                </ul>
            </div>
        </div>
    );
}