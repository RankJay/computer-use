import { describe, expect, mock, test } from "bun:test";

import { QueryClient } from "@tanstack/react-query";

import { authKeys } from "@/lib/auth/keys";
import type { AuthUser } from "@/lib/auth/types";

const getSessionTokenMock = mock(async (): Promise<string | null> => null);

mock.module("@/lib/auth/token-store", () => ({
  getSessionToken: getSessionTokenMock,
}));

const { resolveEntitlementSubjectId } = await import("./subject");

describe("resolveEntitlementSubjectId", () => {
  test("uses cached auth user id when present", async () => {
    const client = new QueryClient();
    const user: AuthUser = {
      id: "user-123",
      email: "a@b.com",
      name: "Ada",
      image: null,
    };
    client.setQueryData(authKeys.session(), user);
    expect(await resolveEntitlementSubjectId(client)).toBe("user:user-123");
  });

  test("returns anonymous when no cache and no token", async () => {
    getSessionTokenMock.mockResolvedValueOnce(null);
    const client = new QueryClient();
    expect(await resolveEntitlementSubjectId(client)).toBe("anonymous");
  });

  test("stays anonymous while token exists but session cache empty", async () => {
    getSessionTokenMock.mockResolvedValueOnce("ott-token");
    const client = new QueryClient();
    expect(await resolveEntitlementSubjectId(client)).toBe("anonymous");
  });
});
