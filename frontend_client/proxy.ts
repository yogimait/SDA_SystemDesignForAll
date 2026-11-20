import { NextResponse } from "next/server";

/**
 * Auth, billing, admin, and project surfaces are private app state. Keep them
 * out of search results even if a crawler discovers a link before robots.txt.
 */
export function proxy(): NextResponse {
  const response = NextResponse.next();
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/dashboard/:path*",
    "/library/:path*",
    "/settings/:path*",
    "/billing/:path*",
    "/projects/:path*",
    "/login",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
  ],
};
