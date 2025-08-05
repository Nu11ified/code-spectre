"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { GitBranch, Plus, Edit, Trash2, ExternalLink } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

interface Repository {
  id: number;
  name: string;
  gitUrl: string;
  ownerId: number;
  createdAt: Date;
  updatedAt: Date | null;
}

export default function RepositoriesPage() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    gitUrl: "",
  });

  const { data: repositories, isLoading, refetch } = api.admin.getRepositories.useQuery();
  const { data: stats } = api.admin.getRepositoryStats.useQuery();
  
  const addRepoMutation = api.admin.addRepository.useMutation({
    onSuccess: () => {
      toast.success("Repository added successfully");
      refetch();
      setIsAddDialogOpen(false);
      setFormData({ name: "", gitUrl: "" });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to add repository");
    },
  });

  const updateRepoMutation = api.admin.updateRepository.useMutation({
    onSuccess: () => {
      toast.success("Repository updated successfully");
      refetch();
      setIsEditDialogOpen(false);
      setSelectedRepo(null);
      setFormData({ name: "", gitUrl: "" });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update repository");
    },
  });

  const deleteRepoMutation = api.admin.deleteRepository.useMutation({
    onSuccess: () => {
      toast.success("Repository deleted successfully");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete repository");
    },
  });

  const handleAddRepository = () => {
    if (!formData.name.trim() || !formData.gitUrl.trim()) {
      toast.error("Please fill in all fields");
      return;
    }

    addRepoMutation.mutate({
      name: formData.name.trim(),
      gitUrl: formData.gitUrl.trim(),
    });
  };

  const handleUpdateRepository = () => {
    if (!selectedRepo || !formData.name.trim() || !formData.gitUrl.trim()) {
      toast.error("Please fill in all fields");
      return;
    }

    updateRepoMutation.mutate({
      repositoryId: selectedRepo.id,
      name: formData.name.trim(),
      gitUrl: formData.gitUrl.trim(),
    });
  };

  const handleDeleteRepository = (repo: Repository) => {
    if (confirm(`Are you sure you want to delete "${repo.name}"? This action cannot be undone.`)) {
      deleteRepoMutation.mutate({ repositoryId: repo.id });
    }
  };

  const openEditDialog = (repo: Repository) => {
    setSelectedRepo(repo);
    setFormData({
      name: repo.name,
      gitUrl: repo.gitUrl,
    });
    setIsEditDialogOpen(true);
  };

  const validateGitUrl = (url: string) => {
    const gitUrlPattern = /^(https?:\/\/.+\.git|git@.+:.+\.git)$/;
    return gitUrlPattern.test(url);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Repository Management
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Manage Git repositories for IDE access
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[...Array(2)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-16" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-12 mb-2" />
                <Skeleton className="h-3 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center space-x-4">
                  <Skeleton className="h-10 w-10 rounded" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-64" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Repository Management
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Manage Git repositories for IDE access
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Repository
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Repository</DialogTitle>
              <DialogDescription>
                Add a Git repository to make it available for IDE sessions.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Repository Name
                </label>
                <Input
                  placeholder="my-awesome-project"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">
                  A friendly name for the repository
                </p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Git URL
                </label>
                <Input
                  placeholder="https://github.com/user/repo.git"
                  value={formData.gitUrl}
                  onChange={(e) => setFormData({ ...formData, gitUrl: e.target.value })}
                  className="mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">
                  HTTPS or SSH Git URL (must end with .git)
                </p>
                {formData.gitUrl && !validateGitUrl(formData.gitUrl) && (
                  <p className="text-xs text-red-500 mt-1">
                    Invalid Git URL format
                  </p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsAddDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddRepository}
                disabled={addRepoMutation.isPending || !validateGitUrl(formData.gitUrl)}
              >
                {addRepoMutation.isPending ? "Adding..." : "Add Repository"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Total Repositories
            </CardTitle>
            <GitBranch className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats?.totalRepositories ?? 0}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Available for IDE access
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Active Permissions
            </CardTitle>
            <GitBranch className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats?.totalPermissions ?? 0}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              User access permissions
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Repositories Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Repositories</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Repository</TableHead>
                <TableHead>Git URL</TableHead>
                <TableHead>Added</TableHead>
                <TableHead>Last Updated</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {repositories?.map((repo) => (
                <TableRow key={repo.id}>
                  <TableCell>
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded flex items-center justify-center">
                        <GitBranch className="h-4 w-4 text-green-600" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          {repo.name}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          ID: {repo.id}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <code className="text-sm bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded max-w-xs truncate">
                        {repo.gitUrl}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open(repo.gitUrl.replace('.git', ''), '_blank')}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    {new Date(repo.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {repo.updatedAt ? new Date(repo.updatedAt).toLocaleDateString() : "Never"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog(repo)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteRepository(repo)}
                        disabled={deleteRepoMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Repository Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Repository</DialogTitle>
            <DialogDescription>
              Update repository information. Changes will affect all users with access.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Repository Name
              </label>
              <Input
                placeholder="my-awesome-project"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="mt-1"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Git URL
              </label>
              <Input
                placeholder="https://github.com/user/repo.git"
                value={formData.gitUrl}
                onChange={(e) => setFormData({ ...formData, gitUrl: e.target.value })}
                className="mt-1"
              />
              {formData.gitUrl && !validateGitUrl(formData.gitUrl) && (
                <p className="text-xs text-red-500 mt-1">
                  Invalid Git URL format
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateRepository}
              disabled={updateRepoMutation.isPending || !validateGitUrl(formData.gitUrl)}
            >
              {updateRepoMutation.isPending ? "Updating..." : "Update Repository"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}