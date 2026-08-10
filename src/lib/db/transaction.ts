import type { ClientSession } from 'mongoose';
import { connectToDatabase, supportsTransactions } from './mongoose';

/**
 * Runs `work` inside a MongoDB transaction when the deployment supports one,
 * and directly otherwise (standalone mongod during local development).
 *
 * Callers must pass the session through to every write so that the atomic path
 * is genuinely atomic; the non-transactional fallback receives `null` and the
 * writes simply execute in order.
 */
export async function withTransaction<T>(
  work: (session: ClientSession | null) => Promise<T>,
): Promise<T> {
  const mongooseInstance = await connectToDatabase();

  if (!(await supportsTransactions())) {
    return work(null);
  }

  const session = await mongooseInstance.startSession();
  try {
    let result: T;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result!;
  } finally {
    await session.endSession();
  }
}

/** Spreads `{ session }` into a query option object only when a session exists. */
export function sessionOption(session: ClientSession | null): { session?: ClientSession } {
  return session ? { session } : {};
}
