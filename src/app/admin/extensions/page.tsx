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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Puzzle, Plus, Search, Edit, Trash2, Power, PowerOff } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

interface Extension {
  id: number;
  extensionId: string;
  name: string;
  version: string;
  enabled: boolean;
  installedBy: number;
  createdAt: Date;
  updatedAt: Date | null;
}

export default function ExtensionsPage() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedExtension, setSelectedExtension] = useState<Extension | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [formData, setFormData] = useState({
    extensionId: "",
    name: "",
    version: "",
  });

  const { data: extensions, isLoading, refetch } = api.admin.getExtensions.useQuery();
  const { data: stats } = api.admin.getExtensionStats.useQuery();
  
  const installExtensionMutation = api.admin.installExtension.useMutation({
    onSuccess: () => {
      toast.success("Extension installed successfully");
      refetch();
      setIsAddDialogOpen(false);
      setFormData({ extensionId: "", name: "", version: "" });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to install extension");
    },
  });

  const updateExtensionMutation = api.admin.updateExtension.useMutation({
    onSuccess: () => {
      toast.success("Extension updated successfully");
      refetch();
      setIsEditDialogOpen(false);
      setSelectedExtension(null);
      setFormData({ extensionId: "", name: "", version: "" });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update extension");
    },
  });

  const toggleExtensionMutation = api.admin.toggleExtension.useMutation({
    onSuccess: () => {
      toast.success("Extension status updated");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update extension status");
    },
  });

  const deleteExtensionMutation = api.admin.deleteExtension.useMutation({
    onSuccess: () => {
      toast.success("Extension deleted successfully");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete extension");
    },
  });

  const handleInstallExtension = () => {
    if (!formData.extensionId.trim() || !formData.name.trim() || !formData.version.trim()) {
      toast.error("Please fill in all fields");
      return;
    }

    installExtensionMutation.mutate({
      extensionId: formData.extensionId.trim(),
      name: formData.name.trim(),
      version: formData.version.trim(),
    });
  };

  const handleUpdateExtension = () => {
    if (!selectedExtension || !formData.name.trim() || !formData.version.trim()) {
      toast.error("Please fill in all fields");
      return;
    }

    updateExtensionMutation.mutate({
      id: selectedExtension.id,
      name: formData.name.trim(),
      version: formData.version.trim(),
    });
  };

  const handleToggleExtension = (extension: Extension) => {
    toggleExtensionMutation.mutate({
      extensionId: extension.id,
      enabled: !extension.enabled,
    });
  };

  const handleDeleteExtension = (extension: Extension) => {
    if (confirm(`Are you sure you want to delete "${extension.name}"? This action cannot be undone.`)) {
      deleteExtensionMutation.mutate({ extensionId: extension.id });
    }
  };

  const openEditDialog = (extension: Extension) => {
    setSelectedExtension(extension);
    setFormData({
      extensionId: extension.extensionId,
      name: extension.name,
      version: extension.version,
    });
    setIsEditDialogOpen(true);
  };

  const validateExtensionId = (id: string) => {
    const extensionIdPattern = /^[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+$/;
    return extensionIdPattern.test(id);
  };

  const validateVersion = (version: string) => {
    const versionPattern = /^\d+\.\d+\.\d+(-.*)?$/;
    return versionPattern.test(version);
  };

  const filteredExtensions = extensions?.filter(ext => 
    ext.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ext.extensionId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Extension Management
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Manage VS Code extensions for IDE sessions
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
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
            Extension Management
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Manage VS Code extensions for IDE sessions
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Install Extension
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Install VS Code Extension</DialogTitle>
              <DialogDescription>
                Add a new VS Code extension that will be available in all IDE sessions.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Extension ID
                </label>
                <Input
                  placeholder="publisher.extension-name"
                  value={formData.extensionId}
                  onChange={(e) => setFormData({ ...formData, extensionId: e.target.value })}
                  className="mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Format: publisher.extension-name (e.g., ms-python.python)
                </p>
                {formData.extensionId && !validateExtensionId(formData.extensionId) && (
                  <p className="text-xs text-red-500 mt-1">
                    Invalid extension ID format
                  </p>
                )}
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Extension Name
                </label>
                <Input
                  placeholder="Python"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Human-readable name for the extension
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Version
                </label>
                <Input
                  placeholder="1.0.0"
                  value={formData.version}
                  onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                  className="mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Semantic version (e.g., 1.0.0)
                </p>
                {formData.version && !validateVersion(formData.version) && (
                  <p className="text-xs text-red-500 mt-1">
                    Invalid version format
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
                onClick={handleInstallExtension}
                disabled={
                  installExtensionMutation.isPending || 
                  !validateExtensionId(formData.extensionId) ||
                  !validateVersion(formData.version)
                }
              >
                {installExtensionMutation.isPending ? "Installing..." : "Install Extension"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Total Extensions
            </CardTitle>
            <Puzzle className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats?.totalExtensions ?? 0}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Installed extensions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Enabled Extensions
            </CardTitle>
            <Power className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats?.enabledExtensions ?? 0}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Active in IDE sessions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Disabled Extensions
            </CardTitle>
            <PowerOff className="h-4 w-4 text-gray-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats?.disabledExtensions ?? 0}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Temporarily disabled
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Extensions Table */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Installed Extensions</CardTitle>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search extensions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 w-64"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Extension</TableHead>
                <TableHead>Extension ID</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Installed</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredExtensions?.map((extension) => (
                <TableRow key={extension.id}>
                  <TableCell>
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded flex items-center justify-center">
                        <Puzzle className="h-4 w-4 text-purple-600" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          {extension.name}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          ID: {extension.id}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <code className="text-sm bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                      {extension.extensionId}
                    </code>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      v{extension.version}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <Badge 
                        variant={extension.enabled ? "default" : "secondary"}
                        className="flex items-center gap-1"
                      >
                        {extension.enabled ? (
                          <Power className="h-3 w-3" />
                        ) : (
                          <PowerOff className="h-3 w-3" />
                        )}
                        {extension.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                      <Switch
                        checked={extension.enabled}
                        onCheckedChange={() => handleToggleExtension(extension)}
                        disabled={toggleExtensionMutation.isPending}
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    {new Date(extension.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog(extension)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteExtension(extension)}
                        disabled={deleteExtensionMutation.isPending}
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

      {/* Edit Extension Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Extension</DialogTitle>
            <DialogDescription>
              Update extension information. Extension ID cannot be changed.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Extension ID
              </label>
              <Input
                value={formData.extensionId}
                disabled
                className="mt-1 bg-gray-50 dark:bg-gray-800"
              />
              <p className="text-xs text-gray-500 mt-1">
                Extension ID cannot be modified
              </p>
            </div>
            
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Extension Name
              </label>
              <Input
                placeholder="Python"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Version
              </label>
              <Input
                placeholder="1.0.0"
                value={formData.version}
                onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                className="mt-1"
              />
              {formData.version && !validateVersion(formData.version) && (
                <p className="text-xs text-red-500 mt-1">
                  Invalid version format
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
              onClick={handleUpdateExtension}
              disabled={updateExtensionMutation.isPending || !validateVersion(formData.version)}
            >
              {updateExtensionMutation.isPending ? "Updating..." : "Update Extension"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}