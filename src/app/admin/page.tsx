"use client";

import Link from "next/link";
import { api } from "@/trpc/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, GitBranch, Shield, Puzzle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminDashboard() {
  const { data: stats, isLoading } = api.admin.getSystemStats.useQuery();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Dashboard
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Overview of your Cloud IDE Orchestrator system
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
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
      </div>
    );
  }

  const statCards = [
    {
      title: "Total Users",
      value: stats?.users.total ?? 0,
      subtitle: `${stats?.users.admins ?? 0} admins, ${stats?.users.regular ?? 0} users`,
      icon: Users,
      color: "text-blue-600",
    },
    {
      title: "Repositories",
      value: stats?.repositories.total ?? 0,
      subtitle: "Active repositories",
      icon: GitBranch,
      color: "text-green-600",
    },
    {
      title: "Permissions",
      value: stats?.permissions.total ?? 0,
      subtitle: "User permissions assigned",
      icon: Shield,
      color: "text-orange-600",
    },
    {
      title: "Extensions",
      value: stats?.extensions.total ?? 0,
      subtitle: `${stats?.extensions.enabled ?? 0} enabled, ${stats?.extensions.disabled ?? 0} disabled`,
      icon: Puzzle,
      color: "text-purple-600",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Dashboard
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Overview of your Cloud IDE Orchestrator system
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                {stat.title}
              </CardTitle>
              <stat.icon className={cn("h-4 w-4", stat.color)} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {stat.value}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {stat.subtitle}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Link
                href="/admin/users"
                className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <Users className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium">Manage Users</span>
              </Link>
              <Link
                href="/admin/repositories"
                className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <GitBranch className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium">Add Repository</span>
              </Link>
              <Link
                href="/admin/permissions"
                className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <Shield className="h-4 w-4 text-orange-600" />
                <span className="text-sm font-medium">Set Permissions</span>
              </Link>
              <Link
                href="/admin/extensions"
                className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <Puzzle className="h-4 w-4 text-purple-600" />
                <span className="text-sm font-medium">Install Extension</span>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Database
                </span>
                <span className="text-sm font-medium text-green-600">
                  Connected
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Docker Service
                </span>
                <span className="text-sm font-medium text-green-600">
                  Running
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Reverse Proxy
                </span>
                <span className="text-sm font-medium text-green-600">
                  Active
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function cn(...classes: (string | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}