import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { registerJudgeRoutes } from "./http/judge";
import { registerProblemsApiRoutes } from "./http/problemsApi";

const http = httpRouter();

registerJudgeRoutes(http);

registerProblemsApiRoutes(http);

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
