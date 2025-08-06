import { SecurityDashboard } from '@/components/admin/security-dashboard';

export default function SecurityPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Security Dashboard</h1>
        <p className="text-muted-foreground">
          Monitor security violations, container compliance, and system threats
        </p>
      </div>
      
      <SecurityDashboard />
    </div>
  );
}