"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  GitBranch, 
  Play, 
  Plus, 
  Terminal,
  TerminalSquare,
  AlertCircle,
  RefreshCw
} from "lucide-react";
import { toast } from "sonner";

interface Repository {
  id: number;
  name: string;
  gitUrl: string;
  createdAt: Date;
  canCreateBranches: boolean;
  branchLimit: number;
  allowedBaseBranches: string[];
  allowTerminalAccess: boolean;
}

interface RepositoryCardProps {
  repository: Repository;
  isSelected: boolean;
  onSelect: () => void;
  onCreateBranch: () => void;
}

export function RepositoryCard({ 
  repository, 
  isSelected, 
  onSelect, 
  onCreateBranch 
}: RepositoryCardProps) {
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [isLaunching, setIsLaunching] = useState(false);

  // Fetch branches for this repository
  const { 
    data: branches, 
    isLoading: branchesLoading, 
    error: branchesError,
    refetch: refetchBranches 
  } = api.dashboard.getRepositoryBranches.useQuery(
    { repositoryId: repository.id },
    { enabled: isSelected }
  );

  // Fetch branch stats
  const { data: branchStats } = api.dashboard.getBranchStats.useQuery(
    { repositoryId: repository.id },
    { enabled: isSelected }
  );

  // Start IDE session mutation
  const startSessionMutation = api.session.start.useMutation({
    onSuccess: (data) => {
      setIsLaunching(false);
      toast.success("IDE session started successfully!");
      
      // Open IDE in new tab
      window.open(data.containerUrl, '_blank');
    },
    onError: (error) => {
      setIsLaunching(false);
      toast.error(`Failed to start IDE session: ${error.message}`);
    },
  });

  const handleLaunchIDE = async () => {
    if (!selectedBranch) {
      toast.error("Please select a branch first");
      return;
    }

    setIsLaunching(true);
    startSessionMutation.mutate({
      repositoryId: repository.id,
      branchName: selectedBranch,
    });
  };

  return (
    <Card 
      className={`transition-all cursor-pointer ${
        isSelected 
          ? 'bg-white/20 border-primary/50 ring-2 ring-primary/20' 
          : 'bg-white/10 border-white/20 hover:bg-white/15'
      }`}
      onClick={onSelect}
    >
      <CardHeader>
        <CardTitle className="text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            {repository.name}
          </div>
          <div className="flex items-center gap-2">
            {repository.allowTerminalAccess && (
              <Badge variant="secondary" className="text-xs">
                <Terminal className="h-3 w-3 mr-1" />
                Terminal
              </Badge>
            )}
            {repository.canCreateBranches && (
              <Badge variant="outline" className="text-xs">
                <Plus className="h-3 w-3 mr-1" />
                Create Branches
              </Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="space-y-4">
          {/* Repository Info */}
          <div className="text-sm text-gray-300">
            <p className="truncate">{repository.gitUrl}</p>
            {branchStats && (
              <p className="mt-1">
                Branch limit: {branchStats.branchesCreated}/{branchStats.branchLimit}
              </p>
            )}
          </div>

          {/* Branch Selection (only when selected) */}
          {isSelected && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-white">
                  Select Branch
                </label>
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    refetchBranches();
                  }}
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-white/70 hover:text-white"
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </div>

              {branchesLoading ? (
                <Skeleton className="h-9 w-full bg-white/20" />
              ) : branchesError ? (
                <div className="flex items-center gap-2 text-red-400 text-sm">
                  <AlertCircle className="h-4 w-4" />
                  <span>Failed to load branches</span>
                </div>
              ) : (
                <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                  <SelectTrigger className="bg-white/10 border-white/20 text-white">
                    <SelectValue placeholder="Choose a branch..." />
                  </SelectTrigger>
                  <SelectContent>
                    {branches?.map((branch) => (
                      <SelectItem key={branch} value={branch}>
                        {branch}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2">
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleLaunchIDE();
                  }}
                  disabled={!selectedBranch || isLaunching}
                  className="flex-1 bg-primary hover:bg-primary/90"
                >
                  {isLaunching ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Launching...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Launch IDE
                    </>
                  )}
                </Button>

                {repository.canCreateBranches && (
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCreateBranch();
                    }}
                    variant="outline"
                    className="text-white border-white/20 hover:bg-white/10"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    New Branch
                  </Button>
                )}
              </div>

              {/* Allowed Base Branches Info */}
              {repository.canCreateBranches && branchStats && (
                <div className="text-xs text-gray-400">
                  <p>Allowed base branches: {branchStats.allowedBaseBranches.join(", ")}</p>
                  <p>Remaining branches: {branchStats.remainingBranches}</p>
                </div>
              )}
            </div>
          )}

          {/* Collapsed State Info */}
          {!isSelected && (
            <div className="text-sm text-gray-400">
              Click to select and launch IDE sessions
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}