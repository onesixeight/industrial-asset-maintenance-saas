import { describe, expect, it } from "vitest";
import { PrismaService } from "./prisma.service";

// NOTE: do NOT import @prisma/client here. When both this spec and
// prisma.service.ts statically import @prisma/client, vite-node creates two
// distinct transformed PrismaClient classes whose Proxy constructors refer
// to each other and recurse infinitely on instantiation. Getting the client
// only through PrismaService avoids the double transform.
const URL = "postgresql://iam:iam@localhost:5433/iam_test?schema=public";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const config = (url: string) =>
  ({ get: (k: string) => (k === "DATABASE_URL" ? url : undefined) }) as any;
const env = { DATABASE_URL: URL } as never;

describe("PrismaService", () => {
  it("constructs via driver adapter and exposes a usable client", () => {
    const svc = new PrismaService(config(URL), env);
    const client = svc.getClient();
    // Shape check (avoids importing the PrismaClient symbol here).
    expect(typeof client.user.findMany).toBe("function");
    expect(typeof svc.onModuleDestroy).toBe("function");
  });

  it("falls back to VALIDATED_ENV.DATABASE_URL when ConfigService has none", () => {
    const svc = new PrismaService(config("ignored"), env);
    expect(typeof svc.getClient().user.findUnique).toBe("function");
  });

  it("$disconnect delegates to the underlying client", async () => {
    const svc = new PrismaService(config(URL), env);
    await expect(svc.$disconnect()).resolves.toBeUndefined();
  });
});
