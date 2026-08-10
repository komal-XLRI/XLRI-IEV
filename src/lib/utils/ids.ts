import { Types } from 'mongoose';

export type Id = string | Types.ObjectId;

export function toObjectId(value: Id): Types.ObjectId {
  return typeof value === 'string' ? new Types.ObjectId(value) : value;
}

export function idToString(value: Id | null | undefined): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : value.toString();
}

export function isValidObjectId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    Types.ObjectId.isValid(value) &&
    String(new Types.ObjectId(value)) === value
  );
}

export function sameId(a: Id | null | undefined, b: Id | null | undefined): boolean {
  if (!a || !b) return false;
  return idToString(a) === idToString(b);
}
