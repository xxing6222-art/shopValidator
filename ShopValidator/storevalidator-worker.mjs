function isApiPath(pathname) {
  return pathname === "/api" || pathname.startsWith("/api/");
}

/**
 * StoreValidator is a presentation-only deployment. It serves a separately
 * versioned frontend while forwarding its same-origin API calls to the
 * production decision service. This deliberately keeps model credentials,
 * D1 data, queues, and Durable Objects in one backend and prevents this
 * design-only deployment from consuming queue messages itself.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (isApiPath(url.pathname)) {
      const backendOrigin = String(env.BACKEND_ORIGIN || "https://shopvalidator.zhangyvjing.com").replace(/\/$/, "");
      const upstream = new URL(`${url.pathname}${url.search}`, backendOrigin);
      const upstreamRequest = new Request(upstream.toString(), request);
      const headers = new Headers(upstreamRequest.headers);
      // The browser is same-origin with this Worker, but the upstream service
      // correctly restricts cross-origin API access. The proxy is the explicit
      // trust boundary, so authenticate this hop as the backend's own origin.
      headers.set("Origin", new URL(backendOrigin).origin);
      const upstreamResponse = await fetch(new Request(upstreamRequest, { headers }));
      const publicCaseMatch = url.pathname.match(/^\/api\/public-cases\/([^/]+)$/);
      if (request.method === "GET" && upstreamResponse.status === 404 && publicCaseMatch) {
        try {
          const leaderboardUrl = new URL("/api/leaderboard", backendOrigin);
          const leaderboardResponse = await fetch(new Request(leaderboardUrl, { headers }));
          if (leaderboardResponse.ok) {
            const payload = await leaderboardResponse.json();
            const publicId = decodeURIComponent(publicCaseMatch[1]);
            const item = Array.isArray(payload?.cases)
              ? payload.cases.find((entry) => entry?.id === publicId)
              : null;
            if (item) {
              const responseHeaders = new Headers(leaderboardResponse.headers);
              responseHeaders.set("Content-Type", "application/json; charset=utf-8");
              responseHeaders.set("Cache-Control", "no-store");
              responseHeaders.delete("Content-Encoding");
              responseHeaders.delete("Content-Length");
              return new Response(JSON.stringify(item), { headers: responseHeaders });
            }
          }
        } catch {
          // Preserve the original 404 when the compatibility lookup is unavailable.
        }
      }
      return upstreamResponse;
    }
    // Keep public links stable and shareable.  The application is still a
    // static SPA, but these are real, canonical resources rather than hash
    // fragments that disappear when somebody opens a copied link elsewhere.
    if (request.method === "GET" || request.method === "HEAD") {
      if (url.pathname === "/ranking.html" || url.pathname === "/ranking/") {
        return Response.redirect(new URL("/ranking", url).toString(), 308);
      }
      if (url.pathname === "/ranking") {
        const assetUrl = new URL("/ranking.html", url);
        return env.ASSETS.fetch(new Request(assetUrl, request));
      }
      if (url.pathname === "/demo") {
        return Response.redirect(new URL("/demo/", url).toString(), 308);
      }
      const share = url.pathname.match(/^\/case\/([A-Za-z0-9_-]+)$/);
      if (share) {
        return Response.redirect(new URL(`/case/${share[1]}/`, url).toString(), 308);
      }
    }
    return env.ASSETS.fetch(request);
  }
};
