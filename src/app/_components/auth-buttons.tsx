"use client";

import { authClient } from "@/lib/auth-client";

export function SignInWithGitHubButton() {
  return (
    <button
      className="rounded bg-white/10 px-4 py-2 hover:bg-white/20"
      onClick={async () => {
        await authClient.signIn.social({ provider: "github", callbackURL: "/dashboard" });
      }}
    >
      Sign in with GitHub
    </button>
  );
}

export function SignOutButton() {
  return (
    <button
      className="rounded bg-white/10 px-4 py-2 hover:bg-white/20"
      onClick={async () => {
        await authClient.signOut();
        window.location.href = "/";
      }}
    >
      Sign out
    </button>
  );
}


