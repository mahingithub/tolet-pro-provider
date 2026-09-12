/**
 * authService.js — merchant sign-in.
 * ──────────────────────────────────────────────────────────────────────────
 * A shopkeeper is NOT a To-Let Pro user. The provider platform is a separate
 * system with its own identity collection, its own login surface
 * (`/api/merchant/auth/*`) and its own token audience — a rental account is
 * neither required nor useful here, and To-Let Pro's roles stay tenant ↔
 * landlord.
 *
 * That means someone who happens to ALSO rent a flat holds two accounts with
 * two passwords, which is the deliberate trade: a shopkeeper should never have
 * to go through a tenancy system to sell gas cylinders.
 */

import { apiFetch } from './apiClient.js';
import { setSession, clearSession } from './session.js';

/** Phone + password sign-in. */
export async function login({ phone, password }) {
  const data = await apiFetch('/merchant/auth/login', {
    method: 'POST',
    auth: false,
    body: { phone, password },
  });
  setSession({ token: data.token, user: data.merchant });
  return data.merchant;
}

/** Step 1 of signup — sends the OTP. */
export async function startSignup({ name, phone, password }) {
  return apiFetch('/merchant/auth/signup/start', {
    method: 'POST',
    auth: false,
    body: { name, phone, password },
  });
}

/** Step 2 of signup — verifies the OTP and opens the session. */
export async function verifySignup({ phone, otp }) {
  const data = await apiFetch('/merchant/auth/signup/verify', {
    method: 'POST',
    auth: false,
    body: { phone, otp },
  });
  setSession({ token: data.token, user: data.merchant });
  return data.merchant;
}

/** Who am I, per the server. The source of truth on every boot. */
export async function fetchMe() {
  const data = await apiFetch('/merchant/auth/me');
  if (data.merchant) setSession({ user: data.merchant });
  return data.merchant;
}

export async function logout() {
  try {
    await apiFetch('/merchant/auth/logout', { method: 'POST' });
  } catch {
    // A failed logout call must never trap someone in the app — the local
    // session is cleared either way.
  }
  clearSession({ silent: true });
}
