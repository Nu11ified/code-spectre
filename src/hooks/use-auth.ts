"use client";

import { authClient } from "@/lib/auth-client";
import { api } from "@/trpc/react";

export function useAuth() {
  const { data: session, isPending: sessionLoading } = authClient.useSession();
  const { data: userInfo, isLoading: userInfoLoading } = api.auth.getMe.useQuery(
    undefined,
    {
      enabled: !!session?.user,
    }
  );

  return {
    session,
    user: session?.user ?? null,
    isAuthenticated: !!session?.user,
    isAdmin: userInfo?.isAdmin ?? false,
    isLoading: sessionLoading || userInfoLoading,
    signIn: authClient.signIn.social,
    signOut: authClient.signOut,
  };
}