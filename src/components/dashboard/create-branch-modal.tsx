"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api } from "@/trpc/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GitBranch, Plus, AlertCircle, CheckCircle } from "lucide-react";
import { toast } from "sonner";

// Branch name validation schema
const branchNameSchema = z.string()
  .min(1, "Branch name is required")
  .max(100, "Branch name must be less than 100 characters")
  .refine((name) => {
    // Check basic Git branch name rules
    if (name.startsWith('.') || name.endsWith('.')) return false;
    if (name.includes('..') || name.includes(' ')) return false;
    if (/[~^:?*\[\]\\]/.test(name)) return false;
    return true;
  }, "Invalid characters in branch name")
  .refine((name) => {
    // Check application-specific naming convention
    return /^(feat|fix|hotfix|chore|docs|style|refactor|test)\/[a-zA-Z0-9\-_]+$/.test(name);
  }, "Branch name must follow convention: feat/, fix/, hotfix/, chore/, docs/, style/, refactor/, or test/ followed by alphanumeric characters, hyphens, or underscores");

const createBranchSchema = z.object({
  branchName: branchNameSchema,
  baseBranch: z.string().min(1, "Base branch is required"),
});

type CreateBranchForm = z.infer<typeof createBranchSchema>;

interface CreateBranchModalProps {
  repositoryId: number;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const BRANCH_PREFIXES = [
  { value: "feat", label: "feat/ - New feature", description: "A new feature for the user" },
  { value: "fix", label: "fix/ - Bug fix", description: "A bug fix" },
  { value: "hotfix", label: "hotfix/ - Critical fix", description: "A critical bug fix for production" },
  { value: "chore", label: "chore/ - Maintenance", description: "Maintenance tasks, dependencies, etc." },
  { value: "docs", label: "docs/ - Documentation", description: "Documentation changes" },
  { value: "style", label: "style/ - Code style", description: "Code style changes (formatting, etc.)" },
  { value: "refactor", label: "refactor/ - Code refactoring", description: "Code refactoring without changing functionality" },
  { value: "test", label: "test/ - Tests", description: "Adding or updating tests" },
];

export function CreateBranchModal({ 
  repositoryId, 
  isOpen, 
  onClose, 
  onSuccess 
}: CreateBranchModalProps) {
  const [selectedPrefix, setSelectedPrefix] = useState<string>("");
  const [branchSuffix, setBranchSuffix] = useState<string>("");

  const form = useForm<CreateBranchForm>({
    resolver: zodResolver(createBranchSchema),
    defaultValues: {
      branchName: "",
      baseBranch: "",
    },
  });

  // Fetch branch stats to get allowed base branches
  const { data: branchStats } = api.dashboard.getBranchStats.useQuery(
    { repositoryId },
    { enabled: isOpen }
  );

  // Create branch mutation
  const createBranchMutation = api.dashboard.createBranch.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      form.reset();
      setSelectedPrefix("");
      setBranchSuffix("");
      onSuccess();
    },
    onError: (error) => {
      toast.error(`Failed to create branch: ${error.message}`);
    },
  });

  // Update branch name when prefix or suffix changes
  const updateBranchName = (prefix: string, suffix: string) => {
    if (prefix && suffix) {
      const branchName = `${prefix}/${suffix}`;
      form.setValue("branchName", branchName);
    } else {
      form.setValue("branchName", "");
    }
  };

  const handlePrefixChange = (prefix: string) => {
    setSelectedPrefix(prefix);
    updateBranchName(prefix, branchSuffix);
  };

  const handleSuffixChange = (suffix: string) => {
    setBranchSuffix(suffix);
    updateBranchName(selectedPrefix, suffix);
  };

  const onSubmit = (data: CreateBranchForm) => {
    createBranchMutation.mutate({
      repositoryId,
      branchName: data.branchName,
      baseBranch: data.baseBranch,
    });
  };

  const handleClose = () => {
    form.reset();
    setSelectedPrefix("");
    setBranchSuffix("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Create New Branch
          </DialogTitle>
          <DialogDescription>
            Create a new branch following the naming convention. Choose a prefix and provide a descriptive name.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Branch Stats */}
            {branchStats && (
              <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Branch Usage:</span>
                  <Badge variant={branchStats.remainingBranches > 0 ? "default" : "destructive"}>
                    {branchStats.branchesCreated}/{branchStats.branchLimit}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {branchStats.remainingBranches} branches remaining
                </div>
              </div>
            )}

            {/* Branch Prefix Selection */}
            <div className="space-y-3">
              <label className="text-sm font-medium">Branch Type</label>
              <div className="grid grid-cols-2 gap-2">
                {BRANCH_PREFIXES.map((prefix) => (
                  <button
                    key={prefix.value}
                    type="button"
                    onClick={() => handlePrefixChange(prefix.value)}
                    className={`p-3 text-left rounded-lg border transition-all ${
                      selectedPrefix === prefix.value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="font-medium text-sm">{prefix.label}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {prefix.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Branch Name Input */}
            <div className="space-y-3">
              <label className="text-sm font-medium">Branch Name</label>
              <div className="flex gap-2">
                <div className="flex items-center px-3 py-2 bg-muted rounded-md text-sm font-mono">
                  {selectedPrefix || "prefix"}/
                </div>
                <Input
                  placeholder="descriptive-name"
                  value={branchSuffix}
                  onChange={(e) => handleSuffixChange(e.target.value)}
                  className="flex-1 font-mono"
                />
              </div>
              {form.watch("branchName") && (
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="font-mono text-muted-foreground">
                    {form.watch("branchName")}
                  </span>
                </div>
              )}
              <FormField
                control={form.control}
                name="branchName"
                render={() => (
                  <FormItem className="hidden">
                    <FormControl>
                      <Input {...form.register("branchName")} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {form.formState.errors.branchName && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <span>{form.formState.errors.branchName.message}</span>
                </div>
              )}
            </div>

            {/* Base Branch Selection */}
            <FormField
              control={form.control}
              name="baseBranch"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Base Branch</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select base branch" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {branchStats?.allowedBaseBranches.map((branch) => (
                        <SelectItem key={branch} value={branch}>
                          {branch}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    The branch to create your new branch from
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={createBranchMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  createBranchMutation.isPending ||
                  !selectedPrefix ||
                  !branchSuffix ||
                  !form.watch("baseBranch") ||
                  (branchStats?.remainingBranches ?? 0) <= 0
                }
              >
                {createBranchMutation.isPending ? (
                  <>
                    <Plus className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Branch
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}