/**
 * The API v2 wire contract.
 *
 * These assert the envelope DMOJ's `APIMixin` builds and the filter names its
 * views declare, so a rename in the Convex layer or a route handler fails here
 * first.
 */

import { describe, expect, test } from "vitest";
import {
  API_BASIC_FILTERS,
  API_LIST_FILTERS,
  API_PAGE_SIZE,
  API_VERSION,
  apiContestListObject,
  apiErrorResponse,
  apiUserListObject,
  detailResponse,
  listResponse,
  parseApiBoolean,
  parsePageNumber,
} from "../src/apiV2.js";

describe("the envelope", () => {
  test("a list response is DMOJ's `get_base_response` plus `get_api_data`", () => {
    const schema = listResponse(apiUserListObject);
    const parsed = schema.parse({
      api_version: "2.0",
      method: "get",
      fetched: "2026-09-10T00:00:00.000Z",
      data: {
        current_object_count: 1,
        objects_per_page: API_PAGE_SIZE,
        page_index: 1,
        has_more: false,
        total_objects: 1,
        total_pages: 1,
        objects: [
          {
            id: 1,
            username: "alice",
            points: 10,
            performance_points: 9.5,
            problem_count: 1,
            rank: "user",
            rating: null,
          },
        ],
      },
    });
    expect(parsed.data.objects_per_page).toBe(1000);
  });

  test("an infinite page omits the totals", () => {
    const schema = listResponse(apiUserListObject);
    const parsed = schema.parse({
      api_version: API_VERSION,
      method: "get",
      fetched: "2026-09-10T00:00:00.000Z",
      data: {
        current_object_count: 0,
        objects_per_page: API_PAGE_SIZE,
        page_index: 3,
        has_more: true,
        objects: [],
      },
    });
    expect(parsed.data.total_objects).toBeUndefined();
    expect(parsed.data.total_pages).toBeUndefined();
  });

  test("a detail response wraps a single object", () => {
    const schema = detailResponse(apiContestListObject);
    const parsed = schema.parse({
      api_version: "2.0",
      method: "get",
      fetched: "2026-09-10T00:00:00.000Z",
      data: {
        object: {
          key: "spring",
          name: "Spring",
          start_time: "2026-03-01T00:00:00.000Z",
          end_time: "2026-03-02T00:00:00.000Z",
          time_limit: null,
          is_rated: false,
          rate_all: false,
          tags: [],
        },
      },
    });
    expect(parsed.data.object.key).toBe("spring");
  });

  test("an error response has no data block", () => {
    const parsed = apiErrorResponse.parse({
      api_version: "2.0",
      method: "get",
      fetched: "2026-09-10T00:00:00.000Z",
      error: { code: 404, message: "page/object not found" },
    });
    expect(parsed.error.code).toBe(404);
    expect("data" in parsed).toBe(false);
  });

  test("the api version is a literal", () => {
    expect(() =>
      apiErrorResponse.parse({
        api_version: "1.0",
        method: "get",
        fetched: "now",
        error: { code: 400, message: "bad" },
      }),
    ).toThrow();
  });
});

describe("filters", () => {
  test("the declared filter names are DMOJ's", () => {
    expect(API_BASIC_FILTERS.contests).toEqual(["is_rated"]);
    expect(API_BASIC_FILTERS.problems).toEqual(["partial"]);
    expect(API_BASIC_FILTERS.submissions).toEqual(["user", "problem", "contest"]);
    expect(API_BASIC_FILTERS.participations).toEqual([
      "contest",
      "user",
      "is_disqualified",
      "virtual_participation_number",
    ]);
    expect(API_BASIC_FILTERS.organizations).toEqual(["is_open"]);
    expect(API_BASIC_FILTERS.languages).toEqual(["common_name"]);

    expect(API_LIST_FILTERS.contests).toEqual(["key", "tag", "organization"]);
    expect(API_LIST_FILTERS.problems).toEqual(["code", "group", "type", "organization"]);
    expect(API_LIST_FILTERS.users).toEqual(["id", "username", "organization"]);
    expect(API_LIST_FILTERS.submissions).toEqual(["id", "language", "result"]);
    expect(API_LIST_FILTERS.organizations).toEqual(["id"]);
    expect(API_LIST_FILTERS.languages).toEqual(["id", "key"]);
  });

  test("booleans follow Django's spelling", () => {
    expect(parseApiBoolean("true")).toBe(true);
    expect(parseApiBoolean("True")).toBe(true);
    expect(parseApiBoolean("1")).toBe(true);
    expect(parseApiBoolean("false")).toBe(false);
    expect(parseApiBoolean("0")).toBe(false);
    expect(() => parseApiBoolean("yes")).toThrow(TypeError);
  });

  test("the page number must be a positive integer", () => {
    expect(parsePageNumber(null)).toBe(1);
    expect(parsePageNumber("")).toBe(1);
    expect(parsePageNumber("7")).toBe(7);
    expect(Number.isNaN(parsePageNumber("0"))).toBe(true);
    expect(Number.isNaN(parsePageNumber("-1"))).toBe(true);
    expect(Number.isNaN(parsePageNumber("last"))).toBe(true);
  });
});

describe("object ids", () => {
  test("an id may be a Django primary key or a Convex document id", () => {
    expect(
      apiUserListObject.parse({
        id: 12,
        username: "a",
        points: 0,
        performance_points: 0,
        problem_count: 0,
        rank: "user",
        rating: null,
      }).id,
    ).toBe(12);

    expect(
      apiUserListObject.parse({
        id: "j57abc",
        username: "a",
        points: 0,
        performance_points: 0,
        problem_count: 0,
        rank: "user",
        rating: null,
      }).id,
    ).toBe("j57abc");
  });
});
