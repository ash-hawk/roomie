export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_REQUIREMENTS = `Use at least ${PASSWORD_MIN_LENGTH} characters with an uppercase letter, a lowercase letter, a number, and a symbol.`;

export function meetsPasswordRequirements(password: unknown): boolean {
  return typeof password === 'string'
    && [...password].length >= PASSWORD_MIN_LENGTH
    && /\p{Lu}/u.test(password)
    && /\p{Ll}/u.test(password)
    && /\p{Nd}/u.test(password)
    && /[\p{P}\p{S}]/u.test(password);
}
