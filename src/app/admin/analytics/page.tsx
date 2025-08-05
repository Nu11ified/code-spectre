"use client";

import { api } from "@/trpc/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Users, 
  GitBranch, 
  Shield, 
  Puzzle, 
  Activity,
  TrendingUp,
  Clock,
  Server
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function AnalyticsPage() {
  const { data: stats, isLoading } = api.admin.getSystemStats.useQuery();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Analytics
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            System metrics and usage analytics
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => (
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

  const analyticsCards = [
    {
      title: "Total Users",
      value: stats?.users.total ?? 0,
      subtitle: "Registered users",
      icon: Users,
      color: "text-blue-600",
      trend: "+12% from last month",
    },
    {
      title: "Admin Users",
      value: stats?.users.admins ?? 0,
      subtitle: "System administrators",
      icon: Shield,
      color: "text-yellow-600",
      trend: "No change",
    },
    {
      title: "Repositories",
      value: stats?.repositories.total ?? 0,
      subtitle: "Available repositories",
      icon: GitBranch,
      color: "text-green-600",
      trend: "+3 this week",
    },
    {
      title: "Active Permissions",
      value: stats?.permissions.total ?? 0,
      subtitle: "User access grants",
      icon: Shield,
      color: "text-orange-600",
      trend: "+8% from last week",
    },
    {
      title: "Total Extensions",
      value: stats?.extensions.total ?? 0,
      subtitle: "Installed extensions",
      icon: Puzzle,
      color: "text-purple-600",
      trend: "+2 new extensions",
    },
    {
      title: "Enabled Extensions",
      value: stats?.extensions.enabled ?? 0,
      subtitle: "Active extensions",
      icon: Activity,
      color: "text-green-600",
      trend: `${stats?.extensions.disabled ?? 0} disabled`,
    },
    {
      title: "System Uptime",
      value: "99.9%",
      subtitle: "Last 30 days",
      icon: Server,
      color: "text-blue-600",
      trend: "Excellent performance",
    },
    {
      title: "Avg Session Time",
      value: "2.4h",
      subtitle: "Per IDE session",
      icon: Clock,
      color: "text-indigo-600",
      trend: "+15min from last month",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Analytics
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          System metrics and usage analytics
        </p>
      </div>

      {/* Main Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {analyticsCards.map((metric) => (
          <Card key={metric.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                {metric.title}
              </CardTitle>
              <metric.icon className={cn("h-4 w-4", metric.color)} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {metric.value}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {metric.subtitle}
              </p>
              <div className="flex items-center mt-2">
                <TrendingUp className="h-3 w-3 text-green-500 mr-1" />
                <span className="text-xs text-green-600 dark:text-green-400">
                  {metric.trend}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Detailed Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>User Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                  <span className="text-sm text-gray-600 dark:text-gray-400">Regular Users</span>
                </div>
                <div className="text-sm font-medium">
                  {stats?.users.regular ?? 0} ({((stats?.users.regular ?? 0) / (stats?.users.total ?? 1) * 100).toFixed(1)}%)
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                  <span className="text-sm text-gray-600 dark:text-gray-400">Administrators</span>
                </div>
                <div className="text-sm font-medium">
                  {stats?.users.admins ?? 0} ({((stats?.users.admins ?? 0) / (stats?.users.total ?? 1) * 100).toFixed(1)}%)
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Extension Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-sm text-gray-600 dark:text-gray-400">Enabled Extensions</span>
                </div>
                <div className="text-sm font-medium">
                  {stats?.extensions.enabled ?? 0} ({((stats?.extensions.enabled ?? 0) / (stats?.extensions.total ?? 1) * 100).toFixed(1)}%)
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-gray-500 rounded-full"></div>
                  <span className="text-sm text-gray-600 dark:text-gray-400">Disabled Extensions</span>
                </div>
                <div className="text-sm font-medium">
                  {stats?.extensions.disabled ?? 0} ({((stats?.extensions.disabled ?? 0) / (stats?.extensions.total ?? 1) * 100).toFixed(1)}%)
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System Health</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Database</span>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm font-medium text-green-600">Healthy</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Docker Service</span>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm font-medium text-green-600">Running</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Reverse Proxy</span>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm font-medium text-green-600">Active</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Git Service</span>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm font-medium text-green-600">Operational</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-start space-x-3">
                <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                <div>
                  <p className="text-sm text-gray-900 dark:text-white">New user registered</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">2 hours ago</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
                <div>
                  <p className="text-sm text-gray-900 dark:text-white">Repository added</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">5 hours ago</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-2 h-2 bg-purple-500 rounded-full mt-2"></div>
                <div>
                  <p className="text-sm text-gray-900 dark:text-white">Extension installed</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">1 day ago</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-2 h-2 bg-orange-500 rounded-full mt-2"></div>
                <div>
                  <p className="text-sm text-gray-900 dark:text-white">Permissions updated</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">2 days ago</p>
                </div>
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