"use client";

import { useAuth } from "@/hooks/use-auth";
import { api } from "@/trpc/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function TestAuthPage() {
  const { user, isAuthenticated, isAdmin, isLoading, signIn, signOut } = useAuth();
  const { data: session } = api.auth.getSession.useQuery();
  const { data: adminCheck } = api.auth.isAdmin.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  if (isLoading) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="container mx-auto p-8 space-y-6">
      <h1 className="text-3xl font-bold">Authentication Test Page</h1>
      
      <Card>
        <CardHeader>
          <CardTitle>Authentication Status</CardTitle>
          <CardDescription>Current authentication state</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <strong>Authenticated:</strong> {isAuthenticated ? "Yes" : "No"}
          </div>
          
          {isAuthenticated && (
            <>
              <div>
                <strong>User:</strong> {user?.name || user?.email}
              </div>
              <div>
                <strong>Email:</strong> {user?.email}
              </div>
              <div className="flex items-center gap-2">
                <strong>Admin Status:</strong>
                <Badge variant={isAdmin ? "default" : "secondary"}>
                  {isAdmin ? "Admin" : "User"}
                </Badge>
              </div>
              <div>
                <strong>Admin Check (tRPC):</strong> {adminCheck ? "Admin" : "User"}
              </div>
            </>
          )}
          
          <div className="pt-4">
            {isAuthenticated ? (
              <Button onClick={() => signOut()} variant="outline">
                Sign Out
              </Button>
            ) : (
              <Button onClick={() => signIn({ provider: "github" })}>
                Sign In with GitHub
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Session Data (tRPC)</CardTitle>
          <CardDescription>Raw session data from tRPC</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
            {JSON.stringify(session, null, 2)}
          </pre>
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Admin Features</CardTitle>
            <CardDescription>Features only available to administrators</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-green-600">✅ You have admin access!</p>
            <p className="text-sm text-gray-600 mt-2">
              Admin features like user management, repository management, and extension management
              would be available here.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}