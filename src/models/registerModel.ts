import mongoose, { type Model, type Schema } from 'mongoose';

/**
 * Idempotent model registration. Next.js re-evaluates modules on hot reload,
 * and `mongoose.model()` throws `OverwriteModelError` on the second call.
 */
export function registerModel<T>(name: string, schema: Schema<T>): Model<T> {
  return (mongoose.models[name] as Model<T>) ?? mongoose.model<T>(name, schema);
}
