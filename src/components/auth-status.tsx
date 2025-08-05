"use client";

import { useAuth } from "@/hooks/use-auth";
import { GitHubPermissionsChecker } from "./github-permissions-checker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LogIn, LogOut, User, Shield } from "lucide-react";

export function AuthStatus() {
  const { user, isAuthenticated, isAdmin, isLoading, signIn, signOut } = useAuth();

  if (isLoading) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="flex items-center justify-center p-6">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </CardContent>
      </Card>
    );
  }

  if (!isAuthenticated) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LogIn className="h-5 w-5" />
            Sign In Required
          </CardTitle>
          <CardDescription>
            Sign in with your GitHub account to access the Cloud IDE Orchestrator
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => signIn({ provider: "github" })}
            className="w-full"
          >
            <LogIn className="h-4 w-4 mr-2" />
            Sign in with GitHub
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Welcome, {user?.name || user?.email}
          </CardTitle>
          <CardDescription className="flex items-center gap-2">
            <Badge variant={isAdmin ? "default" : "secondary"} className="flex items-center gap-1">
              {isAdmin && <Shield className="h-3 w-3" />}
              {isAdmin ? "Administrator" : "User"}
            </Badge>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <p className="text-sm text-gray-600">
              <strong>Email:</strong> {user?.email}
            </p>
            <p className="text-sm text-gray-600">
              <strong>GitHub:</strong> {user?.name || "N/A"}
            </p>
          </div>
          <Button
            onClick={() => signOut()}
            variant="outline"
            className="w-full mt-4"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </CardContent>
      </Card>

      {isAdmin && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Administrator Tools</h3>
          <GitHubPermissionsChecker />
        </div>
      )}
    </div>
  );
}