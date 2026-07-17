import { z } from "zod";

export const authUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  image: z.string().nullable(),
});

export type AuthUser = z.infer<typeof authUserSchema>;

export const deviceExchangeSuccessSchema = z.object({
  sessionToken: z.string().min(1),
  expiresAt: z.string(),
  user: authUserSchema,
});

export type DeviceExchangeSuccess = z.infer<typeof deviceExchangeSuccessSchema>;

export const deviceExchangeErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
});

export type DeviceExchangeError = z.infer<typeof deviceExchangeErrorSchema>;

const sessionPayloadSchema = z.object({
  session: z.object({
    id: z.string(),
    expiresAt: z.union([z.string(), z.coerce.date()]),
    token: z.string(),
    createdAt: z.union([z.string(), z.coerce.date()]),
    updatedAt: z.union([z.string(), z.coerce.date()]),
    ipAddress: z.string().nullable().optional(),
    userAgent: z.string().nullable().optional(),
    userId: z.string(),
  }),
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    emailVerified: z.boolean(),
    image: z.string().nullable(),
    createdAt: z.union([z.string(), z.coerce.date()]),
    updatedAt: z.union([z.string(), z.coerce.date()]),
  }),
});

export function parseAuthUserFromSession(payload: unknown): AuthUser | null {
  if (payload === null) {
    return null;
  }
  const parsed = sessionPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return null;
  }
  return {
    id: parsed.data.user.id,
    email: parsed.data.user.email,
    name: parsed.data.user.name,
    image: parsed.data.user.image,
  };
}

export class AuthApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "AuthApiError";
    this.code = code;
    this.status = status;
  }
}
