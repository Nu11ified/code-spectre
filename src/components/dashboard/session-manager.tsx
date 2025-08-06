"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ExternalLink, 
  Square, 
  RefreshCw, 
  Clock, 
  Activity,
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface Session {
  id: number;
  repositoryId: number;
  repositoryName: string;
  branchName: string;
  containerId: string;
  containerUrl: string;
  status: string;
  lastAccessedAt: Date;
  createdAt: Date;
}

interface SessionManagerProps {
  sessions: Session[] | undefined;
  isLoading: boolean;
  onRefresh: () => void;
}

export function SessionManager({ sessions, isLoading, onRefresh }: SessionManagerProps) {
  const [stoppingSessions, setStoppingSessions] = useState<Set<string>>(new Set());

  // Stop session mutation
  const stopSessionMutation = api.session.stop.useMutation({
    onSuccess: (data, variables) => {
      toast.success("IDE session stopped successfully");
      setStoppingSessions(prev => {
        const newSet = new Set(prev);
        newSet.delete(variables.sessionId);
        return newSet;
      });
      onRefresh();
    },
    onError: (error, variables) => {
      toast.error(`Failed to stop session: ${error.message}`);
      setStoppingSessions(prev => {
        const newSet = new Set(prev);
        newSet.delete(variables.sessionId);
        return newSet;
      });
    },
  });

  const handleStopSession = (sessionId: string) => {
    setStoppingSessions(prev => new Set(prev).add(sessionId));
    stopSessionMutation.mutate({ sessionId });
  };

  const handleOpenSession = (url: string) => {
    window.open(url, '_blank');
  };

  const getStatusColor = (status: string) => {
    switch (status as 'running' | 'stopped' | 'error') {
      case 'running':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'stopped':
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
      case 'error':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status as 'running' | 'stopped' | 'error') {
      case 'running':
        return <Activity className="h-3 w-3" />;
      case 'stopped':
        return <Square className="h-3 w-3" />;
      case 'error':
        return <AlertCircle className="h-3 w-3" />;
      default:
        return <Square className="h-3 w-3" />;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="bg-white/10 border-white/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-5 w-3/4 bg-white/20" />
                  <Skeleton className="h-4 w-1/2 bg-white/20" />
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-8 w-20 bg-white/20" />
                  <Skeleton className="h-8 w-16 bg-white/20" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!sessions || sessions.length === 0) {
    return (
      <Card className="bg-white/10 border-white/20">
        <CardContent className="p-6 text-center">
          <Activity className="h-12 w-12 text-white/50 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">
            No active sessions
          </h3>
          <p className="text-gray-300">
            Launch an IDE session from a repository to get started.
          </p>
        </CardContent>
      </Card>
    );
  }

  const runningSessions = sessions.filter(s => s.status === 'running');
  const stoppedSessions = sessions.filter(s => s.status !== 'running');

  return (
    <div className="space-y-6">
      {/* Running Sessions */}
      {runningSessions.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-white flex items-center gap-2">
              <Activity className="h-5 w-5 text-green-400" />
              Active Sessions ({runningSessions.length})
            </h3>
            <Button
              onClick={onRefresh}
              variant="ghost"
              size="sm"
              className="text-white/70 hover:text-white"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-3">
            {runningSessions.map((session) => (
              <Card key={session.id} className="bg-white/10 border-white/20">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-3">
                        <h4 className="font-medium text-white">
                          {session.repositoryName}
                        </h4>
                        <Badge className={`text-xs ${getStatusColor(session.status)}`}>
                          {getStatusIcon(session.status)}
                          {session.status}
                        </Badge>
                      </div>
                      
                      <div className="text-sm text-gray-300">
                        <p className="flex items-center gap-2">
                          <span className="font-mono bg-white/10 px-2 py-1 rounded text-xs">
                            {session.branchName}
                          </span>
                        </p>
                        <p className="flex items-center gap-2 mt-1">
                          <Clock className="h-3 w-3" />
                          Last accessed {formatDistanceToNow(new Date(session.lastAccessedAt), { addSuffix: true })}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleOpenSession(session.containerUrl)}
                        size="sm"
                        className="bg-primary hover:bg-primary/90"
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Open IDE
                      </Button>
                      
                      <Button
                        onClick={() => handleStopSession(session.containerId)}
                        disabled={stoppingSessions.has(session.containerId)}
                        variant="outline"
                        size="sm"
                        className="text-white border-white/20 hover:bg-red-500/20 hover:border-red-500/50"
                      >
                        {stoppingSessions.has(session.containerId) ? (
                          <>
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            Stopping...
                          </>
                        ) : (
                          <>
                            <Square className="h-4 w-4 mr-2" />
                            Stop
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Recent Sessions */}
      {stoppedSessions.length > 0 && (
        <div>
          <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-gray-400" />
            Recent Sessions ({stoppedSessions.length})
          </h3>

          <div className="space-y-3">
            {stoppedSessions.slice(0, 5).map((session) => (
              <Card key={session.id} className="bg-white/5 border-white/10">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-3">
                        <h4 className="font-medium text-white/80">
                          {session.repositoryName}
                        </h4>
                        <Badge className={`text-xs ${getStatusColor(session.status)}`}>
                          {getStatusIcon(session.status)}
                          {session.status}
                        </Badge>
                      </div>
                      
                      <div className="text-sm text-gray-400">
                        <p className="flex items-center gap-2">
                          <span className="font-mono bg-white/5 px-2 py-1 rounded text-xs">
                            {session.branchName}
                          </span>
                        </p>
                        <p className="flex items-center gap-2 mt-1">
                          <Clock className="h-3 w-3" />
                          Stopped {formatDistanceToNow(new Date(session.lastAccessedAt), { addSuffix: true })}
                        </p>
                      </div>
                    </div>

                    <div className="text-xs text-gray-500">
                      Session ended
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {stoppedSessions.length > 5 && (
            <div className="text-center mt-4">
              <p className="text-sm text-gray-400">
                And {stoppedSessions.length - 5} more sessions...
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}