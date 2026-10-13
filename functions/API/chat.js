export async function onRequest({ request, env }) {
  if (!["GET", "POST", "OPTIONS"].includes(request.method)) {
    return new Response("Method not allowed", { status: 405 });
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (!env.FLATMMO_AI) {
    return new Response(JSON.stringify({
      error: "service_binding_missing",
      message: "Cloudflare Pages is missing the FLATMMO_AI service binding."
    }), {
      status: 503,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }

  const headers = new Headers();
  headers.set("Accept", request.headers.get("Accept") || "application/json");

  // The existing Worker accepts normal browser-origin traffic and rate limits it.
  // Present the same trusted public-site origin when calling it internally.
  headers.set("Origin", "https://etherealaporia-alt.github.io");

  const contentType = request.headers.get("Content-Type");
  if (contentType) headers.set("Content-Type", contentType);

  const clientId = request.headers.get("X-FlatMMO-Client");
  if (clientId) headers.set("X-FlatMMO-Client", clientId);

  const internalRequest = new Request("https://flatmmo-internal/", {
    method: request.method,
    headers,
    body: request.method === "POST" ? await request.arrayBuffer() : undefined
  });

  try {
    const upstream = await env.FLATMMO_AI.fetch(internalRequest);

    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.delete("access-control-allow-origin");
    responseHeaders.delete("access-control-allow-credentials");
    responseHeaders.delete("vary");
    responseHeaders.set("x-flatmmo-relay", "cloudflare-service-binding");

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: "service_binding_error",
      message: String(error?.message || error)
    }), {
      status: 502,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }
}
