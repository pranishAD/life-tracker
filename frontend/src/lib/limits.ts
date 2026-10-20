// Field limits, copied from docs/api-contract.yaml (SEC-006).
// The backend rejects anything outside these with a 422; the forms use the
// same numbers so people normally never see that error. If the contract
// changes, update this one file — every form reads from here.

/** Max characters for text fields (HTML `maxLength`). */
export const TEXT_LIMITS = {
  userName: 120,
  password: 128,
  goalTitle: 200,
  goalDescription: 2000,
  goalUnit: 32,
  milestoneTitle: 200,
  checkInNote: 2000,
} as const;

/** bcrypt only looks at the first 72 bytes, so the backend caps the password
 * at 72 bytes of UTF-8 (on top of the 128-character limit). */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;

/** Number ranges. "Exclusive" means the edge value itself is NOT allowed
 * (e.g. target must be > 0 and < 1e10). */
export const NUMBER_LIMITS = {
  /** Goal target_value: 0 < x < 1e10 */
  targetValueMaxExclusive: 1e10,
  /** Goal weight and category weight: 0 < x < 1000 */
  weightMaxExclusive: 1000,
  /** Goal frequency_per_week: 1..100 (inclusive, whole numbers) */
  frequencyMin: 1,
  frequencyMax: 100,
  /** Check-in value: -1e10 < x < 1e10 */
  checkInValueAbsMaxExclusive: 1e10,
} as const;

/** UTF-8 byte length of a string (an emoji is 1-2 characters but 4 bytes). */
export function utf8ByteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}
