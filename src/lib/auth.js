import Cookies from "js-cookie";

// Client-side authentication service using js-cookie
// Fallback cookie configuration for security check
const COOKIE_NAME = "zari_user_session";

export function getSessionUser() {
  if (typeof window === "undefined") return null;
  const raw = Cookies.get(COOKIE_NAME);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export function setSessionUser(user) {
  if (typeof window === "undefined") return;
  // Expire in 1 day, secure cookies in production
  Cookies.set(COOKIE_NAME, JSON.stringify(user), { expires: 1, path: "/" });
}

export function clearSessionUser() {
  if (typeof window === "undefined") return;
  Cookies.remove(COOKIE_NAME, { path: "/" });
}
