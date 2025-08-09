import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export function middleware(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  const isDashboard = request.nextUrl.pathname.startsWith("/dashboard");
  const isAuth = request.nextUrl.pathname.startsWith("/api/auth");

  if (isAuth) return NextResponse.next();

  if (!sessionCookie && isDashboard) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard", "/api/auth/:path*"],
};


