import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getCustomUserIdFromAuthId } from "@/lib/user-utils";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { eq } from "drizzle-orm";

export default async function DebugAdminPage() {
    const session = await auth.api.getSession({
        headers: await headers(),
    });

    console.log("Session:", session);

    if (!session?.user) {
        return (
            <div className="p-6">
                <h1 className="text-2xl font-bold mb-4">Debug Admin Access</h1>
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                    <strong>Issue:</strong> No session or user found
                </div>
                <div className="mt-4">
                    <p>Please sign in first to access admin features.</p>
                </div>
            </div>
        );
    }

    const customUserId = await getCustomUserIdFromAuthId(session.user.id);
    console.log("Custom User ID:", customUserId);

    if (!customUserId) {
        return (
            <div className="p-6">
                <h1 className="text-2xl font-bold mb-4">Debug Admin Access</h1>
                <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded">
                    <strong>Issue:</strong> Custom user ID not found
                </div>
                <div className="mt-4">
                    <p><strong>Auth User ID:</strong> {session.user.id}</p>
                    <p><strong>Auth User Email:</strong> {session.user.email}</p>
                    <p><strong>Auth User Name:</strong> {session.user.name}</p>
                </div>
                <div className="mt-4">
                    <p>The user exists in the auth system but not in the custom users table.</p>
                </div>
            </div>
        );
    }

    const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, customUserId))
        .limit(1);

    console.log("Database User:", user);

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-4">Debug Admin Access</h1>
            
            <div className="space-y-4">
                <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
                    <strong>Session Found:</strong> User is authenticated
                </div>

                <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded">
                    <strong>Auth User Info:</strong>
                    <ul className="mt-2 list-disc list-inside">
                        <li>ID: {session.user.id}</li>
                        <li>Email: {session.user.email}</li>
                        <li>Name: {session.user.name}</li>
                    </ul>
                </div>

                <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded">
                    <strong>Custom User ID:</strong> {customUserId}
                </div>

                {user ? (
                    <div className={`border px-4 py-3 rounded ${
                        user.role === 'admin' 
                            ? 'bg-green-100 border-green-400 text-green-700' 
                            : 'bg-red-100 border-red-400 text-red-700'
                    }`}>
                        <strong>Database User Info:</strong>
                        <ul className="mt-2 list-disc list-inside">
                            <li>ID: {user.id}</li>
                            <li>GitHub ID: {user.githubId}</li>
                            <li>GitHub Username: {user.githubUsername}</li>
                            <li>Email: {user.email}</li>
                            <li>Role: <strong>{user.role}</strong></li>
                            <li>Created: {user.createdAt.toISOString()}</li>
                        </ul>
                        {user.role === 'admin' ? (
                            <p className="mt-2 font-bold">✅ User has admin access!</p>
                        ) : (
                            <p className="mt-2 font-bold">❌ User does not have admin role</p>
                        )}
                    </div>
                ) : (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                        <strong>Issue:</strong> User not found in database with ID {customUserId}
                    </div>
                )}

                <div className="mt-6">
                    <h2 className="text-lg font-semibold mb-2">Next Steps:</h2>
                    {!user ? (
                        <p>The user needs to be created in the custom users table.</p>
                    ) : user.role !== 'admin' ? (
                        <p>The user role needs to be updated to 'admin' in the database.</p>
                    ) : (
                        <p>User should have admin access. Try accessing <a href="/admin" className="text-blue-600 underline">/admin</a> again.</p>
                    )}
                </div>
            </div>
        </div>
    );
}