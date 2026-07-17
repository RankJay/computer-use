import { describe, expect, test } from "bun:test";

import {
  deviceExchangeErrorSchema,
  deviceExchangeSuccessSchema,
  parseAuthUserFromSession,
} from "@/lib/auth/types";

describe("deviceExchangeSuccessSchema", () => {
  test("accepts the backend exchange shape", () => {
    const parsed = deviceExchangeSuccessSchema.parse({
      sessionToken: "sess_abc",
      expiresAt: "2026-07-17T12:00:00.000Z",
      user: {
        id: "user_1",
        email: "a@example.com",
        name: "Ada",
        image: "https://example.com/a.png",
      },
    });
    expect(parsed.sessionToken).toBe("sess_abc");
    expect(parsed.user.image).toBe("https://example.com/a.png");
  });

  test("allows null image", () => {
    const parsed = deviceExchangeSuccessSchema.parse({
      sessionToken: "sess_abc",
      expiresAt: "2026-07-17T12:00:00.000Z",
      user: { id: "user_1", email: "a@example.com", name: "Ada", image: null },
    });
    expect(parsed.user.image).toBeNull();
  });
});

describe("deviceExchangeErrorSchema", () => {
  test("parses invalid_token errors", () => {
    const parsed = deviceExchangeErrorSchema.parse({
      error: "invalid_token",
      message: "Handoff token is invalid or expired.",
    });
    expect(parsed.error).toBe("invalid_token");
  });
});

describe("parseAuthUserFromSession", () => {
  test("returns null for unauthenticated null body", () => {
    expect(parseAuthUserFromSession(null)).toBeNull();
  });

  test("maps get-session user fields", () => {
    const user = parseAuthUserFromSession({
      session: {
        id: "s1",
        expiresAt: "2026-07-17T12:00:00.000Z",
        token: "tok",
        createdAt: "2026-07-17T11:00:00.000Z",
        updatedAt: "2026-07-17T11:00:00.000Z",
        userId: "user_1",
      },
      user: {
        id: "user_1",
        name: "Ada",
        email: "a@example.com",
        emailVerified: true,
        image: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    });
    expect(user).toEqual({
      id: "user_1",
      name: "Ada",
      email: "a@example.com",
      image: null,
    });
  });

  test("returns null for malformed payloads", () => {
    expect(parseAuthUserFromSession({ user: { email: "x" } })).toBeNull();
  });
});
