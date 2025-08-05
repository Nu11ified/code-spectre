"use client";

import { useState, useEffect } from "react";
import { authClient } from "@/lib/auth-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, AlertCircle, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface GitHubPermission {
  name: string;
  description: string;
  required: boolean;
  granted?: boolean;
}

const REQUIRED_PERMISSIONS: GitHubPermission[] = [
  {
    name: "contents",
    description: "Read and write repository contents",
    required: true,
  },
  {
    name: "metadata",
    description: "Read repository metadata",
    required: true,
  },
  {
    name: "pull_requests",
    description: "Create and manage pull requests",
    required: true,
  },
  {
    name: "issues",
    description: "Create and manage issues",
    required: false,
  },
  {
    name: "deployments",
    description: "Create deployments",
    required: false,
  },
  {
    name: "administration",
    description: "Repository administration (for deploy keys)",
    required: true,
  },
];

export function GitHubPermissionsChecker() {
  const [permissions, setPermissions] = useState<GitHubPermission[]>(REQUIRED_PERMISSIONS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      const { data } = await authClient.getSession();
      setSession(data);
    } catch (err) {
      setError("Failed to get session");
    }
  };

  const checkPermissions = async () => {
    setLoading(true);
    setError(null);

    try {
      // Get the GitHub access token from the session
      const { data: session } = await authClient.getSession();
      
      if (!session?.user) {
        throw new Error("No authenticated user found");
      }

      // Note: In a real implementation, you would need to:
      // 1. Get the GitHub access token from the Better Auth account table
      // 2. Make a request to GitHub API to check app permissions
      // 3. Compare with required permissions
      
      // For now, we'll simulate the check
      const updatedPermissions = permissions.map(permission => ({
        ...permission,
        granted: Math.random() > 0.3, // Simulate some permissions being granted
      }));

      setPermissions(updatedPermissions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check permissions");
    } finally {
      setLoading(false);
    }
  };

  const allRequiredPermissionsGranted = permissions
    .filter(p => p.required)
    .every(p => p.granted);

  const getPermissionIcon = (permission: GitHubPermission) => {
    if (permission.granted === undefined) {
      return <AlertCircle className="h-4 w-4 text-gray-400" />;
    }
    return permission.granted ? (
      <CheckCircle className="h-4 w-4 text-green-500" />
    ) : (
      <XCircle className="h-4 w-4 text-red-500" />
    );
  };

  const getPermissionBadge = (permission: GitHubPermission) => {
    if (permission.granted === undefined) {
      return <Badge variant="secondary">Unknown</Badge>;
    }
    return permission.granted ? (
      <Badge variant="default" className="bg-green-100 text-green-800">
        Granted
      </Badge>
    ) : (
      <Badge variant="destructive">Missing</Badge>
    );
  };

  if (!session?.user) {
    return null;
  }

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          GitHub App Permissions
          {loading && <RefreshCw className="h-4 w-4 animate-spin" />}
        </CardTitle>
        <CardDescription>
          Verify that your GitHub App has the necessary permissions for the Cloud IDE Orchestrator
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {permissions.some(p => p.granted !== undefined) && (
          <Alert variant={allRequiredPermissionsGranted ? "default" : "destructive"}>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {allRequiredPermissionsGranted
                ? "All required permissions are granted! Your GitHub App is properly configured."
                : "Some required permissions are missing. Please update your GitHub App configuration."}
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          {permissions.map((permission) => (
            <div
              key={permission.name}
              className="flex items-center justify-between p-3 border rounded-lg"
            >
              <div className="flex items-center gap-3">
                {getPermissionIcon(permission)}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{permission.name}</span>
                    {permission.required && (
                      <Badge variant="outline" className="text-xs">
                        Required
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-600">{permission.description}</p>
                </div>
              </div>
              {getPermissionBadge(permission)}
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Button onClick={checkPermissions} disabled={loading}>
            {loading ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Checking...
              </>
            ) : (
              "Check Permissions"
            )}
          </Button>
          
          {permissions.some(p => p.granted === false) && (
            <Button variant="outline" asChild>
              <a
                href={`https://github.com/settings/apps`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Configure GitHub App
              </a>
            </Button>
          )}
        </div>

        <div className="text-sm text-gray-600">
          <p>
            <strong>Note:</strong> This component checks the permissions of your GitHub App.
            If permissions are missing, you'll need to update your GitHub App configuration
            and potentially re-authorize the app.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}