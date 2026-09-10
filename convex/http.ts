import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";

const http = httpRouter();

http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () => {
    return new Response(JSON.stringify({ ok: true, service: "moj-convex", time: Date.now() }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }),
});

export default http;
