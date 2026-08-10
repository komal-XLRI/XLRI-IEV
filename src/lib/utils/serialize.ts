/**
 * Mongoose lean documents contain ObjectId and Date instances, which cannot
 * cross the server/client component boundary. Everything handed to a client
 * component goes through here first.
 */
type Primitive = string | number | boolean | null | undefined;

/** Anything with `toHexString` is an ObjectId as far as serialisation cares. */
type HexIdLike = { toHexString: () => string };

export type Serialized<T> = T extends Date
  ? string
  : T extends HexIdLike
    ? string
    : T extends Primitive
      ? T
      : T extends Array<infer U>
        ? Array<Serialized<U>>
        : T extends object
          ? { [K in keyof T]: Serialized<T[K]> }
          : T;

function hasToHexString(value: object): value is { toHexString: () => string } {
  return (
    'toHexString' in value && typeof (value as { toHexString: unknown }).toHexString === 'function'
  );
}

export function serialize<T>(value: T): Serialized<T> {
  if (value === null || value === undefined) return value as Serialized<T>;

  if (value instanceof Date) return value.toISOString() as Serialized<T>;

  if (Array.isArray(value)) {
    return value.map((item) => serialize(item)) as Serialized<T>;
  }

  if (typeof value === 'object') {
    if (hasToHexString(value)) return value.toHexString() as Serialized<T>;
    if (value instanceof Map) {
      return serialize(Object.fromEntries(value)) as Serialized<T>;
    }

    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (key === '__v') continue;
      output[key] = serialize(nested);
    }
    return output as Serialized<T>;
  }

  return value as Serialized<T>;
}
