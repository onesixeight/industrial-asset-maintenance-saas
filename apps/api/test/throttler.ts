import type { INestApplication } from "@nestjs/common";
import { ThrottlerStorage } from "@nestjs/throttler";

/** Give every HTTP integration case an isolated rate-limit namespace. */
export async function resetThrottleStorage(
  app: INestApplication,
): Promise<void> {
  const storage = app.get(ThrottlerStorage) as unknown as {
    reset?: () => Promise<void>;
    storage?: Map<string, unknown>;
  };
  if (storage.reset) {
    await storage.reset();
  } else {
    storage.storage?.clear();
  }
}
