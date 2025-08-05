import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getCustomUserIdFromAuthId } from "@/lib/user-utils";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { AdminSidebar } from "@/components/admin/admin-sidebar";

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth.api.getSession({
        headers: await headers(),
    });

    if (!session?.user) {
        redirect("/");
    }

    // Check if user is admin
    const customUserId = await getCustomUserIdFromAuthId(session.user.id);
    if (!customUserId) {
        redirect("/");
    }

    const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, customUserId))
        .limit(1);

    if (!user || user.role !== "admin") {
        redirect("/");
    }

    return (
        <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
            <AdminSidebar />
            <main className="flex-1 overflow-y-auto">
                <div className="p-6">
                    {children}
                </div>
            </main>
        </div>
    );
}