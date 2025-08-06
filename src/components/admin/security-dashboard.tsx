'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { api } from '@/trpc/react';
import { AlertTriangle, Shield, Activity, Users, Terminal, FileX } from 'lucide-react';
import { SecurityViolationType } from '@/types/domain';

export function SecurityDashboard() {
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  // Fetch security metrics
  const { data: securityMetrics, isLoading: metricsLoading, refetch: refetchMetrics } = 
    api.admin.getSecurityMetrics.useQuery();

  // Fetch session security monitoring
  const { data: sessionSecurity, isLoading: sessionsLoading, refetch: refetchSessions } = 
    api.admin.monitorSessionSecurity.useQuery();

  // Fetch comprehensive security audit
  const { data: securityAudit, isLoading: auditLoading, refetch: refetchAudit } = 
    api.admin.performSecurityAudit.useQuery();

  // Fetch user violations when a user is selected
  const { data: userViolations, isLoading: userViolationsLoading } = 
    api.admin.getUserSecurityViolations.useQuery(
      { userId: selectedUserId! },
      { enabled: selectedUserId !== null }
    );

  // Clear old violations mutation
  const clearViolationsMutation = api.admin.clearOldSecurityViolations.useMutation({
    onSuccess: () => {
      refetchMetrics();
    },
  });

  const handleClearOldViolations = async (days: number) => {
    try {
      await clearViolationsMutation.mutateAsync({ olderThanDays: days });
    } catch (error) {
      console.error('Failed to clear violations:', error);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getViolationTypeIcon = (type: SecurityViolationType) => {
    switch (type) {
      case SecurityViolationType.UNAUTHORIZED_NETWORK_ACCESS:
        return <Activity className="h-4 w-4" />;
      case SecurityViolationType.UNAUTHORIZED_FILE_ACCESS:
        return <FileX className="h-4 w-4" />;
      case SecurityViolationType.UNAUTHORIZED_COMMAND:
        return <Terminal className="h-4 w-4" />;
      case SecurityViolationType.TERMINAL_ACCESS_DENIED:
        return <Terminal className="h-4 w-4" />;
      case SecurityViolationType.RESOURCE_LIMIT_EXCEEDED:
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <Shield className="h-4 w-4" />;
    }
  };

  if (metricsLoading || sessionsLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <div className="h-4 bg-gray-200 rounded animate-pulse" />
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-gray-200 rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Security Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Violations</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {securityMetrics?.violations.totalViolations || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {securityMetrics?.violations.blockedActions || 0} blocked actions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Threats</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {securityMetrics?.violations.activeThreats || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Critical violations in last hour
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Container Security</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {sessionSecurity?.filter(s => s.securityCompliant).length || 0}/
              {sessionSecurity?.length || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Compliant containers
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Users with Violations</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Object.keys(securityMetrics?.violations.violationsByUser || {}).length}
            </div>
            <p className="text-xs text-muted-foreground">
              Unique users with security issues
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Active Threats Alert */}
      {securityMetrics?.violations.activeThreats && securityMetrics.violations.activeThreats > 0 && (
        <Alert className="border-red-200 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertTitle className="text-red-800">Active Security Threats Detected</AlertTitle>
          <AlertDescription className="text-red-700">
            {securityMetrics.violations.activeThreats} critical security violations detected in the last hour. 
            Immediate attention required.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="violations" className="space-y-4">
        <TabsList>
          <TabsTrigger value="violations">Security Violations</TabsTrigger>
          <TabsTrigger value="containers">Container Security</TabsTrigger>
          <TabsTrigger value="audit">Security Audit</TabsTrigger>
          <TabsTrigger value="users">User Violations</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
        </TabsList>

        <TabsContent value="violations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Violation Types</CardTitle>
              <CardDescription>
                Breakdown of security violations by type
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(securityMetrics?.violations.violationsByType || {}).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      {getViolationTypeIcon(type as SecurityViolationType)}
                      <span className="text-sm font-medium">
                        {type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}
                      </span>
                    </div>
                    <Badge variant="outline">{count}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="containers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Container Security Status</CardTitle>
              <CardDescription>
                Real-time security compliance monitoring for active containers
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {sessionSecurity?.map((session) => (
                  <div key={session.sessionId} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                          {session.sessionId.substring(0, 12)}...
                        </code>
                        <Badge 
                          variant={session.securityCompliant ? "default" : "destructive"}
                        >
                          {session.securityCompliant ? "Compliant" : "Non-Compliant"}
                        </Badge>
                        <Badge 
                          variant={session.healthy ? "default" : "destructive"}
                        >
                          {session.healthy ? "Healthy" : "Unhealthy"}
                        </Badge>
                      </div>
                    </div>
                    
                    {session.securityViolations && session.securityViolations.length > 0 && (
                      <div className="mt-2">
                        <p className="text-sm font-medium text-red-600 mb-1">Security Violations:</p>
                        <ul className="text-sm text-red-700 space-y-1">
                          {session.securityViolations.map((violation, index) => (
                            <li key={index} className="flex items-center space-x-1">
                              <AlertTriangle className="h-3 w-3" />
                              <span>{violation}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {session.resourceUsage && (
                      <div className="mt-2 grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">CPU:</span>
                          <span className="ml-1 font-medium">{session.resourceUsage.cpu.toFixed(1)}%</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Memory:</span>
                          <span className="ml-1 font-medium">
                            {Math.round(session.resourceUsage.memory / 1024 / 1024)}MB
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Limit:</span>
                          <span className="ml-1 font-medium">
                            {Math.round(session.resourceUsage.memoryLimit / 1024 / 1024)}MB
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Comprehensive Security Audit</CardTitle>
              <CardDescription>
                Detailed security analysis of all active sessions
              </CardDescription>
            </CardHeader>
            <CardContent>
              {auditLoading ? (
                <div className="text-sm text-muted-foreground">Loading audit results...</div>
              ) : securityAudit ? (
                <div className="space-y-6">
                  {/* Audit Summary */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {securityAudit.summary.compliantSessions}
                      </div>
                      <div className="text-xs text-muted-foreground">Compliant</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-600">
                        {securityAudit.summary.criticalRisk}
                      </div>
                      <div className="text-xs text-muted-foreground">Critical Risk</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-orange-600">
                        {securityAudit.summary.highRisk}
                      </div>
                      <div className="text-xs text-muted-foreground">High Risk</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-yellow-600">
                        {securityAudit.summary.mediumRisk}
                      </div>
                      <div className="text-xs text-muted-foreground">Medium Risk</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">
                        {securityAudit.summary.lowRisk}
                      </div>
                      <div className="text-xs text-muted-foreground">Low Risk</div>
                    </div>
                  </div>

                  {/* Audit Details */}
                  <div className="space-y-4">
                    {securityAudit.audits.map((audit) => (
                      <div key={audit.sessionId} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center space-x-2">
                            <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                              {audit.sessionId.substring(0, 12)}...
                            </code>
                            <span className="text-sm text-muted-foreground">
                              User {audit.userId} • Repo {audit.repositoryId} • {audit.branchName}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Badge 
                              variant={audit.audit.compliant ? "default" : "destructive"}
                            >
                              {audit.audit.compliant ? "Compliant" : "Non-Compliant"}
                            </Badge>
                            <Badge 
                              className={
                                audit.audit.riskLevel === 'critical' ? 'bg-red-100 text-red-800 border-red-200' :
                                audit.audit.riskLevel === 'high' ? 'bg-orange-100 text-orange-800 border-orange-200' :
                                audit.audit.riskLevel === 'medium' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
                                'bg-blue-100 text-blue-800 border-blue-200'
                              }
                            >
                              {audit.audit.riskLevel.toUpperCase()} RISK
                            </Badge>
                          </div>
                        </div>

                        {audit.audit.violations.length > 0 && (
                          <div className="mb-3">
                            <p className="text-sm font-medium text-red-600 mb-2">Security Violations:</p>
                            <ul className="text-sm text-red-700 space-y-1">
                              {audit.audit.violations.map((violation, index) => (
                                <li key={index} className="flex items-center space-x-1">
                                  <AlertTriangle className="h-3 w-3" />
                                  <span>{violation}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {audit.audit.recommendations.length > 0 && (
                          <div>
                            <p className="text-sm font-medium text-blue-600 mb-2">Recommendations:</p>
                            <ul className="text-sm text-blue-700 space-y-1">
                              {audit.audit.recommendations.map((recommendation, index) => (
                                <li key={index} className="flex items-center space-x-1">
                                  <Shield className="h-3 w-3" />
                                  <span>{recommendation}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No audit data available</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Users with Security Violations</CardTitle>
              <CardDescription>
                Click on a user to view their detailed violation history
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(securityMetrics?.violations.violationsByUser || {}).map(([userId, count]) => (
                  <div 
                    key={userId}
                    className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-gray-50 ${
                      selectedUserId === parseInt(userId) ? 'bg-blue-50 border-blue-200' : ''
                    }`}
                    onClick={() => setSelectedUserId(parseInt(userId))}
                  >
                    <div className="flex items-center space-x-2">
                      <Users className="h-4 w-4" />
                      <span className="font-medium">User {userId}</span>
                    </div>
                    <Badge variant="outline">{count} violations</Badge>
                  </div>
                ))}
              </div>

              {selectedUserId && (
                <div className="mt-6 border-t pt-4">
                  <h4 className="font-medium mb-3">Violations for User {selectedUserId}</h4>
                  {userViolationsLoading ? (
                    <div className="text-sm text-muted-foreground">Loading violations...</div>
                  ) : (
                    <div className="space-y-3">
                      {userViolations?.map((violation) => (
                        <div key={violation.id} className="border rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center space-x-2">
                              {getViolationTypeIcon(violation.type)}
                              <span className="font-medium text-sm">
                                {violation.type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}
                              </span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Badge className={getSeverityColor(violation.details.severity)}>
                                {violation.details.severity}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {new Date(violation.timestamp).toLocaleString()}
                              </span>
                            </div>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            <p><strong>Action:</strong> {violation.details.action}</p>
                            <p><strong>Resource:</strong> {violation.details.resource}</p>
                            <p><strong>Blocked:</strong> {violation.details.blocked ? 'Yes' : 'No'}</p>
                            {violation.metadata && (
                              <p><strong>Details:</strong> {JSON.stringify(violation.metadata)}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="maintenance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Security Maintenance</CardTitle>
              <CardDescription>
                Tools for managing security violations and system cleanup
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <h4 className="font-medium">Clear Old Violations</h4>
                  <p className="text-sm text-muted-foreground">
                    Remove security violations older than specified days to keep the system clean
                  </p>
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleClearOldViolations(7)}
                    disabled={clearViolationsMutation.isPending}
                  >
                    Clear 7+ days
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleClearOldViolations(30)}
                    disabled={clearViolationsMutation.isPending}
                  >
                    Clear 30+ days
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <h4 className="font-medium">Refresh Security Data</h4>
                  <p className="text-sm text-muted-foreground">
                    Update security metrics and container monitoring data
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    refetchMetrics();
                    refetchSessions();
                    refetchAudit();
                  }}
                >
                  Refresh Data
                </Button>
              </div>

              {securityMetrics?.violations.lastViolation && (
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium mb-2">Last Security Event</h4>
                  <p className="text-sm text-muted-foreground">
                    {new Date(securityMetrics.violations.lastViolation).toLocaleString()}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}