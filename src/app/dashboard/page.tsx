import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { UserDashboard } from "@/components/dashboard/user-dashboard";
import { headers } from "next/headers";

export default async function DashboardPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/");
  }

  return <UserDashboard />;
}