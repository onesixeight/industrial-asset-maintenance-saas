import { ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

/**
 * Preserve the public 409 contract when a foreign-key reference is inserted
 * after a guarded count but before the hard delete reaches the database.
 */
export async function deleteWithForeignKeyConflict(
  operation: () => Promise<unknown>,
  message: string,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      throw new ConflictException(message);
    }
    throw error;
  }
}
