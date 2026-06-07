/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SECURE_VAULT: Advanced hashing and credential management service.
 * Implements PBKDF2 with SHA-256 for browser-compatible "pseudo-hardware" tokenization.
 */
import { safeStorage } from '../lib/safeStorage';

const SALT_PREFIX = "ST_SALT_";
const HASH_VERSION = "v2";
const HASH_ITERATIONS = 100000;

/**
 * Hashes a passcode using PBKDF2 with user-specific salt.
 */
export async function hashPasscode(passcode: string, userId: string): Promise<string> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passcode),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const salt = encoder.encode(SALT_PREFIX + userId);
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: HASH_ITERATIONS,
      hash: "SHA-256",
    },
    passwordKey,
    256
  );

  return bufferToHex(derivedBits);
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Validates the passcode complexity based on user requirements:
 * - Exactly 12 characters (minimum 12)
 * - At least 5 digits
 * - At least 1 uppercase
 * - At least 5 lowercase
 * - At least 1 symbol (@#$%^&+=)
 */
export function validatePasscodeComplexity(passcode: string) {
  const requirements = {
    length: passcode.length >= 12,
    digits: (passcode.match(/\d/g) || []).length >= 5,
    uppercase: (passcode.match(/[A-Z]/g) || []).length >= 1,
    lowercase: (passcode.match(/[a-z]/g) || []).length >= 5,
    symbol: (passcode.match(/[@#$%^&+=]/g) || []).length >= 1,
  };

  const allPassed = Object.values(requirements).every(Boolean);
  return { requirements, allPassed };
}

/**
 * Session Management
 */
const SESSION_UNLOCK_KEY = "stego_session_unlocked";

export function isSessionUnlocked(): boolean {
  return sessionStorage.getItem(SESSION_UNLOCK_KEY) === "true";
}

export function lockSession() {
  sessionStorage.removeItem(SESSION_UNLOCK_KEY);
}

export function unlockSession() {
  sessionStorage.setItem(SESSION_UNLOCK_KEY, "true");
}

/**
 * Storage Helpers
 */
export function getSavedHash(userId: string): string | null {
  const stored = safeStorage.getItem(`hash_${userId}`);
  if (!stored) return null;
  
  // Versions check
  if (stored.startsWith(`${HASH_VERSION}:`)) {
    return stored.substring(HASH_VERSION.length + 1);
  }
  
  // Backward compatibility check for v1 (no prefix)
  // If we detect an old hash, we return null to force re-onboarding for safety
  return null;
}

/**
 * Resets the stored passcode for the given user, requiring a new setup.
 */
export function resetPasscode(userId: string) {
  safeStorage.removeItem(`hash_${userId}`);
  lockSession();
}

export function savePasscodeHash(userId: string, hash: string) {
  safeStorage.setItem(`hash_${userId}`, `${HASH_VERSION}:${hash}`);
}
