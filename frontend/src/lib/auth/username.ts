import { z } from "zod";

export const usernamePattern = /^[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/;
export const usernameSchema = z
  .string()
  .min(3, "Username phải có ít nhất 3 ký tự.")
  .max(24, "Username không được vượt quá 24 ký tự.")
  .regex(
    usernamePattern,
    "Dùng chữ không dấu, số và dấu gạch dưới đơn giữa các ký tự.",
  )
  .transform((value) => value.toLowerCase());

type SignupIdentity = { username: string; displayName: string };
const key = (uid: string) => `thv:signup-profile:${uid}`;

export function saveSignupIdentity(uid: string, value: SignupIdentity) {
  try {
    localStorage.setItem(key(uid), JSON.stringify(value));
  } catch {
    /* Registration still proceeds. */
  }
}

export function readSignupIdentity(uid: string): SignupIdentity | null {
  try {
    const value = JSON.parse(
      localStorage.getItem(key(uid)) ?? "null",
    ) as SignupIdentity | null;
    return value &&
      typeof value.displayName === "string" &&
      usernameSchema.safeParse(value.username).success
      ? value
      : null;
  } catch {
    return null;
  }
}

export function clearSignupIdentity(uid: string) {
  try {
    localStorage.removeItem(key(uid));
  } catch {
    /* Storage may be disabled. */
  }
}
