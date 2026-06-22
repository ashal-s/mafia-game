import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";

/**
 * Routes that an unauthenticated visitor is allowed to reach. Everything else
 * requires a valid session.
 */
const PUBLIC_ROUTES = ["/", "/login", "/signup"];

function isPublicRoute(pathname: string) {
  if (PUBLIC_ROUTES.includes(pathname)) return true;
  // Auth callback/confirm endpoints must stay reachable while logged out.
  if (pathname.startsWith("/auth")) return true;
  // Invite links must work before the visitor has an account.
  if (pathname.startsWith("/join/")) return true;
  return false;
}

/**
 * Refreshes the Supabase auth session on every request and guards protected
 * routes. Called from the Next.js 16 `proxy` (formerly middleware).
 */
export async function updateSession(request: NextRequest) {
  const supabaseUrl = getSupabaseUrl();
  const supabaseAnonKey = getSupabaseAnonKey();

  // Without Supabase config the proxy cannot refresh sessions. Allow public
  // pages through so deploys missing env vars don't 500 the marketing site.
  if (!supabaseUrl || !supabaseAnonKey) {
    const { pathname } = request.nextUrl;
    if (isPublicRoute(pathname)) {
      return NextResponse.next({ request });
    }
    return new NextResponse(
      "Server misconfiguration: Supabase environment variables are not set.",
      { status: 503 },
    );
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  const { pathname } = request.nextUrl;

  // Logged-out users cannot reach protected pages.
  if (!claims && !isPublicRoute(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectedFrom", pathname);
    return NextResponse.redirect(url);
  }

  // Logged-in users have no reason to see the auth screens.
  if (claims && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
