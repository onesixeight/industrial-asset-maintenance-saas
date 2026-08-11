import { afterEach, describe, expect, it, vi } from "vitest";

describe("AppModule logger configuration", () => {
  afterEach(() => {
    vi.doUnmock("nestjs-pino");
    vi.resetModules();
  });

  it("omits Pino's level option outside tests instead of passing undefined", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    let loggerOptions: { pinoHttp?: Record<string, unknown> } | undefined;

    try {
      process.env.NODE_ENV = "development";
      vi.doMock("nestjs-pino", () => ({
        LoggerModule: {
          forRoot: (options: { pinoHttp?: Record<string, unknown> }) => {
            loggerOptions = options;
            return class MockLoggerModule {};
          },
        },
      }));

      await import("./app.module");

      expect(loggerOptions).toBeDefined();
      expect(
        Object.prototype.hasOwnProperty.call(loggerOptions?.pinoHttp, "level"),
      ).toBe(false);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });
});
