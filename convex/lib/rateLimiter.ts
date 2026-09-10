import { DAY, HOUR, MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";

/** `settings.DMOJ_SUBMISSION_LIMIT_DAILY`: submissions a user may make in a day. */
export const SUBMISSION_DAILY_LIMIT = 500;

/**
 * Every rate limit in one place, so a limit can be found and changed without
 * reading the module that happens to apply it.
 */
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  submit: { kind: "token bucket", rate: 10, period: MINUTE, capacity: 5 },
  submitDaily: { kind: "fixed window", rate: SUBMISSION_DAILY_LIMIT, period: DAY },
  register: { kind: "fixed window", rate: 5, period: HOUR },
  passwordReset: { kind: "fixed window", rate: 5, period: HOUR },
  commentPost: { kind: "token bucket", rate: 10, period: MINUTE, capacity: 3 },
});
