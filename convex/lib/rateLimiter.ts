import { HOUR, MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  submit: { kind: "token bucket", rate: 10, period: MINUTE, capacity: 5 },
  register: { kind: "fixed window", rate: 5, period: HOUR },
  passwordReset: { kind: "fixed window", rate: 5, period: HOUR },
  commentPost: { kind: "token bucket", rate: 10, period: MINUTE, capacity: 3 },
});
