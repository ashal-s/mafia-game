import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Routes that an unauthenticated visitor is allowed to reach. Everything else
 * requires a valid session.
 */
const PUBLIC_ROUTES = ["/", "/login", "/signup"];

function isPublicRoute(pathname: string) {
  if (PUBLIC_ROUTES.includes(pathname)) return true;
  // Auth callback/confirm endpoints must stay reachable while logged out.
  return pathname.startsWith("/auth");
}

/**
 * Refreshes the Supabase auth session on every request and guards protected
 * routes. Called from the Next.js 16 `proxy` (formerly middleware).
 *
 * Do not run logic between creating the client and calling `getClaims()` —
 * doing so can make sessions hard to debug. See the Supabase SSR guide.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
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
    },
  );

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
