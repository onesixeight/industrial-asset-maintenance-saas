import { z } from "zod";

const LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
]);
const PRODUCTION_SECRET_PLACEHOLDERS = new Set([
  "change-me-in-real-env",
  "dev-only-secret-change-before-prod-123456",
]);

function isUnsafeProductionUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol !== "https:" || LOCAL_HOSTS.has(url.hostname.toLowerCase())
    );
  } catch {
    return true;
  }
}

function hasUnsafeProductionCorsOrigin(value: string): boolean {
  return value.split(",").some((origin) => {
    const trimmed = origin.trim();
    if (!trimmed || trimmed === "*") return true;
    return isUnsafeProductionUrl(trimmed);
  });
}

function serviceUrl(protocols: ReadonlySet<string>, label: string) {
  return z
    .string()
    .url()
    .refine(
      (value) => {
        try {
          return protocols.has(new URL(value).protocol);
        } catch {
          return false;
        }
      },
      { message: `${label} must use ${[...protocols].join(" or ")}` },
    );
}

const DURATION_MULTIPLIERS = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
} as const;

function boundedDuration(
  label: string,
  minimumMs: number,
  maximumMs: number,
  fallback: string,
) {
  return z
    .string()
    .default(fallback)
    .refine((value) => {
      const match = /^(\d+)(s|m|h|d)$/.exec(value);
      if (!match) return false;
      const amount = Number(match[1]);
      const durationMs =
        amount *
        DURATION_MULTIPLIERS[match[2] as keyof typeof DURATION_MULTIPLIERS];
      return (
        Number.isSafeInteger(amount) &&
        amount > 0 &&
        durationMs >= minimumMs &&
        durationMs <= maximumMs
      );
    }, `${label} must be a bounded integer duration using s, m, h, or d`);
}

const baseEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().default(4000),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  DATABASE_URL: serviceUrl(
    new Set(["postgres:", "postgresql:"]),
    "DATABASE_URL",
  ),
  REDIS_URL: serviceUrl(new Set(["redis:", "rediss:"]), "REDIS_URL"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_ACCESS_TTL: boundedDuration("JWT_ACCESS_TTL", 60_000, 15 * 60_000, "15m"),
  JWT_REFRESH_TTL: boundedDuration(
    "JWT_REFRESH_TTL",
    3_600_000,
    30 * 86_400_000,
    "7d",
  ),
  CORS_ORIGIN: z.string().optional(),
  // Origin the QR code payload points at (scanned QR opens this + /assets/qr/:token).
  PUBLIC_SCAN_BASE: z.string().url().optional(),
});

export const envSchema = baseEnvSchema
  .transform((env) => ({
    ...env,
    CORS_ORIGIN: env.CORS_ORIGIN ?? "http://localhost:3000",
    PUBLIC_SCAN_BASE: env.PUBLIC_SCAN_BASE ?? "http://localhost:3000",
  }))
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;

    if (new URL(env.REDIS_URL).protocol !== "rediss:") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["REDIS_URL"],
        message: "production REDIS_URL must use TLS (rediss:)",
      });
    }

    if (PRODUCTION_SECRET_PLACEHOLDERS.has(env.JWT_SECRET)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_SECRET"],
        message: "production JWT_SECRET must not use a documented placeholder",
      });
    }

    if (hasUnsafeProductionCorsOrigin(env.CORS_ORIGIN)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CORS_ORIGIN"],
        message:
          "production CORS_ORIGIN must be explicit HTTPS non-local origin(s)",
      });
    }

    if (isUnsafeProductionUrl(env.PUBLIC_SCAN_BASE)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["PUBLIC_SCAN_BASE"],
        message: "production PUBLIC_SCAN_BASE must be an HTTPS non-local URL",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Validate process.env at startup; throws if invalid. */
export function validateEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const errors = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${errors}`);
  }
  return parsed.data;
}
