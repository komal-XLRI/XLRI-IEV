import mongoose, { type Model, type Schema } from 'mongoose';

/**
 * Idempotent model registration. Next.js re-evaluates modules on hot reload,
 * and `mongoose.model()` throws `OverwriteModelError` on the second call.
 *
 * Outside production the model is rebuilt from the re-evaluated schema rather
 * than reused: reusing it kept the schema from when the dev server started, so
 * an edited schema (a renamed field, a new required path) went on validating
 * against the old one until a restart. Production evaluates each model once,
 * so it keeps the reuse.
 */
export function registerModel<T>(name: string, schema: Schema<T>): Model<T> {
  if (process.env.NODE_ENV !== 'production' && mongoose.models[name]) {
    mongoose.deleteModel(name);
  }
  return (mongoose.models[name] as Model<T>) ?? mongoose.model<T>(name, schema);
}
