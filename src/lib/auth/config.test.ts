import { describe, expect, test } from "bun:test";

import { getActuateApiUrl, getActuateWebUrl, getSignInUrl } from "@/lib/auth/config";

describe("auth config defaults", () => {
  test("defaults to local API and web origins", () => {
    expect(getActuateApiUrl()).toBe("http://localhost:8000");
    expect(getActuateWebUrl()).toBe("http://localhost:3000");
    expect(getSignInUrl()).toBe("http://localhost:3000/login");
  });
});
