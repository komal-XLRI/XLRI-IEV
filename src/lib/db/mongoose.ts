import mongoose, { type Mongoose } from 'mongoose';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';

/**
 * Next.js hot-reloads modules in development, which would otherwise open a new
 * connection pool on every request. The connection promise is cached on
 * globalThis so it survives module re-evaluation.
 */
type ConnectionCache = {
  connection: Mongoose | null;
  promise: Promise<Mongoose> | null;
  supportsTransactions: boolean | null;
};

const globalForMongoose = globalThis as typeof globalThis & {
  __ievMongoose?: ConnectionCache;
};

const cache: ConnectionCache = (globalForMongoose.__ievMongoose ??= {
  connection: null,
  promise: null,
  supportsTransactions: null,
});

// Reject writes for paths not declared in a schema.
mongoose.set('strictQuery', true);

export async function connectToDatabase(): Promise<Mongoose> {
  if (cache.connection) return cache.connection;

  if (!cache.promise) {
    const uri = env().MONGODB_URI;
    cache.promise = mongoose
      .connect(uri, {
        bufferCommands: false,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 10_000,
        autoIndex: env().NODE_ENV !== 'production',
      })
      .then((instance) => {
        logger.info('Connected to MongoDB');
        return instance;
      })
      .catch((error: unknown) => {
        cache.promise = null;
        logger.error('MongoDB connection failed', { error: String(error) });
        throw error;
      });
  }

  cache.connection = await cache.promise;
  return cache.connection;
}

export async function disconnectFromDatabase(): Promise<void> {
  if (cache.connection) {
    await cache.connection.disconnect();
  }
  cache.connection = null;
  cache.promise = null;
  cache.supportsTransactions = null;
}

/**
 * Transactions require a replica set or a sharded cluster. A standalone
 * mongod (common for local development) rejects them, so we probe once and
 * cache the answer.
 */
export async function supportsTransactions(): Promise<boolean> {
  if (cache.supportsTransactions !== null) return cache.supportsTransactions;

  const connection = await connectToDatabase();
  try {
    const admin = connection.connection.db?.admin();
    const info = (await admin?.command({ hello: 1 })) as
      { setName?: string; msg?: string } | undefined;
    cache.supportsTransactions = Boolean(info?.setName) || info?.msg === 'isdbgrid';
  } catch (error) {
    logger.warn('Could not determine transaction support; assuming unsupported', {
      error: String(error),
    });
    cache.supportsTransactions = false;
  }

  if (!cache.supportsTransactions) {
    logger.warn(
      'MongoDB deployment does not support transactions — multi-document writes will run without a session. Use a replica set in production.',
    );
  }

  return cache.supportsTransactions;
}
