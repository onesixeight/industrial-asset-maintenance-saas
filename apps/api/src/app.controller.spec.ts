import { Test } from "@nestjs/testing";
import { describe, it, expect } from "vitest";
import { AppController } from "./app.controller";

describe("AppController /health", () => {
  it("returns { status: 'ok', timestamp: <iso> }", () => {
    const before = Date.now();
    return Test.createTestingModule({ controllers: [AppController] })
      .compile()
      .then((moduleRef) => {
        const controller = moduleRef.get(AppController);
        const result = controller.health();
        expect(result.status).toBe("ok");
        const parsed = Date.parse(result.timestamp);
        expect(Number.isNaN(parsed)).toBe(false);
        expect(parsed).toBeGreaterThanOrEqual(before);
      });
  });
});
