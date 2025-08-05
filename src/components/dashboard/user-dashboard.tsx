"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/trpc/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RepositoryCard } from "./repository-card";
import { SessionManager } from "./session-manager";
import { CreateBranchModal } from "./create-branch-modal";
import { 
  GitBranch, 
  Code, 
  Users, 
  Activity,
  RefreshCw,
  AlertCircle 
} from "lucide-react";

export function UserDashboard() {
  const { user, isAuthenticated } = useAuth();
  const [selectedRepository, setSelectedRepository] = useState<number | null>(null);
  const [createBranchModalOpen, setCreateBranchModalOpen] = useState(false);

  // Fetch user's repositories
  const { 
    data: repositories, 
    isLoading: repositoriesLoading, 
    error: repositoriesError,
    refetch: refetchRepositories 
  } = api.dashboard.getMyRepositories.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  // Fetch user's active sessions
  const { 
    data: sessions, 
    isLoading: sessionsLoading, 
    refetch: refetchSessions 
  } = api.session.getMySessions.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Access Denied
            </CardTitle>
            <CardDescription>
              Please sign in to access your dashboard.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#2e026d] to-[#15162c] text-white">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold mb-2">
                Welcome back, {user?.name || user?.email}
              </h1>
              <p className="text-gray-300">
                Manage your repositories and IDE sessions
              </p>
            </div>
            <Button
              onClick={() => {
                refetchRepositories();
                refetchSessions();
              }}
              variant="outline"
              size="sm"
              className="text-white border-white/20 hover:bg-white/10"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="bg-white/10 border-white/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-white">
                Accessible Repositories
              </CardTitle>
              <Code className="h-4 w-4 text-white/70" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                {repositoriesLoading ? (
                  <Skeleton className="h-8 w-16 bg-white/20" />
                ) : (
                  repositories?.length || 0
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/10 border-white/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-white">
                Active Sessions
              </CardTitle>
              <Activity className="h-4 w-4 text-white/70" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                {sessionsLoading ? (
                  <Skeleton className="h-8 w-16 bg-white/20" />
                ) : (
                  sessions?.filter(s => s.status === 'running').length || 0
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/10 border-white/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-white">
                Total Sessions
              </CardTitle>
              <Users className="h-4 w-4 text-white/70" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                {sessionsLoading ? (
                  <Skeleton className="h-8 w-16 bg-white/20" />
                ) : (
                  sessions?.length || 0
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Repositories Section */}
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold text-white flex items-center gap-2">
                <GitBranch className="h-6 w-6" />
                Your Repositories
              </h2>
              {selectedRepository && (
                <Button
                  onClick={() => setCreateBranchModalOpen(true)}
                  size="sm"
                  className="bg-primary hover:bg-primary/90"
                >
                  Create Branch
                </Button>
              )}
            </div>

            {repositoriesLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="bg-white/10 border-white/20">
                    <CardContent className="p-6">
                      <Skeleton className="h-6 w-3/4 mb-2 bg-white/20" />
                      <Skeleton className="h-4 w-1/2 mb-4 bg-white/20" />
                      <div className="flex gap-2">
                        <Skeleton className="h-6 w-16 bg-white/20" />
                        <Skeleton className="h-6 w-20 bg-white/20" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : repositoriesError ? (
              <Card className="bg-red-500/10 border-red-500/20">
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 text-red-400">
                    <AlertCircle className="h-5 w-5" />
                    <span>Failed to load repositories</span>
                  </div>
                  <p className="text-sm text-red-300 mt-2">
                    {repositoriesError.message}
                  </p>
                </CardContent>
              </Card>
            ) : repositories?.length === 0 ? (
              <Card className="bg-white/10 border-white/20">
                <CardContent className="p-6 text-center">
                  <Code className="h-12 w-12 text-white/50 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-white mb-2">
                    No repositories available
                  </h3>
                  <p className="text-gray-300">
                    Contact your administrator to get access to repositories.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {repositories?.map((repo) => (
                  <RepositoryCard
                    key={repo.id}
                    repository={repo}
                    isSelected={selectedRepository === repo.id}
                    onSelect={() => setSelectedRepository(repo.id)}
                    onCreateBranch={() => setCreateBranchModalOpen(true)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Sessions Section */}
          <div>
            <h2 className="text-2xl font-semibold text-white mb-6 flex items-center gap-2">
              <Activity className="h-6 w-6" />
              IDE Sessions
            </h2>

            <SessionManager 
              sessions={sessions}
              isLoading={sessionsLoading}
              onRefresh={refetchSessions}
            />
          </div>
        </div>

        {/* Create Branch Modal */}
        {selectedRepository && (
          <CreateBranchModal
            repositoryId={selectedRepository}
            isOpen={createBranchModalOpen}
            onClose={() => setCreateBranchModalOpen(false)}
            onSuccess={() => {
              setCreateBranchModalOpen(false);
              // Optionally refresh data
            }}
          />
        )}
      </div>
    </div>
  );
}