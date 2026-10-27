import { NextResponse, type NextRequest } from 'next/server';
import { loginPathFor, sanitizeReturnTo } from './lib/return-to';

// Only the cookie's presence can be checked here, not whose it is or whether it still works;
// the (app) layout catches a stale cookie once the session bootstrap fails.
export function proxy(request: NextRequest) {
  const { pathname, search, searchParams } = request.nextUrl;

  if (pathname === '/login') {
    const returnTo = searchParams.get('returnTo');
    if (returnTo !== null && sanitizeReturnTo(returnTo) === null) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return NextResponse.next();
  }

  if (!request.cookies.has('refreshToken')) {
    return NextResponse.redirect(new URL(loginPathFor(pathname, search), request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Everything except /login (handled above only to strip bad returnTo), Next internals and files with an extension.
  matcher: ['/((?!_next/|.*\\..*).*)'],
};
