import Link from "next/link";
import { redirect } from "next/navigation";

import { LatestPost } from "@/app/_components/post";
import { AuthStatus } from "@/components/auth-status";
import { HydrateClient } from "@/trpc/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export default async function Home() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  // Redirect authenticated users to dashboard
  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <HydrateClient>
      <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#2e026d] to-[#15162c] text-white">
        <div className="container flex flex-col items-center justify-center gap-12 px-4 py-16">
          <h1 className="text-5xl font-extrabold tracking-tight sm:text-[5rem]">
            Cloud <span className="text-[hsl(280,100%,70%)]">IDE</span> Orchestrator
          </h1>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-8">
            <Link
              className="flex max-w-xs flex-col gap-4 rounded-xl bg-white/10 p-4 hover:bg-white/20"
              href="https://github.com/coder/code-server"
              target="_blank"
            >
              <h3 className="text-2xl font-bold">Code Server →</h3>
              <div className="text-lg">
                VS Code in the browser - The foundation of our IDE orchestration platform.
              </div>
            </Link>
            <Link
              className="flex max-w-xs flex-col gap-4 rounded-xl bg-white/10 p-4 hover:bg-white/20"
              href="https://www.docker.com/"
              target="_blank"
            >
              <h3 className="text-2xl font-bold">Docker →</h3>
              <div className="text-lg">
                Container orchestration for secure, isolated development environments.
              </div>
            </Link>
          </div>
          <div className="flex flex-col items-center gap-2">
            <p className="text-2xl text-white">
              Database schema ready for implementation
            </p>
            <p className="text-sm text-gray-300">
              ✅ Users, Repositories, Permissions, IDE Sessions, and Extensions tables created
            </p>
          </div>

          <div className="w-full max-w-4xl">
            <AuthStatus />
          </div>

          <LatestPost />
        </div>
      </main>
    </HydrateClient>
  );
}
