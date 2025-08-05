"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Shield, Plus, Edit, Trash2, Terminal, GitBranch } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

interface Permission {
  id: number;
  userId: number;
  repositoryId: number;
  canCreateBranches: boolean;
  branchLimit: number;
  allowedBaseBranches: string[];
  allowTerminalAccess: boolean;
  createdAt: Date;
  updatedAt: Date | null;
  userName: string | null;
  userEmail: string | null;
  repositoryName: string | null;
}

export default function PermissionsPage() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedPermission, setSelectedPermission] = useState<Permission | null>(null);
  const [formData, setFormData] = useState({
    userId: "",
    repositoryId: "",
    canCreateBranches: false,
    branchLimit: 5,
    allowedBaseBranches: ["main", "develop"],
    allowTerminalAccess: true,
  });
  const [newBaseBranch, setNewBaseBranch] = useState("");

  const { data: permissions, isLoading, refetch } = api.admin.getPermissions.useQuery();
  const { data: users } = api.admin.getUsers.useQuery();
  const { data: repositories } = api.admin.getRepositories.useQuery();
  
  const managePermissionsMutation = api.admin.managePermissions.useMutation({
    onSuccess: () => {
      toast.success("Permissions updated successfully");
      refetch();
      setIsAddDialogOpen(false);
      setIsEditDialogOpen(false);
      setSelectedPermission(null);
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update permissions");
    },
  });

  const removePermissionsMutation = api.admin.removePermissions.useMutation({
    onSuccess: () => {
      toast.success("Permissions removed successfully");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to remove permissions");
    },
  });

  const resetForm = () => {
    setFormData({
      userId: "",
      repositoryId: "",
      canCreateBranches: false,
      branchLimit: 5,
      allowedBaseBranches: ["main", "develop"],
      allowTerminalAccess: true,
    });
    setNewBaseBranch("");
  };

  const handleAddPermission = () => {
    if (!formData.userId || !formData.repositoryId) {
      toast.error("Please select both user and repository");
      return;
    }

    managePermissionsMutation.mutate({
      userId: parseInt(formData.userId),
      repositoryId: parseInt(formData.repositoryId),
      permissions: {
        canCreateBranches: formData.canCreateBranches,
        branchLimit: formData.branchLimit,
        allowedBaseBranches: formData.allowedBaseBranches,
        allowTerminalAccess: formData.allowTerminalAccess,
      },
    });
  };

  const handleUpdatePermission = () => {
    if (!selectedPermission) return;

    managePermissionsMutation.mutate({
      userId: selectedPermission.userId,
      repositoryId: selectedPermission.repositoryId,
      permissions: {
        canCreateBranches: formData.canCreateBranches,
        branchLimit: formData.branchLimit,
        allowedBaseBranches: formData.allowedBaseBranches,
        allowTerminalAccess: formData.allowTerminalAccess,
      },
    });
  };

  const handleRemovePermission = (permission: Permission) => {
    if (confirm(`Remove permissions for ${permission.userName} on ${permission.repositoryName}?`)) {
      removePermissionsMutation.mutate({
        userId: permission.userId,
        repositoryId: permission.repositoryId,
      });
    }
  };

  const openEditDialog = (permission: Permission) => {
    setSelectedPermission(permission);
    setFormData({
      userId: permission.userId.toString(),
      repositoryId: permission.repositoryId.toString(),
      canCreateBranches: permission.canCreateBranches,
      branchLimit: permission.branchLimit,
      allowedBaseBranches: permission.allowedBaseBranches,
      allowTerminalAccess: permission.allowTerminalAccess,
    });
    setIsEditDialogOpen(true);
  };

  const addBaseBranch = () => {
    if (newBaseBranch.trim() && !formData.allowedBaseBranches.includes(newBaseBranch.trim())) {
      setFormData({
        ...formData,
        allowedBaseBranches: [...formData.allowedBaseBranches, newBaseBranch.trim()],
      });
      setNewBaseBranch("");
    }
  };

  const removeBaseBranch = (branch: string) => {
    setFormData({
      ...formData,
      allowedBaseBranches: formData.allowedBaseBranches.filter(b => b !== branch),
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Permission Management
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Manage user access permissions for repositories
          </p>
        </div>

        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
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
            Permission Management
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Manage user access permissions for repositories
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Permission
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add User Permission</DialogTitle>
              <DialogDescription>
                Grant a user access to a repository with specific permissions.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    User
                  </label>
                  <Select value={formData.userId} onValueChange={(value) => setFormData({ ...formData, userId: value })}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select user" />
                    </SelectTrigger>
                    <SelectContent>
                      {users?.map((user) => (
                        <SelectItem key={user.id} value={user.id.toString()}>
                          {user.githubUsername} ({user.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Repository
                  </label>
                  <Select value={formData.repositoryId} onValueChange={(value) => setFormData({ ...formData, repositoryId: value })}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select repository" />
                    </SelectTrigger>
                    <SelectContent>
                      {repositories?.map((repo) => (
                        <SelectItem key={repo.id} value={repo.id.toString()}>
                          {repo.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Can Create Branches
                    </label>
                    <p className="text-xs text-gray-500 mt-1">
                      Allow user to create new branches
                    </p>
                  </div>
                  <Switch
                    checked={formData.canCreateBranches}
                    onCheckedChange={(checked) => setFormData({ ...formData, canCreateBranches: checked })}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Branch Creation Limit
                  </label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.branchLimit}
                    onChange={(e) => setFormData({ ...formData, branchLimit: parseInt(e.target.value) || 0 })}
                    className="mt-1"
                    disabled={!formData.canCreateBranches}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Maximum number of branches user can create
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Allowed Base Branches
                  </label>
                  <div className="mt-1 space-y-2">
                    <div className="flex gap-2">
                      <Input
                        placeholder="main, develop, etc."
                        value={newBaseBranch}
                        onChange={(e) => setNewBaseBranch(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && addBaseBranch()}
                      />
                      <Button type="button" onClick={addBaseBranch} size="sm">
                        Add
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {formData.allowedBaseBranches.map((branch) => (
                        <Badge key={branch} variant="secondary" className="flex items-center gap-1">
                          {branch}
                          <button
                            type="button"
                            onClick={() => removeBaseBranch(branch)}
                            className="ml-1 text-xs hover:text-red-500"
                          >
                            ×
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Branches that can be used as base for new branches
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Terminal Access
                    </label>
                    <p className="text-xs text-gray-500 mt-1">
                      Allow terminal access in IDE sessions
                    </p>
                  </div>
                  <Switch
                    checked={formData.allowTerminalAccess}
                    onCheckedChange={(checked) => setFormData({ ...formData, allowTerminalAccess: checked })}
                  />
                </div>
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
                onClick={handleAddPermission}
                disabled={managePermissionsMutation.isPending}
              >
                {managePermissionsMutation.isPending ? "Adding..." : "Add Permission"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Permissions Table */}
      <Card>
        <CardHeader>
          <CardTitle>User Permissions</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Repository</TableHead>
                <TableHead>Branch Creation</TableHead>
                <TableHead>Base Branches</TableHead>
                <TableHead>Terminal</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {permissions?.map((permission) => (
                <TableRow key={permission.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">
                        {permission.userName}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {permission.userEmail}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <GitBranch className="h-4 w-4 text-green-600" />
                      <span className="font-medium">{permission.repositoryName}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <Badge variant={permission.canCreateBranches ? "default" : "secondary"}>
                        {permission.canCreateBranches ? "Allowed" : "Denied"}
                      </Badge>
                      {permission.canCreateBranches && (
                        <div className="text-xs text-gray-500">
                          Limit: {permission.branchLimit}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {permission.allowedBaseBranches.slice(0, 2).map((branch) => (
                        <Badge key={branch} variant="outline" className="text-xs">
                          {branch}
                        </Badge>
                      ))}
                      {permission.allowedBaseBranches.length > 2 && (
                        <Badge variant="outline" className="text-xs">
                          +{permission.allowedBaseBranches.length - 2}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant={permission.allowTerminalAccess ? "default" : "secondary"}
                      className="flex items-center gap-1 w-fit"
                    >
                      <Terminal className="h-3 w-3" />
                      {permission.allowTerminalAccess ? "Allowed" : "Denied"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {new Date(permission.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog(permission)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRemovePermission(permission)}
                        disabled={removePermissionsMutation.isPending}
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

      {/* Edit Permission Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Permission</DialogTitle>
            <DialogDescription>
              Update permissions for {selectedPermission?.userName} on {selectedPermission?.repositoryName}.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Can Create Branches
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  Allow user to create new branches
                </p>
              </div>
              <Switch
                checked={formData.canCreateBranches}
                onCheckedChange={(checked) => setFormData({ ...formData, canCreateBranches: checked })}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Branch Creation Limit
              </label>
              <Input
                type="number"
                min="0"
                max="100"
                value={formData.branchLimit}
                onChange={(e) => setFormData({ ...formData, branchLimit: parseInt(e.target.value) || 0 })}
                className="mt-1"
                disabled={!formData.canCreateBranches}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Allowed Base Branches
              </label>
              <div className="mt-1 space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="main, develop, etc."
                    value={newBaseBranch}
                    onChange={(e) => setNewBaseBranch(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addBaseBranch()}
                  />
                  <Button type="button" onClick={addBaseBranch} size="sm">
                    Add
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {formData.allowedBaseBranches.map((branch) => (
                    <Badge key={branch} variant="secondary" className="flex items-center gap-1">
                      {branch}
                      <button
                        type="button"
                        onClick={() => removeBaseBranch(branch)}
                        className="ml-1 text-xs hover:text-red-500"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Terminal Access
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  Allow terminal access in IDE sessions
                </p>
              </div>
              <Switch
                checked={formData.allowTerminalAccess}
                onCheckedChange={(checked) => setFormData({ ...formData, allowTerminalAccess: checked })}
              />
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
              onClick={handleUpdatePermission}
              disabled={managePermissionsMutation.isPending}
            >
              {managePermissionsMutation.isPending ? "Updating..." : "Update Permission"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}