import { testPrisma } from "./db";

type WorkOrderLock = {
  release(): Promise<void>;
};

/**
 * Hold a row lock until the caller releases it. Tests use this as a database
 * barrier so competing HTTP requests can be placed in PostgreSQL's lock queue
 * in a known order, without relying on arbitrary sleeps.
 */
export async function holdWorkOrderLock(
  workOrderId: string,
): Promise<WorkOrderLock> {
  let releaseTransaction!: () => void;
  const releaseSignal = new Promise<void>((resolve) => {
    releaseTransaction = resolve;
  });

  let markAcquired!: () => void;
  const acquired = new Promise<void>((resolve) => {
    markAcquired = resolve;
  });

  const transaction = testPrisma()
    .getClient()
    .$transaction(
      async (tx) => {
        await tx.$queryRaw`
        SELECT id
        FROM "WorkOrder"
        WHERE id = ${workOrderId}
        FOR UPDATE
      `;
        markAcquired();
        await releaseSignal;
      },
      { timeout: 15_000 },
    );

  await acquired;

  return {
    async release() {
      releaseTransaction();
      await transaction;
    },
  };
}

/**
 * Wait until `expected` requests are blocked on a WorkOrder row lock. The
 * timeout only bounds a failed test; progress is synchronized through
 * PostgreSQL's own lock state rather than elapsed time.
 */
export async function waitForWorkOrderLockWaiters(
  expected: number,
): Promise<void> {
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    const [row] = await testPrisma().getClient().$queryRaw<
      Array<{ count: bigint }>
    >`
      SELECT COUNT(*)::bigint AS count
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND state = 'active'
        AND wait_event_type = 'Lock'
        AND query LIKE '%"WorkOrder"%'
    `;

    if (Number(row?.count ?? 0) >= expected) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  throw new Error(`Timed out waiting for ${expected} WorkOrder lock waiter(s)`);
}
