import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Next.js 16 renamed the `middleware.ts` file convention to `proxy.ts` (same
// runtime semantics, new file/export name) — see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
const isPublicRoute = createRouteMatcher([
  "/",
  "/policy-generator(.*)",
  "/get-started(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks/(.*)",
  // Auth still required, but enforced inside the route via getFirmContextForApi() so it can
  // return a JSON error instead of the sign-in redirect auth.protect() would otherwise force —
  // meaningless to the extension's fetch()-based content-script caller. See
  // lib/auth/firm-context.ts and lib/db/schema/usage-events.ts.
  "/api/ai-tool-usage-events(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
