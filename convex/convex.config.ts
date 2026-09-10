import aggregate from "@convex-dev/aggregate/convex.config.js";
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";
import { defineApp } from "convex/server";

const app = defineApp();

app.use(aggregate, { name: "profilesByPP" });
app.use(aggregate, { name: "profilesByRating" });
app.use(aggregate, { name: "profilesByProblemCount" });
app.use(aggregate, { name: "submissionsByProblemResult" });
app.use(rateLimiter);

export default app;
