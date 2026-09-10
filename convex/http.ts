import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { registerProblemsApiRoutes } from "./http/problemsApi";

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

registerProblemsApiRoutes(http);

export default http;
