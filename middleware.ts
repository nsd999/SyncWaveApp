import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Exclude static assets, core APIs and resource files
  if (
    path.startsWith("/_next") ||
    path.startsWith("/api") ||
    path.includes(".") ||
    path === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get("syncwave-session")?.value;
  let hasSession = false;

  if (sessionCookie) {
    try {
      const parsed = JSON.parse(sessionCookie);
      if (parsed && parsed.userId) {
        hasSession = true;
      }
    } catch (e) {
      // Safe fallback on parsing error
    }
  }

  const isAuthRoute =
    path === "/login" ||
    path === "/signup" ||
    path === "/forgot-password" ||
    path === "/reset-password";

  const isProtectedRoute = path.startsWith("/dashboard");
  const isHomeRoute = path === "/";

  // Protection redirection rule
  if (!hasSession && isProtectedRoute) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Dashboard landing synchronization rule
  if (hasSession && isAuthRoute) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
