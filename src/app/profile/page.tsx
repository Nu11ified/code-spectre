import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function ProfilePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");

  const { user } = session;
  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="mb-4 text-2xl font-bold">Profile</h1>
      <div className="space-y-2 rounded border border-white/10 p-4">
        <div><span className="opacity-70">Name:</span> {user.name ?? "—"}</div>
        <div><span className="opacity-70">Email:</span> {user.email}</div>
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt="avatar" className="mt-2 h-20 w-20 rounded-full" />
        ) : null}
      </div>
    </main>
  );
}


