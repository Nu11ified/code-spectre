import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/rbac";

export default async function AdminPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !isAdmin(session.user.email)) redirect("/");

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="mb-4 text-2xl font-bold">Admin</h1>
      <p className="opacity-80">Welcome, {session.user.email}</p>
      <div className="mt-6 rounded border border-white/10 p-4">
        <p className="opacity-70">Placeholder for admin tools.</p>
      </div>
    </main>
  );
}


