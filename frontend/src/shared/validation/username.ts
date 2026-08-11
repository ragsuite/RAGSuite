/** Shared username rules — must match sign-in / sign-up and profile update. */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 24;
/** Letters, numbers, underscore only (no hyphen/space). */
export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,24}$/;
