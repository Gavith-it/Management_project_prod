import { NextResponse } from "next/server";

export function middleware(request) {
  const { pathname } = request.nextUrl;
  const session = request.cookies.get("zari_user_session");

  let user = null;
  if (session) {
    try {
      user = JSON.parse(session.value);
    } catch (e) {
      // Invalid cookie, clean it
    }
  }

  // Redirect root path to login or appropriate screen
  if (pathname === "/") {
    if (user) {
      return NextResponse.redirect(
        new URL(user.role === "operator" ? "/shopfloor" : "/office", request.url)
      );
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Gated routes
  if (pathname.startsWith("/office")) {
    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (user.role === "operator") {
      return NextResponse.redirect(new URL("/shopfloor", request.url));
    }
  }

  if (pathname.startsWith("/shopfloor")) {
    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (user.role !== "operator") {
      return NextResponse.redirect(new URL("/office", request.url));
    }
  }

  if (pathname === "/login" && user) {
    return NextResponse.redirect(
      new URL(user.role === "operator" ? "/shopfloor" : "/office", request.url)
    );
  }

  return NextResponse.next();
}

// Matching paths to apply middleware check
export const config = {
  matcher: ["/", "/office/:path*", "/shopfloor/:path*", "/login"],
};
