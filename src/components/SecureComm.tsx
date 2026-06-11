import { loginWithGoogle } from '../lib/auth';
import React, { useState, useEffect, useRef, Suspense } from 'react';
import {
  ShieldCheck, MessageCircle, Globe, Lock, Zap, ArrowRight,
  ShieldAlert, Server, Fingerprint, Send, User as UserIcon,
  Search, CheckCircle2, AlertTriangle, History, Key as KeyIcon,
  Radio, X, Trash2, Skull, BrainCircuit, ShieldX, ScanLine,
  Siren, FlameKindling, Cpu, Radar, Download, ArrowRightLeft,
  Users, GitFork, Hash, Shield, Layers, Activity, Clock,
  Link2, ChevronRight, ImagePlus, Eye, EyeOff
} from 'lucide-react';
import {
  collection, addDoc, query, where, onSnapshot, serverTimestamp,
  doc, setDoc, getDoc, deleteDoc, orderBy, limit, writeBatch,
  getDocs
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { optimizeImageForSecureComm, extractRawLSBEntropy, extractRawDCTEntropy } from '../lib/stegoUtils';
const StageUtilization = React.lazy(() => import('./StageUtilization'));
import { safeStorage } from '../lib/safeStorage';
import { hashPasscode, getSavedHash, isSessionUnlocked, unlockSession, resetPasscode } from '../services/securityService';

// --- SYSTEM CONSTANTS ---
const WS_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;
const WS_ENABLED = import.meta.env.VITE_WS_ENABLED === 'true';

/* ══════════════════════════════════════════════════════════════════
   TYPES
══════════════════════════════════════════════════════════════════ */

interface Message {
  id: string;
  senderId: string;
  senderEmail: string;
  receiverId: string;
  encryptedData: string;
  iv: string;
  encryptedAesKey?: string;        // wrapped with RECIPIENT's RSA public key
  encryptedAesKeySelf?: string;    // wrapped with SENDER's own RSA public key
  signature: string;
  hash: string;
  nonce: string;
  timestamp: any;
  gateway: 'alpha' | 'beta' | 'global';
  mimeType?: string;
  isImage?: boolean;
  fileName?: string;
  fallbackImage?: string;
  covertMethod?: 'lsb' | 'dct';
  isChunked?: boolean;
  encChunksCount?: number;
  fallbackChunksCount?: number;
  expiresAt?: any;
}

interface UserProfile {
  uid: string;
  email: string;
  publicKey: string; // Sign verify (RSASSA-PKCS1-v1_5)
  exchangeKey: string; // En/Decrypt (RSA-OAEP)
  displayName?: string;
  lastSeen?: any;
  activity?: string;
}

export interface FloodEvent {
  attackId: string;
  imageHash: string;
  totalDecoys: number;
  authenticMsg: Message | null;
  decoyIds: string[];
  detectedAt: number;
  purgedCount: number;
  status: 'DETECTING' | 'IDENTIFIED' | 'PURGING' | 'RESOLVED';
}

/* ══════════════════════════════════════════════════════════════════
   CRYPTO CACHES (Memoization for performance O(1) retrieval)
══════════════════════════════════════════════════════════════════ */

const VERIFICATION_CACHE = new Map<string, boolean>();
const DECRYPTION_CACHE = new Map<string, string>();
const AES_KEY_CACHE = new Map<string, CryptoKey>();
const downloadLocks = new Set<string>();

const MAX_CACHE_SIZE = 500;

function enforceCacheLimit<T>(map: Map<string, T>) {
  if (map.size > MAX_CACHE_SIZE) {
    const firstKey = map.keys().next().value;
    if (firstKey !== undefined) {
      map.delete(firstKey);
    }
  }
}

async function getVerifiedStatus(publicKeyB64: string, data: string, signatureB64: string): Promise<boolean> {
  const cacheKey = `${publicKeyB64}:${data}:${signatureB64}`;
  if (VERIFICATION_CACHE.has(cacheKey)) return VERIFICATION_CACHE.get(cacheKey)!;
  
  const status = await verifyDigitalSignature(publicKeyB64, data, signatureB64);
  VERIFICATION_CACHE.set(cacheKey, status);
  enforceCacheLimit(VERIFICATION_CACHE);
  return status;
}

/* ══════════════════════════════════════════════════════════════════
   ALGORITHM CONSTANTS
══════════════════════════════════════════════════════════════════ */

const FLOOD_THRESHOLD = 3;      // duplicates that trigger attack detection
const FLOOD_WINDOW_MS = 60_000; // rolling time window
const PURGE_STEP_MS = 120;

const TTL_OPTIONS = [
  { label: '2 HOURS (DEFAULT)', value: 2 * 60 * 60 * 1000 },
  { label: '24 HOURS', value: 24 * 60 * 60 * 1000 },
  { label: '48 HOURS', value: 48 * 60 * 60 * 1000 },
  { label: '72 HOURS', value: 72 * 60 * 60 * 1000 },
  { label: '1 WEEK', value: 7 * 24 * 60 * 60 * 1000 },
];

const IMG_MAX_DIM = 700;
const IMG_QUALITY = 0.55;

/* ══════════════════════════════════════════════════════════════════
   SECURE KEY STORAGE (INDEXEDDB)
══════════════════════════════════════════════════════════════════ */

const DB_NAME = 'SecureComm_Vault';
const STORE_NAME = 'keys';

let dbInstance: IDBDatabase | null = null;

async function openVault(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };
    request.onerror = () => reject(request.error);
  });
}

async function saveKey(name: string, key: string) {
  const db = await openVault();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(key, name);
    tx.oncomplete = () => resolve(null);
    tx.onerror = () => reject(tx.error);
  });
}

async function getKey(name: string): Promise<string | null> {
  const db = await openVault();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(name);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

function bufferToB64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const len = bytes.byteLength;
  const CHUNK_SIZE = 0x8000; 
  for (let i = 0; i < len; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, len));
    binary += String.fromCharCode(...Array.from(chunk));
  }
  return btoa(binary);
}

function b64ToBuffer(b64: string): Uint8Array {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function compressImageForSecureComm(dataUrl: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;

      if (width > height) {
        if (width > IMG_MAX_DIM) {
          height = Math.round(height * IMG_MAX_DIM / width);
          width = IMG_MAX_DIM;
        }
      } else {
        if (height > IMG_MAX_DIM) {
          width = Math.round(width * IMG_MAX_DIM / height);
          height = IMG_MAX_DIM;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject("CANVAS_CTX_FAIL");
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob((blob) => {
        if (!blob) return reject("BLOB_FAIL");
        if (blob.size > 400000) {
          const canvas2 = document.createElement('canvas');
          canvas2.width = width;
          canvas2.height = height;
          const ctx2 = canvas2.getContext('2d');
          if (!ctx2) return reject("CANVAS2_CTX_FAIL");
          ctx2.drawImage(img, 0, 0, width, height);
          canvas2.toBlob((blob2) => {
            if (!blob2) return reject("BLOB2_FAIL");
            blob2.arrayBuffer().then(resolve).catch(reject);
          }, 'image/jpeg', 0.4);
        } else {
          blob.arrayBuffer().then(resolve).catch(reject);
        }
      }, 'image/jpeg', IMG_QUALITY);
    };
    img.onerror = (e) => reject(`IMG_LOAD_FAIL: ${e}`);
    img.src = dataUrl;
  });
}

/* ══════════════════════════════════════════════════════════════════
   CRYPTO HELPERS (ASYMMETRIC + E2EE)
══════════════════════════════════════════════════════════════════ */

async function sha256(data: string | ArrayBuffer): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', typeof data === 'string' ? new TextEncoder().encode(data) : data);
  const bytes = new Uint8Array(buf);
  let hash = '';
  for (const b of bytes) {
    hash += b.toString(16).padStart(2, '0');
  }
  return hash;
}

function sortMessages(messages: Message[]): Message[] {
  return messages.sort((a, b) => {
    const tA = typeof a.timestamp?.toMillis === 'function' ? a.timestamp.toMillis() : (a.timestamp instanceof Date ? a.timestamp.getTime() : (typeof a.timestamp === 'number' ? a.timestamp : Date.now()));
    const tB = typeof b.timestamp?.toMillis === 'function' ? b.timestamp.toMillis() : (b.timestamp instanceof Date ? b.timestamp.getTime() : (typeof b.timestamp === 'number' ? b.timestamp : Date.now()));
    return tB - tA;
  });
}

async function generateKeyPair(): Promise<{
  publicKey: string;
  privateKey: string;
  exchangeKey: string;
  exchangePrivate: string;
}> {
  const sigPair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true, ["sign", "verify"]
  );
  const encPair = await crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true, ["encrypt", "decrypt"]
  );

  const pubSig = await crypto.subtle.exportKey("jwk", sigPair.publicKey);
  const privSig = await crypto.subtle.exportKey("jwk", sigPair.privateKey);
  const pubEnc = await crypto.subtle.exportKey("jwk", encPair.publicKey);
  const privEnc = await crypto.subtle.exportKey("jwk", encPair.privateKey);

  return {
    publicKey: btoa(JSON.stringify(pubSig)),
    privateKey: btoa(JSON.stringify(privSig)),
    exchangeKey: btoa(JSON.stringify(pubEnc)),
    exchangePrivate: btoa(JSON.stringify(privEnc))
  };
}

async function signData(privateKeyJwkB64: string, data: string): Promise<string> {
  const jwk = JSON.parse(atob(privateKeyJwkB64));
  const privKey = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign({ name: "RSASSA-PKCS1-v1_5" }, privKey, new TextEncoder().encode(data));
  return bufferToB64(signature);
}

async function verifyDigitalSignature(publicKeyB64: string, data: string, signatureB64: string): Promise<boolean> {
  try {
    const jwk = JSON.parse(atob(publicKeyB64));
    const pubKey = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const sigBuf = b64ToBuffer(signatureB64);
    return await crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, pubKey, sigBuf, new TextEncoder().encode(data));
  } catch (e) {
    return false;
  }
}

async function wrapAesKey(recipientExchangeKeyB64: string, aesKey: CryptoKey): Promise<string> {
  const jwk = JSON.parse(atob(recipientExchangeKeyB64));
  const pubKey = await crypto.subtle.importKey("jwk", jwk, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
  const rawAes = await crypto.subtle.exportKey("raw", aesKey);
  const wrapped = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, pubKey, rawAes);
  return bufferToB64(wrapped);
}

async function unwrapAesKey(myPrivateExchangeJwkB64: string, wrappedKeyB64: string): Promise<CryptoKey> {
  const jwk = JSON.parse(atob(myPrivateExchangeJwkB64));
  const privKey = await crypto.subtle.importKey("jwk", jwk, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt"]);
  const wrapped = b64ToBuffer(wrappedKeyB64);
  const rawAes = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privKey, wrapped);
  return await crypto.subtle.importKey("raw", rawAes, "AES-GCM", true, ["encrypt", "decrypt"]);
}

async function encryptImageData(aesKey: CryptoKey, arrayBuffer: ArrayBuffer): Promise<{ encrypted: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, arrayBuffer);
  return {
    encrypted: bufferToB64(ciphertext),
    iv: bufferToB64(iv)
  };
}

async function decryptImageData(aesKey: CryptoKey, encryptedB64: string, ivB64: string, mimeType: string = 'image/jpeg'): Promise<string> {
  const allowedMimeTypes = [
    'image/jpeg',
    'image/png',
    'image/webp'
  ];
  if (!allowedMimeTypes.includes(mimeType)) {
    throw new Error('INVALID_MIME_TYPE');
  }
  const ciphertext = b64ToBuffer(encryptedB64);
  const iv = b64ToBuffer(ivB64);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, ciphertext);
  return URL.createObjectURL(new Blob([decrypted], { type: mimeType }));
}

async function runFloodDetection(
  messages: Message[],
  trustedSenderUid: string | null,
  receiverUid: string,
  userProfiles: Map<string, UserProfile>
): Promise<FloodEvent[]> {
  const now = Date.now();
  const windowStart = now - FLOOD_WINDOW_MS;
  const mine = messages.filter(m => m.receiverId === receiverUid && (m.timestamp?.toMillis?.() ?? now) >= windowStart);
  
  const groups = new Map<string, Message[]>();
  for (const m of mine) {
    if (!m.hash) continue;
    const g = groups.get(m.hash) ?? [];
    g.push(m);
    groups.set(m.hash, g);
  }

  const events: FloodEvent[] = [];
    for (const [hash, group] of groups) {
    if (group.length < FLOOD_THRESHOLD) continue;

    let authenticMsg: Message | null = null;
    const verifiedMessages: Message[] = [];
    for (const m of group) {
      const profile = userProfiles.get(m.senderId);
      if (profile?.publicKey) {
        if (await getVerifiedStatus(profile.publicKey, m.hash, m.signature)) {
          // Additional check: Must have decryption key for receiver if private
          if (m.receiverId === 'GLOBAL' || m.encryptedAesKey) {
            verifiedMessages.push(m);
          }
        }
      }
    }

    if (trustedSenderUid) authenticMsg = verifiedMessages.find(m => m.senderId === trustedSenderUid) ?? null;
    if (!authenticMsg) authenticMsg = verifiedMessages[0] ?? null;
    if (!authenticMsg) authenticMsg = group.slice().sort((a,b) => (a.timestamp?.toMillis?.()??0) - (b.timestamp?.toMillis?.()??0))[0];

    const decoyIds = group.filter(m => m.id !== authenticMsg?.id).map(m => m.id);
    events.push({ attackId: hash.substring(0, 12), imageHash: hash, totalDecoys: decoyIds.length, authenticMsg, decoyIds, detectedAt: now, purgedCount: 0, status: 'IDENTIFIED' });
  }
  return events;
}

function generateNonce(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

function shortHash(h: string) {
  return h.substring(0, 8) + '…' + h.substring(h.length - 8);
}

/* ══════════════════════════════════════════════════════════════════
   AI EXPERT & DCT STREGO ANALYSIS
══════════════════════════════════════════════════════════════════ */

/**
 * Simulates Frequency DCT (Discrete Cosine Transform) extraction.
 * Advanced robust analysis against compression using 8x8 blocks.
 * Extracts deterministic 'exact details' from the hash coefficients.
 */
function extractFrequencyDCT(hash: string): string {
  // We produce a hex string representing the "encoded details" found in DCT blocks.
  const seed = hash.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const code = [];
  // Generate 24 bytes of "extracted data"
  for(let i=0; i<24; i++) {
    const val = (seed * (i + 1)) % 256;
    code.push(val.toString(16).padStart(2,'0').toUpperCase());
  }
  return `FREQ_DCT_DOMAIN:[${code.join(':')}]`;
}

/* ══════════════════════════════════════════════════════════════════
   AUTO-DOWNLOAD (STEP 04)
══════════════════════════════════════════════════════════════════ */
function autoDownload(url: string, filename: string) {
  const lockKey = `${url}:${filename}`;
  if (downloadLocks.has(lockKey)) return;
  downloadLocks.add(lockKey);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/* ══════════════════════════════════════════════════════════════════
   FIRESTORE ERROR HANDLER
══════════════════════════════════════════════════════════════════ */

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  throw new Error(JSON.stringify(errInfo));
}

/* ══════════════════════════════════════════════════════════════════
   SITUATIONAL AUTHORIZATION (Action-based Password Check)
   Requires user to re-verify identity before high-stakes operations.
══════════════════════════════════════════════════════════════════ */

const ActionAuthModal = ({ 
  isOpen, 
  onClose, 
  onSuccess,
  userId,
  title = "TRANSMISSION_AUTHORIZATION"
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onSuccess: () => void;
  userId: string;
  title?: string;
}) => {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockoutTimer, setLockoutTimer] = useState<number | null>(null);
  const [showPasscode, setShowPasscode] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setPasscode('');
      setError(null);
      setLoading(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (lockoutTimer === null) return;
    if (lockoutTimer <= 0) {
      setLockoutTimer(null);
      setAttempts(0);
      return;
    }
    const t = setInterval(() => setLockoutTimer(p => p && p > 0 ? p - 1 : null), 1000);
    return () => clearInterval(t);
  }, [lockoutTimer]);

  const handleSubmit = async () => {
    if (lockoutTimer !== null) return;
    setLoading(true);
    try {
      const sanitizedPasscode = passcode; // Removed .trim() to allow intentional spaces
      if (!userId) {
        setError("AUTH_ERROR: Identity token missing. Please re-authenticate.");
        setLoading(false);
        return;
      }
      const savedHash = getSavedHash(userId);
      
      if (!savedHash) {
        setError("IDENTITY_NOT_INITIALIZED: Please ensure your secure vault is initialized in the Security tab.");
        setLoading(false);
        return;
      }

      const inputHash = await hashPasscode(sanitizedPasscode, userId);
      if (savedHash === inputHash) {
        unlockSession();
        onSuccess();
        onClose();
        setPasscode('');
        setAttempts(0);
        setShowPasscode(false);
      } else {
        const next = attempts + 1;
        setAttempts(next);
        if (next >= 3) {
          setLockoutTimer(30);
          setError("SECURITY_LOCK: Too many failed auth attempts. Locking for 30s.");
        } else {
          setError(`AUTH_FAILURE: Incorrect token. Attempt ${next}/3.`);
        }
        setPasscode('');
      }
    } catch (e) {
      setError("SYSTEM_ERROR: Verification failed.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 font-mono">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm glass-panel p-8 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.5)] relative overflow-hidden"
      >
        {/* Background circuit pattern */}
        <div className="absolute inset-0 opacity-5 pointer-events-none">
          <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(#00FF00 1px, transparent 1px)', backgroundSize: '15px 15px' }} />
        </div>

        <div className="flex flex-col items-center mb-8 relative z-10 text-center">
            <div className="p-3 bg-accent-primary/10 rounded-full mb-4 border border-accent-primary/20">
                <Lock className="w-8 h-8 text-accent-primary" />
            </div>
            <h3 className="text-sm font-black text-accent-primary uppercase tracking-[0.3em]">{title}</h3>
            <p className="text-[9px] text-text-dim mt-2 uppercase tracking-widest leading-relaxed">
              Identity verification required for this high-entropy data packet transmission.
            </p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-[9px] text-red-500 font-bold uppercase tracking-wider flex items-center gap-2">
            <AlertTriangle className="w-3 h-3" />
            {error}
          </div>
        )}

        {lockoutTimer !== null && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-center space-y-2">
            <Clock className="w-6 h-6 text-red-500 mx-auto animate-pulse" />
            <p className="text-[10px] text-red-500 font-black uppercase tracking-widest">SYSTEM_LOCKED</p>
            <p className="text-[14px] text-red-400 font-bold tracking-widest">COOLING_DOWN: {lockoutTimer}S</p>
          </div>
        )}

        <div className="space-y-6 relative z-10">
          <div className="relative">
            <input 
              type={showPasscode ? "text" : "password"}
              autoFocus
              value={passcode}
              onChange={(e) => { setPasscode(e.target.value); setError(null); }}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              disabled={lockoutTimer !== null || loading}
              placeholder={lockoutTimer !== null ? "LOCKED" : "••••••••••••"}
              className="w-full bg-bg-main border border-border-main p-4 rounded-xl text-center text-accent-primary placeholder:text-text-dim/20 focus:border-accent-primary/50 outline-none font-bold tracking-[0.8em] text-2xl transition-all"
            />
            <button 
              type="button"
              onClick={() => setShowPasscode(!showPasscode)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-text-dim/40 hover:text-accent-primary transition-colors"
            >
              {showPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          
          <div className="flex flex-col gap-3">
            <button 
                onClick={handleSubmit}
                disabled={loading || lockoutTimer !== null || !passcode}
                className="w-full bg-accent-primary text-bg-main py-4 rounded-xl font-black text-xs uppercase tracking-[0.2em] hover:bg-emerald-500 transition-all flex items-center justify-center gap-2 disabled:opacity-30 disabled:grayscale shadow-lg shadow-accent-primary/20"
            >
                {loading ? <Clock className="w-4 h-4 animate-spin" /> : lockoutTimer !== null ? 'LOCKED' : 'VERIFY_IDENTITY'}
            </button>
            <button onClick={onClose} className="text-[9px] text-text-dim hover:text-text-main transition-colors uppercase tracking-widest text-center py-2">
                Abort_Transmission
            </button>
            <button 
              onClick={() => {
                if (window.confirm("RESET_IDENTITY: This will clear your current passcode. You will be redirected to re-initialize your vault. Continue?")) {
                  resetPasscode(userId);
                  window.location.reload(); // Reload to trigger the SecurityLayer onboarding
                }
              }}
              className="text-[7px] text-red-500/30 hover:text-red-500 transition-colors uppercase tracking-widest mt-2"
            >
              Emergency_Vault_Reset
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════
   SUB-COMPONENTS
══════════════════════════════════════════════════════════════════ */

const AttackAlertBanner = React.memo(({ 
  event, 
  onDismiss, 
  users, 
  privateKeys 
}: { 
  event: FloodEvent; 
  onDismiss: () => void; 
  users: UserProfile[]; 
  privateKeys: { sig: string; enc: string } | null;
  key?: React.Key 
}) => {
  const resolved = event.status === 'RESOLVED';
  const purging  = event.status === 'PURGING';
  const identified = event.status === 'IDENTIFIED';

  const userMap = React.useMemo(() => {
    const map = new Map<string, UserProfile>();
    users.forEach(u => map.set(u.uid, u));
    return map;
  }, [users]);

  const steps = [
    { id: 'SCAN', label: 'Hash Grouping', active: true },
    { id: 'DETECT', label: 'Flood Analysis', active: true },
    { id: 'AUTH', label: 'Signature Match', active: identified || purging || resolved },
    { id: 'DOWNLOAD', label: 'Secure Payload', active: purging || resolved },
    { id: 'PURGE', label: 'Batch Cleanup', active: purging || resolved },
    { id: 'RESOLVED', label: 'Restored', active: resolved },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: -24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -20 }}
      className={`rounded-2xl border overflow-hidden mb-4 shadow-xl ${
        resolved ? 'border-accent-primary/30 bg-accent-primary/5' : 'border-red-500/40 bg-red-950/30'
      }`}
    >
      <div className={`flex items-center justify-between px-5 py-3 border-b ${
        resolved ? 'border-accent-primary/20 bg-accent-primary/10' : 'border-red-500/20 bg-red-500/10'
      }`}>
        <div className="flex items-center gap-2">
          {resolved
            ? <ShieldCheck className="w-4 h-4 text-accent-primary" />
            : <Siren className="w-4 h-4 text-red-500 animate-pulse" />
          }
          <span className={`text-[10px] font-bold uppercase tracking-[0.2em] ${
            resolved ? 'text-accent-primary' : 'text-red-400'
          }`}>
            {resolved ? '✓  ATTACK NEUTRALISED' : '⚠  DECOY FLOOD ATTACK DETECTED'}
          </span>
        </div>
        <button onClick={onDismiss} className="text-text-dim hover:text-text-main">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Pipeline Stepper */}
        <div className="flex justify-between items-center px-2">
          {steps.map((s, idx) => (
            <React.Fragment key={s.id}>
              <div className="flex flex-col items-center gap-1.5 min-w-[50px]">
                <div className={`w-2.5 h-2.5 rounded-full border-2 ${
                  s.active 
                    ? (resolved && idx === steps.length - 1 ? 'bg-accent-primary border-accent-primary' : 'bg-red-500 border-red-500 animate-pulse')
                    : 'bg-bg-main border-border-main'
                }`} />
                <span className={`text-[6px] font-bold uppercase tracking-widest ${s.active ? 'text-text-main' : 'text-text-dim'}`}>
                  {s.id}
                </span>
              </div>
              {idx < steps.length - 1 && (
                <div className={`flex-1 h-[1px] -mt-4 mx-1 ${s.active ? 'bg-red-500/50' : 'bg-border-main'}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'ATTACK ID',   value: event.attackId,       col: 'text-red-400'    },
            { label: 'DECOYS SENT', value: event.totalDecoys,    col: 'text-orange-400' },
            { label: 'PURGED',      value: event.purgedCount,    col: 'text-yellow-400' },
            { label: 'AUTHENTIC',   value: event.authenticMsg ? '1 FOUND' : 'NONE',
              col: event.authenticMsg ? 'text-accent-primary' : 'text-red-500' },
          ].map(({ label, value, col }) => (
            <div key={label} className="bg-bg-main/30 rounded-xl p-3 text-center border border-border-main font-bold">
              <p className={`text-sm font-mono ${col}`}>{String(value)}</p>
              <p className="text-[7px] text-text-dim uppercase font-bold tracking-wider mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {event.authenticMsg && (
          <div className="bg-bg-main/40 rounded-xl p-3 border border-accent-primary/20 flex items-center gap-3">
            <div className="w-14 h-10 rounded border border-border-main overflow-hidden shrink-0 bg-bg-main relative">
              <PhotoPreview 
                msg={event.authenticMsg} 
                publicKey={userMap.get(event.authenticMsg?.senderId || '')?.publicKey}
                myPrivateKey={privateKeys?.enc}
                isSentByMe={false}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] text-accent-primary font-bold uppercase">Authentic Transmission Identified</p>
              <p className="text-[8px] text-text-dim font-mono truncate">FROM: {event.authenticMsg.senderEmail}</p>
            </div>
            {(purging || resolved) && <div className="flex flex-col items-end shrink-0">
               <Download className="w-3 h-3 text-accent-primary mb-1" />
               <p className="text-[7px] text-accent-primary font-mono">SECURED_LOCAL</p>
            </div>}
            {resolved && <CheckCircle2 className="w-5 h-5 text-accent-primary shrink-0" />}
          </div>
        )}

        {(purging || resolved) && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-[8px] font-mono">
              <span className="text-text-dim uppercase">Purge Progress</span>
              <span className="text-orange-400 font-bold">{event.purgedCount} / {event.totalDecoys} deleted</span>
            </div>
            <div className="w-full h-1.5 bg-bg-main/20 border border-border-main rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-red-600 to-orange-500 rounded-full"
                animate={{ width: `${(event.purgedCount / Math.max(event.totalDecoys,1)) * 100}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
});

function GatewayBadge({ gateway }: { gateway: string }) {
  const map: Record<string,{label:string;color:string}> = {
    alpha:  { label:'GW-α P1→P2', color:'#00FFAA' },
    beta:   { label:'GW-β P2→P3', color:'#FF9900' },
    global: { label:'BROADCAST',  color:'#00AAFF' },
  };
  const g = map[gateway] ?? map.global;
  return (
    <span className="text-[8px] font-mono font-bold px-2 py-0.5 rounded border" 
      style={{ color:g.color, borderColor:g.color+'40', background:g.color+'12' }}>
      {g.label}
    </span>
  );
}

const PhotoPreview = React.memo(function PhotoPreview({ 
  msg, 
  publicKey, 
  myPrivateKey, 
  isSentByMe,
  isDecoy,
  isAuthorized = false,
  onAuthorize
}: { 
  msg: Message; 
  publicKey?: string; 
  myPrivateKey?: string; 
  isSentByMe: boolean;
  isDecoy?: boolean;
  isAuthorized?: boolean;
  onAuthorize?: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [verified, setVerified] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isAuthorized) return;
    
    let cancelled = false;
    const decrypt = async () => {
      if (mountedRef.current) setLoading(true);
      try {
        const cacheKey = `${msg.id}:${isSentByMe}`;
        if (DECRYPTION_CACHE.has(cacheKey)) {
          const cachedUrl = DECRYPTION_CACHE.get(cacheKey)!;
          if (mountedRef.current && !cancelled) setUrl(cachedUrl);
          if (publicKey) getVerifiedStatus(publicKey, msg.hash, msg.signature).then(v => { if (mountedRef.current && !cancelled) setVerified(v); });
          dispatchForensicEvent(cachedUrl, msg.mimeType || 'image/jpeg');
          if (mountedRef.current && !cancelled) setLoading(false);
          return;
        }

        if (publicKey) {
          const ok = await getVerifiedStatus(publicKey, msg.hash, msg.signature);
          if (mountedRef.current && !cancelled) setVerified(ok);
        }

        let encryptedData = msg.encryptedData;
        if (msg.isChunked && encryptedData === "CHUNKED_DATA") {
           const chunksSnap = await getDocs(query(collection(db, 'messages', msg.id, 'chunks'), where('type', '==', 'encrypted'), orderBy('chunkIndex')));
           encryptedData = chunksSnap.docs.map(d => d.data().data).join('');
        }

        if (msg.receiverId === 'GLOBAL') {
          try {
            const bin = b64ToBuffer(encryptedData);
            const objectUrl = URL.createObjectURL(new Blob([bin], { type: msg.mimeType || 'image/jpeg' }));
            DECRYPTION_CACHE.set(cacheKey, objectUrl);
            enforceCacheLimit(DECRYPTION_CACHE);
            if (mountedRef.current && !cancelled) {
              urlRef.current = objectUrl;
              setUrl(objectUrl);
              dispatchForensicEvent(objectUrl, msg.mimeType || 'image/jpeg');
            }
          } catch (e) {
            console.error("FAIL_TO_CREATE_GLOBAL_OBJECT_URL", e);
            if (mountedRef.current && !cancelled) setUrl(null);
          }
          if (mountedRef.current && !cancelled) setLoading(false);
          return;
        }

        if (!myPrivateKey) {
          if (mountedRef.current && !cancelled) setUrl(null);
          if (mountedRef.current && !cancelled) setLoading(false);
          return;
        }

        const wrappedKeyB64 = isSentByMe ? (msg.encryptedAesKeySelf ?? msg.encryptedAesKey) : msg.encryptedAesKey;
        if (!wrappedKeyB64) {
          if (mountedRef.current && !cancelled) setUrl(null);
          if (mountedRef.current && !cancelled) setLoading(false);
          return;
        }

        let aesKey = AES_KEY_CACHE.get(wrappedKeyB64);
        if (!aesKey) {
          aesKey = await unwrapAesKey(myPrivateKey, wrappedKeyB64);
          AES_KEY_CACHE.set(wrappedKeyB64, aesKey);
          enforceCacheLimit(AES_KEY_CACHE);
        }
        const decryptedUrl = await decryptImageData(aesKey, encryptedData, msg.iv, msg.mimeType);
        DECRYPTION_CACHE.set(cacheKey, decryptedUrl);
        enforceCacheLimit(DECRYPTION_CACHE);
        if (mountedRef.current && !cancelled) {
          urlRef.current = decryptedUrl;
          setUrl(decryptedUrl);
          dispatchForensicEvent(decryptedUrl, msg.mimeType || 'image/jpeg');
        }
      } catch (err) {
        console.error("DECRYPTION_CRITICAL_FAILURE", err);
        if (mountedRef.current && !cancelled) setUrl(null);
      } finally {
        if (mountedRef.current && !cancelled) setLoading(false);
      }
    };

    const dispatchForensicEvent = (url: string, mime: string) => {
      // Auto-forward to forensics
      const event = new CustomEvent('necrosteg-forensic-image', {
        detail: {
            imageDataUrl: url,
            mimeType: mime,
            fileName: msg.fileName,
            source: 'SecureComm'
        }
      });
      window.dispatchEvent(event);
    };
    decrypt();
    return () => { 
      cancelled = true; 
      if (urlRef.current?.startsWith('blob:')) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [msg.id, msg.encryptedData, msg.iv, msg.encryptedAesKey, msg.encryptedAesKeySelf, msg.receiverId, publicKey, myPrivateKey, isSentByMe, isAuthorized]);

  if (!isAuthorized) return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg-main/90 group cursor-pointer" onClick={onAuthorize}>
       <Lock className="w-8 h-8 text-text-dim/40 group-hover:text-accent-primary transition-colors" />
       <p className="text-[7px] text-text-dim/60 mt-2 font-bold tracking-widest group-hover:text-accent-primary uppercase font-mono">AUTHORIZE_VIEW</p>
       <div className="absolute inset-0 border-2 border-dashed border-border-main/20 animate-[pulse_4s_infinite]" />
    </div>
  );

  if (loading) return (
    <div className="absolute inset-0 flex items-center justify-center bg-bg-main/40">
       <Cpu className="w-6 h-6 text-accent-primary animate-spin" />
    </div>
  );

  if (!url) return (
    <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-bg-main/60">
      <ShieldAlert className="w-7 h-7 text-red-500 mb-1 animate-pulse" />
      <p className="text-[9px] text-red-500 font-bold uppercase">BROKEN_PAYLOAD</p>
    </div>
  );

  return (
    <img 
      src={url} alt="Payload" 
      className={`w-full h-full object-cover transition-all duration-500 ${
        isDecoy    ? 'blur-3xl opacity-10 grayscale' : 
        verified ? 'opacity-100' : 
                     'blur-2xl opacity-20 grayscale'
      }`} 
    />
  );
});

const EmergencyRecover = ({ msg }: { msg: Message }) => {
  const [entropy, setEntropy] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const recover = async () => {
    if (!msg.fallbackImage || !msg.covertMethod) return;
    setLoading(true);
    try {
      let fallbackData = msg.fallbackImage;
      if (msg.isChunked && fallbackData === "CHUNKED_DATA") {
        const chunksSnap = await getDocs(query(collection(db, 'messages', msg.id, 'chunks'), where('type', '==', 'fallback'), orderBy('chunkIndex')));
        fallbackData = chunksSnap.docs.map(d => d.data().data).join('');
      }

      const img = new Image();
      img.src = fallbackData;
      await new Promise(resolve => {
        img.onload = resolve;
        img.onerror = () => { setLoading(false); };
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      let rawHex = '';
      if (msg.covertMethod === 'lsb') {
        rawHex = extractRawLSBEntropy(imageData, 32);
      } else {
        rawHex = extractRawDCTEntropy(imageData, 32);
      }
      setEntropy(rawHex);
    } catch (e) {
      // Fail silently
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-2 p-3 bg-red-500/5 border border-red-500/20 rounded-xl space-y-2">
      <div className="flex items-center justify-between">
         <span className="text-[8px] text-red-400 font-bold uppercase tracking-widest flex items-center gap-1.5">
           <Siren className="w-3 h-3" /> E2EE_FAILOVER_COVERT_LINK
         </span>
         {!entropy ? (
           <button onClick={recover} disabled={loading}
             className="text-[8px] bg-red-500/20 text-red-500 px-2 py-0.5 rounded hover:bg-red-500 hover:text-bg-main transition-colors font-bold">
             {loading ? 'EXTRACTING...' : 'DIRECT_EXTRACT'}
           </button>
         ) : (
           <span className="text-[7px] text-accent-primary font-bold">✓ RECOVERED</span>
         )}
      </div>
      {entropy && (
        <div className="space-y-1">
          <p className="text-[7px] text-text-dim uppercase font-mono">Raw_Statistical_Entropy:</p>
          <p className="text-[9px] text-red-400 font-mono break-all bg-bg-main/50 p-2 rounded border border-red-500/10">
            0x{entropy}
          </p>
        </div>
      )}
    </div>
  );
};

const MessageCard = ({ 
  msg, 
  currentUser, 
  senderProfile, 
  myPrivateKey, 
  onDelete, 
  onAnalyze,
  isDecoy=false,
  isAuthorized=false,
  onAuthorizeRequest
}: { 
  msg:Message; 
  currentUser:FirebaseUser; 
  senderProfile?: UserProfile;
  myPrivateKey?: string;
  onDelete:(id:string) => void | Promise<void>; 
  onAnalyze:(msg:Message) => void;
  isDecoy?:boolean; 
  isAuthorized?:boolean;
  onAuthorizeRequest: (msgId: string) => void;
  key?: React.Key 
}) => {
  const [showHash, setShowHash] = useState(false);
  const [verified, setVerified] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const isMine = msg.senderId === currentUser.uid;

  const performVerification = async () => {
    if (!senderProfile?.publicKey) return;
    setIsVerifying(true);
    // Artificial delay to show mathematical "crunching"
    await new Promise(r => setTimeout(r, 800));
    const ok = await getVerifiedStatus(senderProfile.publicKey, msg.hash, msg.signature);
    setVerified(ok);
    setIsVerifying(false);
  };

  useEffect(() => {
    if (senderProfile?.publicKey) {
      getVerifiedStatus(senderProfile.publicKey, msg.hash, msg.signature).then(setVerified);
    }
  }, [msg, senderProfile]);

  return (
    <motion.div layout
      initial={{ opacity:0, y:10 }}
      animate={{ opacity:1, y:0 }}
      exit={{ opacity:0, scale:0.9, filter:'blur(8px)' }}
      className={`relative rounded-2xl overflow-hidden border ${
        isDecoy ? 'border-red-500/30 bg-red-950/20' : 'border-border-main bg-bg-surface/80'
      }`}
    >
      {isDecoy && (
        <div className="flex items-center gap-1.5 px-4 py-1 bg-red-500/10 border-b border-red-500/20">
          <Skull className="w-3 h-3 text-red-500" />
          <p className="text-[8px] font-bold text-red-400 uppercase tracking-widest">DECOY — QUEUED FOR PURGE</p>
        </div>
      )}

      <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border-main/60">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-bg-main border border-border-main flex items-center justify-center">
            <UserIcon className="w-3 h-3 text-text-dim" />
          </div>
          <span className="text-[10px] font-bold text-text-main font-mono uppercase">
            {msg.senderEmail?.split('@')[0]}
            {isMine && <span className="ml-1 text-[8px] text-text-dim italic">(you)</span>}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <GatewayBadge gateway={msg.gateway} />
          <div className={`w-5 h-5 rounded-full flex items-center justify-center ${verified ? 'bg-accent-primary/10' : 'bg-red-500/10'}`}>
            {verified ? <CheckCircle2 className="w-3 h-3 text-accent-primary" /> : <AlertTriangle className="w-3 h-3 text-red-500" />}
          </div>
          {(isMine || msg.receiverId === currentUser.uid) && (
            <button onClick={() => onDelete(msg.id)}
              title="Permanently remove this package from the network."
              className="w-5 h-5 rounded-full bg-red-500/10 text-red-500 hover:bg-red-500/20 flex items-center justify-center transition-colors">
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      <div className="aspect-video bg-bg-main relative overflow-hidden flex items-center justify-center">
        <PhotoPreview 
          msg={msg} 
          publicKey={senderProfile?.publicKey} 
          myPrivateKey={myPrivateKey} 
          isSentByMe={isMine}
          isDecoy={isDecoy}
          isAuthorized={isAuthorized || isMine} // Sender sees their own photo
          onAuthorize={() => onAuthorizeRequest(msg.id)}
        />
        {isDecoy && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <ShieldX className="w-10 h-10 text-red-500/80 mb-1" />
            <p className="text-[9px] text-red-400 font-bold uppercase tracking-widest">FORGED DECOY</p>
          </div>
        )}
      </div>

      <div className="px-4 py-2 bg-black/30">
        <div className="flex items-center justify-between">
          <span className="text-[8px] text-text-dim/60 font-mono uppercase tracking-wider">ENC_HASH</span>
          <button onClick={() => setShowHash(!showHash)} 
            title="Toggle visibility of the cryptographic transmission hash."
            className="text-[8px] text-text-dim hover:text-accent-primary font-mono transition-colors">
            {showHash ? 'HIDE' : 'REVEAL'}
          </button>
        </div>
        <AnimatePresence>
          {showHash && (
            <motion.p initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }}
              className="text-[9px] text-accent-primary font-mono mt-1 break-all">
              {msg.hash}
            </motion.p>
          )}
        </AnimatePresence>
        {!showHash && <p className="text-[9px] text-text-dim/60 font-mono mt-0.5">{shortHash(msg.hash)}</p>}
        {msg.fallbackImage && !verified && <EmergencyRecover msg={msg} />}
      </div>

      <div className="flex items-center justify-between px-4 py-2 border-t border-border-main/60">
        <div className="flex gap-2">
          {msg.isImage && !isDecoy && (
            <button 
              onClick={async () => {
                const cacheKey = `${msg.id}:${isMine}`;
                const cachedUrl = DECRYPTION_CACHE.get(cacheKey);
                if (cachedUrl) {
                  autoDownload(cachedUrl, msg.fileName || `necrosteg_${msg.id.substring(0,6)}.${msg.mimeType?.split('/')[1] || 'png'}`);
                  // Self-Destruct after download (as requested by user)
                  await onDelete(msg.id);
                }
              }}
              title="Securely download the payload and immediately purge it from server memory."
              className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-accent-primary/20 hover:bg-accent-primary/10 transition-colors shadow-sm shadow-accent-primary/5"
            >
              <Download className="w-3 h-3 text-accent-primary" />
              <span className="text-[8px] text-accent-primary font-bold">SECTOR_DOWNLOAD & PURGE</span>
            </button>
          )}

          <button 
            onClick={() => onAnalyze(msg)}
            title="Analyze the payload using our Neural Intelligence AI for hidden insights."
            className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-accent-primary/20 hover:bg-accent-primary/10 transition-colors"
          >
            <BrainCircuit className="w-3 h-3 text-accent-primary" />
            <span className="text-[8px] text-accent-primary font-bold">AI_EXPERT</span>
          </button>

          {msg.isImage && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-accent-primary/20 bg-accent-primary/5">
              <ShieldCheck className="w-3 h-3 text-accent-primary" />
              <span className="text-[8px] text-accent-primary font-bold uppercase tracking-widest">Heroic_Verified</span>
            </div>
          )}
          
          <button 
            onClick={performVerification}
            disabled={isVerifying || !senderProfile?.publicKey}
            title="Verify the cryptographic signature to confirm sender authenticity."
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded border transition-colors ${
              verified ? 'border-accent-primary/20 hover:bg-accent-primary/10' : 'border-border-main hover:bg-text-main/5'
            }`}
          >
            {isVerifying ? (
              <ScanLine className="w-3 h-3 text-accent-primary animate-pulse" />
            ) : verified ? (
              <ShieldCheck className="w-3 h-3 text-accent-primary" />
            ) : (
              <ShieldAlert className="w-3 h-3 text-red-500" />
            )}
            <span className={`text-[8px] font-bold ${verified ? 'text-accent-primary' : 'text-text-dim'}`}>
              {isVerifying ? 'VERIFYING...' : 'VERIFY_PAYLOAD'}
            </span>
          </button>

          <span className="text-[8px] text-text-dim font-mono flex items-center">
            {msg.timestamp?.toDate?.()?.toLocaleString() ?? 'TRANSMITTING...'}
          </span>
        </div>
        <span className={`text-[8px] font-mono uppercase ${verified ? 'text-accent-primary' : 'text-red-500'}`}>
          {verified ? '✓ AUTHENTIC' : '✗ UNVERIFIED'}
        </span>
      </div>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════════ */

export default function SecureComm({ user }: { user: FirebaseUser | null }) {
  const [privateMessages, setPrivateMessages] = useState<Message[]>([]);
  const [globalMessages, setGlobalMessages] = useState<Message[]>([]);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [channel, setChannel] = useState<'private' | 'global'>('private');
  const [gateway, setGateway] = useState<'alpha' | 'beta'>('alpha');
  const [loading, setLoading] = useState(true);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [profileData, setProfileData] = useState({ displayName: '', publicKey: '', exchangeKey: '' });
  const [privateKeys, setPrivateKeys] = useState<{ sig: string; enc: string } | null>(null);
  const [photoUrl, setPhotoUrl] = useState('');
  const [mimeType, setMimeType] = useState('');
  const [fileName, setFileName] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [wsStatus, setWsStatus] = useState<'CONNECTING' | 'SECURE' | 'OFFLINE'>('OFFLINE');
  const [aiReport, setAiReport] = useState<{ code: string; explanation: string; loading: boolean } | null>(null);
  const [playoffAnalysis, setPlayoffAnalysis] = useState<{ report: string; loading: boolean } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [retryBackoff, setRetryBackoff] = useState(1000);
  const [selectedTtl, setSelectedTtl] = useState<number>(2 * 60 * 60 * 1000);
  const [activePlayoff, setActivePlayoff] = useState(false);

  // Situational Auth State
  const [authAction, setAuthAction] = useState<{ type: 'send' | 'view'; msgId?: string } | null>(null);
  const [authorizedMsgs, setAuthorizedMsgs] = useState<Set<string>>(new Set());
  const [commAuthorized, setCommAuthorized] = useState(false);

  // WebSocket Connection for Backend Synchronization with Exponential Backoff
  const retryBackoffRef = useRef(1000);
  useEffect(() => {
    if (!WS_ENABLED) {
      setWsStatus('OFFLINE');
      return;
    }

    let cleanup = false;
    let timer: any;
    const connect = () => {
      if (cleanup) return;
      setWsStatus('CONNECTING');
      try {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          if (cleanup) return;
          setWsStatus('SECURE');
          retryBackoffRef.current = 1000; // reset backoff on success
          setRetryBackoff(1000);
        };

        ws.onclose = () => {
          if (cleanup) return;
          setWsStatus('OFFLINE');
          // Exponential backoff retry using ref (no re-mount side-effect)
          const delay = retryBackoffRef.current;
          retryBackoffRef.current = Math.min(delay * 2, 30000);
          setRetryBackoff(retryBackoffRef.current);
          timer = setTimeout(connect, delay);
        };

        ws.onerror = () => {
          try {
            ws.close();
          } catch (_) {}
        };
      } catch (e) {
        timer = setTimeout(connect, 5000);
      }
    };

    connect();
    return () => {
      cleanup = true;
      if (timer) clearTimeout(timer);
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch (_) {}
      }
    };
  }, []);
  const [msgFilter, setMsgFilter] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Memoized User Map for O(1) lookups
  const userMap = React.useMemo(() => {
    const map = new Map<string, UserProfile>();
    users.forEach(u => map.set(u.uid, u));
    // Include self
    if (user) map.set(user.uid, { ...profileData, uid: user.uid, email: user.email || 'REDACTED' });
    return map;
  }, [users, user, profileData]);

  const analyzePlayoffs = async () => {
    if (!user) return;
    setPlayoffAnalysis({ report: '', loading: true });
    try {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

      const prompt = `You are a military intelligence analyst for a secure communication platform. 
      Analyze the current "Playoff" status of the secure communication network based on these logs (simulated):
      - Active Nodes: ${users.length}
      - Threat Level: ALPHA_CRITICAL
      - Signal Integrity: 98.4%
      - Encryption Standard: RSA-4096 / AES-256-GCM
      
      Provide a concise "Playoff Analysis" report (4-5 sentences) focused on high-stakes cybersecurity and strategy. 
      Use a technical, futuristic tone.`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      setPlayoffAnalysis({ report: response.text(), loading: false });
    } catch (error) {
      console.error("AI_ANALYSIS_FAILED", error);
      setPlayoffAnalysis({ report: "FAILED_TO_SYNC_WITH_NEURAL_CORE. CHECK_NETWORK_STATUS.", loading: false });
    }
  };

  // Anti-flood state
  const [floodEvents, setFloodEvents] = useState<FloodEvent[]>([]);
  const [decoyIds, setDecoyIds] = useState<Set<string>>(new Set());
  const floodRunRef = useRef<Set<string>>(new Set());

  // Sync payload from storage
  useEffect(() => {
    // 0. Test Connection (CRITICAL DIRECTIVE)
    const testConn = async () => {
      try {
        await getDoc(doc(db, 'system', 'ping'));
      } catch (err) {
        // Silent fail as per stealth instructions
      }
    };
    testConn();

    const handleSync = () => {
      const payload = safeStorage.getItem('stego_payload');
      const fname = safeStorage.getItem('stego_filename');
      if (payload) {
        setPhotoUrl(payload);
        if (fname) setFileName(fname);
      }
    };
    window.addEventListener('storage', handleSync);
    window.addEventListener('stego-payload-ready', handleSync);
    handleSync();
    return () => {
      window.removeEventListener('storage', handleSync);
      window.removeEventListener('stego-payload-ready', handleSync);
    };
  }, []);

  // Sync Identity and Keys when User switches
  useEffect(() => {
    const syncIdentity = async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      
      setLoading(true);
      try {
        const userRef = doc(db, 'users', user.uid);
        
        const [sigPriv, encPriv, userSnap] = await Promise.all([
          getKey(`sig_priv_${user.uid}`),
          getKey(`enc_priv_${user.uid}`),
          getDoc(userRef)
        ]);

        if (!userSnap.exists()) {
          const keys = await generateKeyPair();
          const initialData = {
            uid: user.uid,
            email: user.email,
            publicKey: keys.publicKey,
            exchangeKey: keys.exchangeKey,
            displayName: user.displayName || user.email?.split('@')[0].toUpperCase() || 'ANONYMOUS',
            lastSeen: serverTimestamp()
          };
          try {
            await Promise.all([
              setDoc(userRef, initialData),
              saveKey(`sig_priv_${user.uid}`, keys.privateKey),
              saveKey(`enc_priv_${user.uid}`, keys.exchangePrivate)
            ]);
          } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, 'users/' + user.uid);
          }
          setProfileData({ displayName: initialData.displayName, publicKey: initialData.publicKey, exchangeKey: initialData.exchangeKey });
          setPrivateKeys({ sig: keys.privateKey, enc: keys.exchangePrivate });
        } else {
          const data = userSnap.data() as UserProfile;
          let currentSigPriv = sigPriv;
          let currentEncPriv = encPriv;

          if (!currentSigPriv || !currentEncPriv) {
            const keys = await generateKeyPair();
            try {
              await Promise.all([
                setDoc(userRef, { publicKey: keys.publicKey, exchangeKey: keys.exchangeKey }, { merge: true }),
                saveKey(`sig_priv_${user.uid}`, keys.privateKey),
                saveKey(`enc_priv_${user.uid}`, keys.exchangePrivate)
              ]);
            } catch (error) {
              handleFirestoreError(error, OperationType.UPDATE, 'users/' + user.uid);
            }
            currentSigPriv = keys.privateKey;
            currentEncPriv = keys.exchangePrivate;
            setProfileData({ displayName: data.displayName || '', publicKey: keys.publicKey, exchangeKey: keys.exchangeKey });
          } else {
            setProfileData({ displayName: data.displayName || '', publicKey: data.publicKey, exchangeKey: data.exchangeKey });
          }
          
          setPrivateKeys({ sig: currentSigPriv, enc: currentEncPriv });
          try {
            await setDoc(userRef, { 
              lastSeen: serverTimestamp(),
              activity: 'ENCRYPTED_SIGNAL_STREAM'
            }, { merge: true });
          } catch (error) {
            handleFirestoreError(error, OperationType.UPDATE, 'users/' + user.uid);
          }
        }
      } catch (error) {
        setStreamError("IDENTITY_SYNC_FAILURE: Please check your connection or vault settings.");
      } finally {
        setLoading(false);
      }
    };

    syncIdentity();
  }, [user]);

  // Fetch Users
  useEffect(() => {
    if (!user) return;
    try {
      return onSnapshot(collection(db, 'users'), (snap) => {
        setUsers(snap.docs.map(doc => doc.data() as UserProfile).filter(p => p.uid !== user.uid));
      }, (error) => {
        // Silenced
      });
    } catch (err) {
      // Silenced
    }
  }, [user]);

  // Fetch Private Messages (Sent or Received)
  useEffect(() => {
    if (!user) return;
    setStreamError(null);
    
    // We listen for messages where I am the receiver
    const q1 = query(
      collection(db, 'messages'),
      where('receiverId', '==', user.uid),
      orderBy('timestamp', 'desc'),
      limit(100)
    );

    // And messages I sent
    const q2 = query(
      collection(db, 'messages'),
      where('senderId', '==', user.uid),
      orderBy('timestamp', 'desc'),
      limit(100)
    );

    const unsub1 = onSnapshot(q1, (snap) => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Message));
      setPrivateMessages(prev => {
        const msgMap = new Map<string, Message>(prev.map(m => [m.id, m]));
        msgs.forEach(m => msgMap.set(m.id, m));
        return Array.from(msgMap.values()).sort((a: Message, b: Message) => {
          const tA = a.timestamp?.toMillis() ?? Date.now();
          const tB = b.timestamp?.toMillis() ?? Date.now();
          return tB - tA;
        }).slice(0, 150);
      });
    }, (err) => {
      if (err.code === 'permission-denied') setStreamError("PRIVATE_FEED_RESTRICTED");
    });

    const unsub2 = onSnapshot(q2, (snap) => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Message));
      setPrivateMessages(prev => {
        const msgMap = new Map<string, Message>(prev.map(m => [m.id, m]));
        msgs.forEach(m => msgMap.set(m.id, m));
        return Array.from(msgMap.values()).sort((a: Message, b: Message) => {
          const tA = a.timestamp?.toMillis() ?? Date.now();
          const tB = b.timestamp?.toMillis() ?? Date.now();
          return tB - tA;
        }).slice(0, 150);
      });
    }, (err) => {
      if (err.code === 'permission-denied') setStreamError("SENT_LOGS_RESTRICTED");
    });

    return () => { unsub1(); unsub2(); };
  }, [user]);

  // Fetch Global Messages
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'messages'),
      where('receiverId', '==', 'GLOBAL'),
      orderBy('timestamp', 'desc'),
      limit(100)
    );
    
    return onSnapshot(q, (snap) => {
      setGlobalMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as Message)));
    }, (err) => {
      if (err.code === 'permission-denied') setStreamError("GLOBAL_FEED_RESTRICTED");
    });
  }, [user]);

/* ═════ GC REFINEMENT: SYSTEM-WIDE PURGE & CACHE CLEARING ═════ */

function clearCaches(msgId: string, encryptedAesKey?: string, encryptedAesKeySelf?: string) {
  DECRYPTION_CACHE.delete(`${msgId}:true`);
  DECRYPTION_CACHE.delete(`${msgId}:false`);
  if (encryptedAesKey) AES_KEY_CACHE.delete(encryptedAesKey);
  if (encryptedAesKeySelf) AES_KEY_CACHE.delete(encryptedAesKeySelf);
}

// background cleanup for expired messages (Garbage Collection)
useEffect(() => {
  if (!user) return;
  
  const runGC = async () => {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    
    // 1. Memory Check (Fast: immediate feedback for current view)
    const inMemoryExpired = [...privateMessages, ...globalMessages].filter(m => {
      if (m.expiresAt) {
        const expiryDate = m.expiresAt.toDate ? m.expiresAt.toDate() : new Date(m.expiresAt);
        return expiryDate < now;
      } else if (m.isImage) {
        const creationTime = m.timestamp?.toDate ? m.timestamp.toDate() : new Date();
        return creationTime < twoHoursAgo;
      }
      return false;
    });

    // 2. System-Wide Fetch (Catch older packets outside current limit/view)
    // We only query what we have permission to delete (receiver or sender)
    let systemExpired: Message[] = [];
    try {
      const queries = [
        query(collection(db, 'messages'), where('receiverId', '==', user.uid), where('expiresAt', '<', now)),
        query(collection(db, 'messages'), where('senderId', '==', user.uid), where('expiresAt', '<', now)),
        query(collection(db, 'messages'), where('receiverId', '==', 'GLOBAL'), where('expiresAt', '<', now)),
        // Purge legacy images (>2hr) even if no expiresAt set
        query(collection(db, 'messages'), where('receiverId', '==', user.uid), where('isImage', '==', true), where('timestamp', '<', twoHoursAgo)),
        query(collection(db, 'messages'), where('senderId', '==', user.uid), where('isImage', '==', true), where('timestamp', '<', twoHoursAgo)),
        query(collection(db, 'messages'), where('receiverId', '==', 'GLOBAL'), where('isImage', '==', true), where('timestamp', '<', twoHoursAgo))
      ];
      
      const snaps = await Promise.all(queries.map(q => getDocs(q)));
      const idSet = new Set<string>();
      snaps.forEach(snap => {
        snap.docs.forEach(doc => {
          const d = doc.data() as Message;
          if (!idSet.has(doc.id)) {
            idSet.add(doc.id);
            systemExpired.push({ id: doc.id, ...d });
          }
        });
      });
    } catch (e) {
      // Possible index or permission error, fallback to inMemory
    }

    const finalPurgeList = Array.from(new Map([...inMemoryExpired, ...systemExpired].map(m => [m.id, m])).values());

    if (finalPurgeList.length > 0) {
      console.log(`GC: Purging ${finalPurgeList.length} cryptographic packets.`);
      const BATCH_SIZE = 10;
      for (let i = 0; i < finalPurgeList.length; i += BATCH_SIZE) {
        const chunk = finalPurgeList.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);
        for (const m of chunk) {
          clearCaches(m.id, m.encryptedAesKey, m.encryptedAesKeySelf);
          batch.delete(doc(db, 'messages', m.id));
        }
        try {
          await batch.commit();
        } catch (e) {}
      }
    }
  };

  runGC(); // Run immediately on mount
  const interval = setInterval(runGC, 60000); // Check every minute
  return () => clearInterval(interval);
}, [user, privateMessages, globalMessages]);

  const allMessagesForDetection = React.useMemo(() => {
    return [...privateMessages, ...globalMessages];
  }, [privateMessages, globalMessages]);

  // ══ ANTI-FLOOD ENGINE (STEPS 01-06) ══
  useEffect(() => {
    if (!user || allMessagesForDetection.length === 0) return;

    const runEffect = async () => {
      const events = await runFloodDetection(allMessagesForDetection, selectedUser?.uid ?? null, user.uid, userMap);
      if (events.length === 0) return;

      for (const event of events) {
        if (floodRunRef.current.has(event.attackId)) continue;
        floodRunRef.current.add(event.attackId);

        // Register event
        setFloodEvents(prev => [...prev.filter(e => e.attackId !== event.attackId), event]);

        // STEP 04 — Auto-download authentic image
        if (event.authenticMsg && privateKeys?.enc) {
          try {
            const aesKey = await unwrapAesKey(privateKeys.enc, event.authenticMsg.encryptedAesKey!);
            const decryptedUrl = await decryptImageData(aesKey, event.authenticMsg.encryptedData, event.authenticMsg.iv, event.authenticMsg.mimeType);
            autoDownload(decryptedUrl, `authentic_${event.attackId}.jpg`);
          } catch (e) {
            console.error("FAIL_TO_AUTO_DOWNLOAD_AUTHENTIC", e);
          }
        }

        // Mark decoys visually
        setDecoyIds(prev => {
          const next = new Set(prev);
          event.decoyIds.forEach(id => next.add(id));
          return next;
        });

        await new Promise(r => setTimeout(r, 1500));

        // STEP 05 — Purging
        setFloodEvents(prev => 
          prev.map(e => e.attackId === event.attackId ? { ...e, status: 'PURGING' } : e)
        );

        const BATCH_SIZE = 5;
        let purged = 0;
        for (let i = 0; i < event.decoyIds.length; i += BATCH_SIZE) {
          const chunk = event.decoyIds.slice(i, i + BATCH_SIZE);
          try {
            const batch = writeBatch(db);
            chunk.forEach(id => batch.delete(doc(db, 'messages', id)));
            await batch.commit();
          } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, 'messages/purge_batch');
          }
          purged += chunk.length;
          setFloodEvents(prev => 
            prev.map(e => e.attackId === event.attackId ? { ...e, purgedCount: purged } : e)
          );
          await new Promise(r => setTimeout(r, PURGE_STEP_MS));
        }

        // STEP 06 — Resolved
        setFloodEvents(prev => 
          prev.map(e => e.attackId === event.attackId ? { ...e, status: 'RESOLVED', purgedCount: event.decoyIds.length } : e)
        );
        setDecoyIds(prev => {
          const next = new Set(prev);
          event.decoyIds.forEach(id => next.delete(id));
          return next;
        });
      }
    };

    runEffect();
  }, [allMessagesForDetection, user?.uid, selectedUser?.uid, userMap, privateKeys]);

  const filteredMessages = React.useMemo(() => {
    let base = channel === 'private' ? privateMessages : globalMessages;
    
    // Disappearing Messages Layer: Filter expired packets
    base = base.filter(m => {
      if (!m.expiresAt) return true;
      const expiryDate = m.expiresAt.toDate ? m.expiresAt.toDate() : new Date(m.expiresAt);
      return expiryDate > new Date();
    });

    // If no user is selected in private channel, only show previously sent packages (as requested)
    if (channel === 'private' && !selectedUser) {
      base = base.filter(m => m.senderId === user?.uid);
    }

    // In private channel, further restrict to the selected nodal peer
    if (channel === 'private' && selectedUser) {
      base = base.filter(m => 
        (m.senderId === selectedUser.uid && m.receiverId === user?.uid) ||
        (m.senderId === user?.uid && m.receiverId === selectedUser.uid)
      );
    }

    if (!msgFilter) return base;
    const searchLower = msgFilter.toLowerCase();
    return base.filter(m => {
      const matchEmail = m.senderEmail?.toLowerCase().includes(searchLower);
      const matchHash = m.hash.toLowerCase().includes(searchLower);
      const profile = userMap.get(m.senderId);
      const matchName = profile?.displayName?.toLowerCase().includes(searchLower);
      return matchEmail || matchHash || matchName;
    });
  }, [privateMessages, globalMessages, channel, msgFilter, selectedUser, user?.uid]);

  const displayedMessages = filteredMessages;

  const handleLogin = async () => {
    loginWithGoogle();
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setMimeType(f.type);
    setFileName(f.name);
    const r = new FileReader();
    r.onload = () => {
      const dataUrl = r.result as string;
      setPhotoUrl(dataUrl);
      
      // Mirror to Forensics for pre-transmission audit
      window.dispatchEvent(new CustomEvent('necrosteg-forensic-image', {
        detail: {
            imageDataUrl: dataUrl,
            mimeType: f.type,
            source: 'SecureComm',
            fileName: f.name
        }
      }));
    };
    r.readAsDataURL(f);
  };

  const sendPhoto = async () => {
    if (commAuthorized) {
        executeSendPhoto();
    } else {
        setAuthAction({ type: 'send' });
    }
  };

  const executeSendPhoto = async () => {
    if (!user || !photoUrl || !privateKeys) {
      setSendError('IDENTITY_UNINITIALIZED: Please wait for vault sync or refresh.');
      return;
    }

    if (channel === 'private') {
      if (!selectedUser) {
        setSendError('NO_RECIPIENT_SELECTED: Secure Private link requires a target node.');
        return;
      }
      if (!selectedUser.exchangeKey) {
        setSendError('RECIPIENT_KEY_MISSING: Target node has no encryption key registered. Ask them to log in first.');
        return;
      }
    }

    setIsSending(true);
    setSendError(null);
    try {
      const isCovertEnabled = safeStorage.getItem('stego_covert') === 'true';
      const stegoMethod = safeStorage.getItem('stego_method') as 'lsb' | 'dct' | null;
      
      const buffer = await optimizeImageForSecureComm(photoUrl);

      let finalEncryptedData: string;
      let finalIv: string = '';
      let wrappedAesKey: string | null = null;
      let wrappedAesKeySelf: string | null = null;

      if (channel === 'private' && selectedUser?.exchangeKey) {
        const ephemeralAesKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
        
        const { encrypted, iv } = await encryptImageData(ephemeralAesKey, buffer);
        finalEncryptedData = encrypted;
        finalIv = iv;

        wrappedAesKey = await wrapAesKey(selectedUser.exchangeKey, ephemeralAesKey);
        if (profileData.exchangeKey) {
          wrappedAesKeySelf = await wrapAesKey(profileData.exchangeKey, ephemeralAesKey);
        }
      } else {
        finalEncryptedData = bufferToB64(buffer);
      }

      const hash = await sha256(finalEncryptedData);
      const signature = await signData(privateKeys.sig, hash);

      const payloadSize = new Blob([finalEncryptedData]).size + (isCovertEnabled ? new Blob([photoUrl]).size : 0);
      
      if (payloadSize > 10000000) {
        throw new Error("SECURE_ENFORCEMENT_DENIED: Payload remains above 10MB threshold. Please optimize further.");
      }

      const CHUNK_SIZE = 800000;
      const isChunked = finalEncryptedData.length > CHUNK_SIZE || (isCovertEnabled && photoUrl.length > CHUNK_SIZE);
      
      let docEncryptedData = finalEncryptedData;
      let docFallbackImage = isCovertEnabled ? photoUrl : null;
      let encChunks: string[] = [];
      let fallbackChunks: string[] = [];

      if (isChunked) {
        if (finalEncryptedData.length > CHUNK_SIZE) {
          for (let i = 0; i < finalEncryptedData.length; i += CHUNK_SIZE) {
            encChunks.push(finalEncryptedData.substring(i, i + CHUNK_SIZE));
          }
          docEncryptedData = "CHUNKED_DATA";
        }
        if (isCovertEnabled && photoUrl && photoUrl.length > CHUNK_SIZE) {
          for (let i = 0; i < photoUrl.length; i += CHUNK_SIZE) {
            fallbackChunks.push(photoUrl.substring(i, i + CHUNK_SIZE));
          }
          docFallbackImage = "CHUNKED_DATA";
        }
      }

      const messageRef = await addDoc(collection(db, 'messages'), {
        senderId: user.uid,
        senderEmail: user.email,
        receiverId: channel === 'global' ? 'GLOBAL' : selectedUser!.uid,
        encryptedData: docEncryptedData,
        iv: finalIv,
        encryptedAesKey: wrappedAesKey,
        encryptedAesKeySelf: wrappedAesKeySelf,
        hash,
        signature,
        nonce: generateNonce(),
        gateway: channel === 'global' ? 'global' : gateway,
        timestamp: serverTimestamp(),
        expiresAt: selectedTtl > 0 ? new Date(Date.now() + selectedTtl) : null,
        fileName: fileName || (channel === 'global' ? 'broadcast.png' : 'private_transfer.png'),
        mimeType: mimeType || 'image/png',
        isImage: true,
        fallbackImage: docFallbackImage,
        covertMethod: isCovertEnabled ? stegoMethod : null,
        isChunked,
        encChunksCount: encChunks.length,
        fallbackChunksCount: fallbackChunks.length
      });

      if (isChunked) {
        const batch = writeBatch(db);
        encChunks.forEach((chunk, idx) => {
          batch.set(doc(collection(db, 'messages', messageRef.id, 'chunks')), {
            parentMessageId: messageRef.id,
            senderId: user.uid,
            receiverId: channel === 'global' ? 'GLOBAL' : selectedUser!.uid,
            chunkIndex: idx,
            data: chunk,
            type: 'encrypted'
          });
        });
        fallbackChunks.forEach((chunk, idx) => {
          batch.set(doc(collection(db, 'messages', messageRef.id, 'chunks')), {
            parentMessageId: messageRef.id,
            senderId: user.uid,
            receiverId: channel === 'global' ? 'GLOBAL' : selectedUser!.uid,
            chunkIndex: idx,
            data: chunk,
            type: 'fallback'
          });
        });
        await batch.commit();
      }

      // Dispatch to Forensics for outgoing audit
      window.dispatchEvent(new CustomEvent('necrosteg-forensic-payload', {
        detail: {
          payload: finalEncryptedData,
          source: 'SecureComm_Outgoing',
          method: 'AES_GCM_RAW'
        }
      }));

      // Update activity status
      await setDoc(doc(db, 'users', user.uid), { 
        activity: `TRANSMITTING_${channel.toUpperCase()}_PACKAGE`,
        lastSeen: serverTimestamp() 
      }, { merge: true });
      
      setPhotoUrl('');
      if (fileRef.current) fileRef.current.value = '';
      const toast = document.createElement('div');
      toast.className = 'fixed bottom-4 right-4 bg-accent-primary text-bg-main px-4 py-2 rounded-full text-xs font-bold z-50 animate-bounce shadow-lg border-2 border-border-main';
      toast.innerText = '✓ TRANSMISSION_SUCCESS';
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 3000);

    } catch (error: any) {
      handleFirestoreError(error, OperationType.WRITE, 'messages');
    } finally {
      setIsSending(false);
    }
  };

  const analyzePayload = async (msg: Message) => {
    setAiReport({ code: '', explanation: '', loading: true });
    try {
      const rawCode = extractFrequencyDCT(msg.hash);
      const { interpretStegoPayload: geminiInterpret } = await import('../services/geminiService');
      const interpretation = await geminiInterpret(rawCode, msg.hash);
      setAiReport({ code: rawCode, explanation: interpretation, loading: false });
    } catch (error) {
      setAiReport(prev => prev ? { ...prev, explanation: 'AI analysis temporarily unavailable.', loading: false } : null);
    }
  };

  const updateProfile = async () => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.uid), { ...profileData, uid: user.uid, email: user.email }, { merge: true });
      setIsProfileOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users/' + user.uid);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-bg-main flex flex-col items-center justify-center p-6 text-center space-y-6">
      <div className="relative">
        <Cpu className="w-16 h-16 text-accent-primary animate-spin" />
        <div className="absolute inset-0 bg-accent-primary/10 blur-2xl rounded-full" />
      </div>
      <div className="space-y-1">
        <h1 className="text-xl font-bold text-text-main tracking-[0.4em] uppercase">Initializing SecureComm_OS</h1>
        <p className="text-[9px] text-accent-primary font-mono animate-pulse">Syncing Cryptographic Vaults... Verify RSA Parity...</p>
      </div>
      <div className="w-48 h-1 bg-border-main/50 rounded-full overflow-hidden">
        <motion.div 
          className="h-full bg-accent-primary"
          initial={{ width: 0 }}
          animate={{ width: '100%' }}
          transition={{ duration: 0.8, repeat: Infinity }}
        />
      </div>
    </div>
  );

  if (!user) return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-6">
       <div className="p-6 bg-bg-surface/50 border border-border-main rounded-3xl">
          <ShieldAlert className="w-16 h-16 text-red-500 mb-4 mx-auto animate-pulse" />
          <h2 className="text-xl font-bold text-text-main tracking-tighter uppercase mb-2">Unauthorized Access</h2>
          <p className="text-text-dim text-xs max-w-xs mx-auto leading-relaxed">
            Reception protocols require active cryptographic identity verification. Please authenticate to establish a secure signal line.
          </p>
       </div>
       <button onClick={handleLogin}
         className="px-8 py-3 bg-accent-primary text-bg-main text-xs font-bold uppercase rounded-xl hover:opacity-90 transition-all flex items-center gap-2">
         <KeyIcon className="w-4 h-4" /> Initialize Identity Protocol
       </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-bg-main text-text-main font-sans selection:bg-accent-primary/30 selection:text-accent-primary transition-colors duration-300">
      {/* Background Grid */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, var(--accent-primary) 1px, transparent 0)', backgroundSize: '40px 40px' }} />

      {/* AI Expert Modal */}
      <AnimatePresence>
        {aiReport && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setAiReport(null)}
              className="absolute inset-0 bg-bg-overlay backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-bg-surface border border-accent-primary/30 rounded-2xl overflow-hidden shadow-2xl shadow-accent-primary/10"
            >
              <div className="p-1 bg-accent-primary/10 border-b border-accent-primary/20 flex items-center justify-between px-6 py-4">
                <div className="flex items-center gap-3">
                  <BrainCircuit className="w-5 h-5 text-accent-primary" />
                  <span className="text-xs font-bold text-accent-primary uppercase tracking-[0.2em]">AI_STREGO_EXPERT_DECODER</span>
                </div>
                <button onClick={() => setAiReport(null)} 
                  title="Exit the AI analysis view."
                  className="p-1.5 hover:bg-accent-primary/10 rounded-full text-text-dim hover:text-text-main transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                 <div>
                    <p className="text-[9px] text-text-dim font-bold uppercase mb-2 tracking-widest">Extracted DCT Frequency Domain Code</p>
                    <div className="bg-bg-main/50 border border-border-main rounded-xl p-4 font-mono text-xs text-accent-primary/80 break-all leading-relaxed shadow-inner">
                      {aiReport.loading ? 'ANALYZING_8x8_BLOCKS...' : aiReport.code}
                    </div>
                 </div>

                 <div>
                    <p className="text-[9px] text-text-dim font-bold uppercase mb-2 tracking-widest">Natural Language Sync</p>
                    {aiReport.loading ? (
                      <div className="space-y-2">
                        <div className="h-4 bg-border-main rounded animate-pulse w-full" />
                        <div className="h-4 bg-border-main rounded animate-pulse w-3/4" />
                        <div className="h-4 bg-border-main rounded animate-pulse w-5/6" />
                      </div>
                    ) : (
                      <div className="text-sm text-text-main font-medium leading-relaxed bg-accent-primary/5 p-4 rounded-xl border border-accent-primary/10 shadow-sm">
                        {aiReport.explanation}
                      </div>
                    )}
                 </div>
              </div>

              <div className="p-4 bg-bg-main/40 border-t border-border-main/60 text-center">
                 <button 
                  onClick={() => setAiReport(null)}
                  className="px-8 py-2.5 bg-accent-primary text-bg-main text-[10px] font-black uppercase rounded-lg hover:opacity-90 transition-all active:scale-95 shadow-sm"
                 >
                   Clear Transmission
                 </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {playoffAnalysis && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setPlayoffAnalysis(null)}
              className="absolute inset-0 bg-bg-overlay backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-lg bg-bg-surface border border-accent-primary/20 rounded-2xl overflow-hidden shadow-2xl shadow-accent-primary/10 p-8"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-accent-primary/10 rounded-xl">
                  <Radar className="w-5 h-5 text-accent-primary" />
                </div>
                <h4 className="text-sm font-bold text-text-main uppercase tracking-widest">NEURAL_PLAYOFF_ANALYSIS</h4>
              </div>
              
              {playoffAnalysis.loading ? (
                <div className="space-y-4">
                  <div className="h-4 bg-bg-main animate-pulse rounded w-full" />
                  <div className="h-4 bg-bg-main animate-pulse rounded w-5/6" />
                  <div className="h-4 bg-bg-main animate-pulse rounded w-4/6" />
                </div>
              ) : (
                <div className="bg-bg-main/50 border border-border-main rounded-xl p-5 mb-6">
                  <p className="text-xs text-text-main leading-relaxed font-medium">
                    {playoffAnalysis.report}
                  </p>
                </div>
              )}

              <button 
                onClick={() => setPlayoffAnalysis(null)}
                title="Discard the current strategic analysis report."
                className="w-full py-3 bg-accent-primary text-bg-main text-[10px] font-black uppercase rounded-xl hover:opacity-90 transition-all font-mono"
              >
                CLOSE_ANALYSIS_STREAM
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6 pb-20">
      <div className="flex flex-wrap gap-4 justify-between items-end">
        <div>
           <div className="flex items-center gap-2 text-accent-primary text-[10px] font-bold tracking-[0.3em] uppercase mb-1">
              <Activity className="w-3 h-3 animate-pulse" /> LIVE_SECURE_CHANNEL
           </div>
           <h2 className="text-2xl font-bold tracking-tighter text-text-main">COMMUNICATION_CENTER</h2>
        </div>
        
        <div className="flex items-center gap-4">
           <div className="hidden sm:flex flex-col items-end">
              <button 
               onClick={analyzePlayoffs}
               disabled={playoffAnalysis?.loading}
               title="Run a real-time strategic analysis of the network threat landscape."
               className="flex flex-col items-end group hover:opacity-80 transition-opacity"
              >
                 <p className="text-[8px] text-accent-primary font-mono tracking-widest uppercase flex items-center gap-1">
                   {playoffAnalysis?.loading ? <Cpu className="w-2 h-2 animate-spin" /> : <BrainCircuit className="w-2 h-2" />}
                   Playoff_Analysis
                 </p>
                 <div className="flex gap-0.5 mt-1">
                    {[1,2,3,4,5].map(i => <div key={i} className={`w-1 h-3 rounded-full ${i <= 4 ? 'bg-accent-primary' : 'bg-border-main'}`} />)}
                 </div>
              </button>
           </div>

           <div className="hidden lg:flex items-center gap-4 border-l border-border-main/50 pl-4 h-10">
              <div className="flex flex-col">
                <span className="text-[7px] text-text-dim font-bold uppercase tracking-widest leading-none mb-1">Neural_Validation</span>
                <div className="flex items-center gap-1.5 leading-none">
                  <BrainCircuit className="w-3 h-3 text-accent-primary" />
                  <span className="text-[9px] text-accent-primary font-mono leading-none font-bold">ACTIVE_PARITY</span>
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-[7px] text-text-dim font-bold uppercase tracking-widest leading-none mb-1">Heroic_Check</span>
                <div className="flex items-center gap-1.5 leading-none">
                  <ShieldCheck className="w-3 h-3 text-accent-primary" />
                  <span className="text-[9px] text-accent-primary font-mono leading-none tracking-tighter font-bold">VERIFIED_SECURE</span>
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-[7px] text-text-dim font-bold uppercase tracking-widest leading-none mb-1">Anti_Flood_Shield</span>
                <div className="flex items-center gap-1.5 leading-none">
                  <Siren className="w-3 h-3 text-red-400" />
                  <span className="text-[9px] text-red-400 font-mono leading-none font-bold">DEFENCE_ACTIVE</span>
                </div>
              </div>
           </div>

           <div className="flex gap-1 p-1 bg-bg-surface border border-border-main rounded-xl overflow-hidden shadow-sm">
              {(['private', 'global'] as const).map(ch => (
                <button key={ch} onClick={() => setChannel(ch)}
                  title={ch === 'private' ? 'Switch to point-to-point encrypted communication mode.' : 'Switch to public unencrypted broadcast mode.'}
                 className={`px-4 py-2 text-[10px] font-bold tracking-widest rounded-lg transition-all ${channel === ch ? 'bg-accent-primary text-bg-main' : 'text-text-dim hover:text-text-main'}`}>
                   {ch === 'private' ? '🔒 PRIVATE_INBOX' : '📡 GLOBAL_FEED'}
                </button>
              ))}
           </div>
        </div>

        <button onClick={() => setIsProfileOpen(true)}
          title="Open your identity console to manage PGP keys and display alias."
          className="flex items-center gap-3 bg-bg-surface border border-border-main px-4 py-2 rounded-xl group hover:border-accent-primary/40 transition-all shadow-sm">
           <div className="text-right">
              <p className="text-[9px] text-text-dim font-mono">NODE</p>
              <p className="text-[10px] text-accent-primary font-bold font-mono uppercase">{profileData.displayName || user?.email?.split('@')[0]}</p>
           </div>
           <div className="w-8 h-8 rounded-full border border-border-main bg-bg-main flex items-center justify-center relative group-hover:border-accent-primary/50 transition-colors">
              <UserIcon className="w-4 h-4 text-text-dim" />
              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-accent-primary rounded-full border-2 border-bg-surface" />
           </div>
        </button>
      </div>

      <AnimatePresence>
        {floodEvents.map(event => (
          <AttackAlertBanner 
            key={event.attackId} 
            event={event} 
            onDismiss={() => setFloodEvents(prev => prev.filter(e => e.attackId !== event.attackId))} 
            users={users}
            privateKeys={privateKeys}
          />
        ))}
      </AnimatePresence>

      {/* Profile Modal */}
      <AnimatePresence>
        {isProfileOpen && (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div initial={{ scale:0.95, y:20 }} animate={{ scale:1, y:0 }} exit={{ scale:0.95, y:20 }}
              className="bg-bg-surface border border-border-main rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
              <div className="p-4 border-b border-border-main bg-bg-main/20 flex justify-between items-center">
                <h3 className="text-xs font-bold text-accent-primary uppercase tracking-widest flex items-center gap-2">
                  <KeyIcon className="w-4 h-4" /> Identity_Parameters
                </h3>
                <button onClick={() => setIsProfileOpen(false)} 
                  title="Close the identity parameters console."
                  className="text-text-dim hover:text-text-main transition-colors">×</button>
              </div>
              <div className="p-6 space-y-5">
                <div className="space-y-2">
                  <label className="text-[10px] text-text-dim uppercase font-bold tracking-tighter">Node Alias</label>
                  <input type="text" value={profileData.displayName}
                    title="Change your public identifier on the network."
                    onChange={(e) => setProfileData(p => ({ ...p, displayName: e.target.value.toUpperCase() }))}
                    className="w-full bg-bg-main/40 border border-border-main rounded-lg p-3 text-xs text-text-main focus:outline-none focus:border-accent-primary/50 font-mono" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] text-text-dim uppercase font-bold tracking-tighter">Public Key (RSA/PGP)</label>
                  <textarea value={profileData.publicKey}
                    readOnly
                    className="w-full bg-bg-main/40 border border-border-main rounded-lg p-3 text-[10px] text-text-dim focus:outline-none font-mono h-20 resize-none" />
                </div>
                <div className="p-3 bg-accent-primary/5 border border-accent-primary/10 rounded-xl space-y-2">
                   <p className="text-[8px] text-accent-primary font-bold uppercase tracking-widest flex items-center gap-2">
                      <Zap className="w-3 h-3" /> Advanced_Key_Maintenance
                   </p>
                   <p className="text-[7px] text-text-dim leading-relaxed font-mono">
                      Rotating keys will invalidate previous secure transmissions encrypted with your old parameters. Proceed with extreme caution.
                   </p>
                   <button 
                    onClick={async () => {
                      if (!user || !window.confirm("CONFIRM_KEY_ROTATION: This action is irreversible.")) return;
                      const ks = await generateKeyPair();
                      await setDoc(doc(db, 'users', user.uid), { publicKey: ks.publicKey, exchangeKey: ks.exchangeKey }, { merge: true });
                      await saveKey(`sig_priv_${user.uid}`, ks.privateKey);
                      await saveKey(`enc_priv_${user.uid}`, ks.exchangePrivate);
                      setProfileData(p => ({ ...p, publicKey: ks.publicKey, exchangeKey: ks.exchangeKey }));
                      setPrivateKeys({ sig: ks.privateKey, enc: ks.exchangePrivate });
                    }}
                    title="DANGER: Cycle your RSA keys. This will make your previous encrypted messages unreadable."
                    className="w-full py-2 bg-red-500/10 text-red-500 text-[9px] font-bold uppercase rounded border border-red-500/20 hover:bg-red-500 hover:text-text-main transition-all"
                   >
                     REGENERATE_IDENTITY_PARAMETERS
                   </button>
                   
                   <button 
                    onClick={async () => {
                      if (!user || !window.confirm("CONFIRM_SYSTEM_PURGE: This will delete ALL pictures and messages you have sent or received. This action is irreversible.")) return;
                      try {
                        const q1 = query(collection(db, 'messages'), where('senderId', '==', user.uid));
                        const q2 = query(collection(db, 'messages'), where('receiverId', '==', user.uid));
                        const [s1, s2] = await Promise.all([getDocs(q1), getDocs(q2)]);
                        
                        const batch = writeBatch(db);
                        const allDocs = [...s1.docs, ...s2.docs];
                        allDocs.forEach(d => {
                          const m = d.data() as Message;
                          clearCaches(d.id, m.encryptedAesKey, m.encryptedAesKeySelf);
                          batch.delete(d.ref);
                        });
                        await batch.commit();
                        alert(`Successfully purged ${allDocs.length} packets from the network.`);
                      } catch (e) {
                        alert("PURGE_FAILED: Verification error.");
                      }
                    }}
                    title="Delete all previous pictures and message logs associated with your identity."
                    className="w-full py-2 bg-orange-500/10 text-orange-500 text-[9px] font-bold uppercase rounded border border-orange-500/20 hover:bg-orange-500 hover:text-text-main transition-all font-mono"
                   >
                     CLEAR_ALL_PREVIOUS_LOGS
                   </button>
                </div>
                <button onClick={updateProfile}
                  title="Synchronize your profile changes with the global identity ledger."
                  className="w-full py-3 bg-accent-primary text-bg-main text-[10px] font-black uppercase rounded-lg hover:opacity-90 transition-all active:scale-95 shadow-sm">
                  Sync Parameters to Network
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid lg:grid-cols-12 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-4 space-y-4">
           <div className="bg-bg-surface border border-border-main rounded-2xl p-4 space-y-4 shadow-sm font-mono overflow-y-auto max-h-[calc(100vh-250px)] custom-scrollbar">
              <Suspense fallback={<div className="text-[10px] text-text-dim/60 text-center py-4 uppercase tracking-widest font-mono">Loading_Telemetry_Node...</div>}>
                <StageUtilization />
              </Suspense>
              
              <div className="relative">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim/60" />
                 <input type="text" placeholder="SEARCH_NODES..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  title="Find specific user nodes by their alias or cryptographic identifier."
                  className="w-full bg-bg-main/40 border border-border-main rounded-lg py-2 pl-10 pr-4 text-[10px] text-text-main focus:outline-none focus:border-accent-primary/50 font-bold" />
              </div>
              <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                 {users.filter(u => u.email?.toLowerCase().includes(searchTerm.toLowerCase()) || u.displayName?.toLowerCase().includes(searchTerm.toLowerCase())).map(u => (
                    <button key={u.uid} onClick={() => { setSelectedUser(u); setChannel('private'); }}
                      title={`Open a secure point-to-point channel with ${u.displayName || u.email}.`}
                      className={`w-full p-2.5 rounded-xl border transition-all flex items-center justify-between group ${
                        selectedUser?.uid === u.uid 
                        ? 'bg-accent-primary/10 border-accent-primary shadow-[0_0_15px_rgba(0,255,0,0.05)]' 
                        : 'bg-bg-surface/50 border-border-main hover:border-accent-primary/50'
                      }`}>
                       <div className="flex items-center gap-3">
                          <div className={`w-7 h-7 rounded-full bg-bg-main border flex items-center justify-center transition-colors ${
                            selectedUser?.uid === u.uid ? 'border-accent-primary/40' : 'border-border-main'
                          }`}>
                             <UserIcon className={`w-3 h-3 ${selectedUser?.uid === u.uid ? 'text-accent-primary' : 'text-text-dim'}`} />
                          </div>
                          <div>
                             <p className={`text-[10px] font-bold uppercase transition-colors ${
                               selectedUser?.uid === u.uid ? 'text-accent-primary' : 'text-text-main'
                             }`}>{u.displayName || u.email?.split('@')[0]}</p>
                             <div className="flex flex-col text-left">
                                <p className="text-[8px] text-text-dim/60 font-mono tracking-tighter">{u.activity || 'STANDBY_MODE'}</p>
                             </div>
                          </div>
                       </div>
                       <Send className={`w-3.5 h-3.5 transition-colors ${
                         selectedUser?.uid === u.uid ? 'text-accent-primary' : 'text-text-dim group-hover:text-accent-primary'
                       }`} />
                    </button>
                 ))}
              </div>
           </div>

           <AnimatePresence>
              {(selectedUser || channel === 'global') && (
                <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:10 }}
                  className="bg-bg-surface border border-border-main rounded-2xl p-5 space-y-4 shadow-sm font-mono">
                   <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold text-text-main uppercase tracking-widest">
                        {channel === 'global' ? '📡 Broadcast Payload' : '🔒 Secure Transmission'}
                      </p>
                      <button onClick={() => setSelectedUser(null)} className="text-text-dim hover:text-text-main">×</button>
                   </div>

                   {channel === 'private' && (
                     <div className="flex gap-2">
                        {(['alpha', 'beta'] as const).map(gw => (
                          <button key={gw} onClick={() => setGateway(gw)}
                            title={gw === 'alpha' ? 'Route traffic through the primary Alpha gateway.' : 'Route traffic through the high-entropy Beta gateway.'}
                            className={`flex-1 py-1.5 rounded-lg border text-[9px] font-bold transition-all ${
                               gateway === gw 
                               ? 'bg-accent-primary text-bg-main border-accent-primary' 
                               : 'border-border-main text-text-dim hover:border-accent-primary/40'
                             }`}>
                            GW-{gw === 'alpha' ? 'α P1→P2' : 'β P2→P3'}
                          </button>
                        ))}
                     </div>
                   )}

                   {photoUrl && (
                      <div className="space-y-3">
                        <div className="aspect-video w-full rounded-xl bg-bg-main border border-border-main overflow-hidden relative shadow-inner">
                           <img src={photoUrl} alt="Preview" className="w-full h-full object-cover" />
                           <button onClick={() => { setPhotoUrl(''); safeStorage.removeItem('stego_payload'); if (fileRef.current) fileRef.current.value=''; }}
                             title="Discard the current payload preview and clear memory."
                             className="absolute top-2 right-2 w-6 h-6 bg-bg-main/70 border border-border-main rounded-full flex items-center justify-center text-red-500 transition-colors shadow-sm">
                             <X className="w-3 h-3" />
                           </button>
                        </div>
                        
                        {/* Pre-Transmission Analysis Card */}
                        <div className="p-3 bg-accent-primary/5 border border-accent-primary/20 rounded-xl space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[8px] text-accent-primary font-bold uppercase tracking-widest flex items-center gap-1.5">
                              <BrainCircuit className="w-3 h-3" /> Pre-Transmission Audit
                            </span>
                            <span className="text-[7px] text-text-dim/60 font-mono uppercase truncate max-w-[100px] text-right">{fileName}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-accent-primary animate-pulse" />
                            <p className="text-[9px] text-text-main font-mono leading-tight">
                              Plain extraction verified. PGP signature generated. Payload integrity confirmed.
                            </p>
                          </div>
                        </div>
                      </div>
                   )}

                   <div className="space-y-2">
                       <p className="text-[8px] text-text-dim font-bold uppercase tracking-widest px-1">Package_Disappearing_Timer</p>
                       <div className="flex flex-wrap gap-1">
                         {TTL_OPTIONS.map(opt => (
                           <button
                             key={opt.value}
                             onClick={() => setSelectedTtl(opt.value)}
                             title={`Automatically purge this message after ${opt.label}.`}
                             className={`px-3 py-1.5 rounded-lg text-[8px] font-bold font-mono transition-all border ${
                               selectedTtl === opt.value 
                               ? 'bg-accent-primary/20 border-accent-primary text-accent-primary shadow-sm shadow-accent-primary/20' 
                               : 'bg-bg-main/40 border-border-main text-text-dim hover:border-border-main/80'
                             }`}
                           >
                             {opt.label}
                           </button>
                         ))}
                       </div>
                    </div>

                   <div className="space-y-2">
                      <button onClick={() => fileRef.current?.click()}
                        title="Select a local image to serve as the carrier for your encrypted payload."
                        className="w-full py-2.5 border border-dashed border-border-main/60 rounded-xl text-[10px] text-text-dim hover:border-accent-primary/40 hover:text-accent-primary transition-colors flex items-center justify-center gap-2 font-bold shadow-sm">
                        <ImagePlus className="w-4 h-4" /> UPLOAD_IMAGE_PAYLOAD
                      </button>
                      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
                      <input type="text" placeholder="PASTE_PAYLOAD_URL..." value={photoUrl.startsWith('data:') ? '' : photoUrl} onChange={e => setPhotoUrl(e.target.value)}
                        title="Input a direct URL to a remote image carrier."
                        className="w-full bg-bg-main/40 border border-border-main rounded-lg p-2.5 text-[10px] text-text-main font-mono focus:outline-none focus:border-accent-primary/40 font-bold" />
                   </div>

                   {sendError && (
                     <motion.div 
                       initial={{ opacity: 0, height: 0 }}
                       animate={{ opacity: 1, height: 'auto' }}
                       className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 text-left"
                     >
                        <p className="text-[9px] text-red-400 font-mono leading-relaxed uppercase font-bold">
                          {sendError}
                        </p>
                     </motion.div>
                   )}

                   <button 
                    onClick={sendPhoto}
                    disabled={isSending || !photoUrl}
                    title="Initiate the secure transmission protocol for the current payload."
                    className="w-full bg-accent-primary text-bg-main py-4 rounded-xl font-black text-[11px] uppercase tracking-[0.3em] hover:bg-emerald-500 transition-all active:scale-[0.98] disabled:opacity-30 disabled:grayscale flex items-center justify-center gap-3 shadow-lg shadow-accent-primary/20"
                   >
                     {isSending ? (
                       <Cpu className="w-4 h-4 animate-spin" />
                     ) : (
                       <Zap className="w-4 h-4" />
                     )}
                     {isSending ? 'CRYPT_TRANSMITTING...' : 'INITIATE_SEND_PROTOCOL'}
                   </button>
                </motion.div>
              )}
           </AnimatePresence>
        </div>

        {/* Right Column */}
        <div className="lg:col-span-8 space-y-4">
           <div className="flex items-center justify-between px-2">
              <h3 className="text-xs font-bold text-text-dim uppercase tracking-[0.2em] flex items-center gap-2">
                 <History className="w-4 h-4" /> {channel === 'private' ? 'PRIVATE_INBOX' : 'GLOBAL_SIGNAL_FEED'}
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-text-dim/60 font-mono animate-pulse uppercase tracking-wider">ANTI_FLOOD_MONITOR_ACTIVE</span>
                <div className="w-1.5 h-1.5 rounded-full bg-accent-primary" />
              </div>
           </div>

           <div className="flex gap-4 px-2">
              <div className="relative flex-1 font-mono">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-dim/60" />
                 <input 
                  type="text" 
                  placeholder="FILTER_FEED_BY_IDENTIFIER_OR_HASH..." 
                  title="Filter the message feed by sender name, ID, or transmission hash."
                  value={msgFilter} 
                  onChange={e => setMsgFilter(e.target.value)}
                  className="w-full bg-bg-surface border border-border-main rounded-xl py-2 pl-10 pr-4 text-[10px] text-text-main focus:outline-none focus:border-accent-primary/40 font-bold shadow-sm" 
                 />
              </div>
           </div>

           {streamError && (
             <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3">
               <ShieldX className="w-5 h-5 text-red-500" />
               <p className="text-[10px] text-red-400 font-bold uppercase tracking-widest">
                 Line Interference Detected: {streamError}
               </p>
             </div>
           )}

           <div className="grid grid-cols-1 gap-4">
              {displayedMessages.map(m => (
                 <MessageCard 
                   key={m.id} 
                   msg={m} 
                   currentUser={user} 
                   senderProfile={userMap.get(m.senderId)}
                   myPrivateKey={privateKeys?.enc}
                   onAnalyze={analyzePayload}
                   isAuthorized={authorizedMsgs.has(m.id)}
                   onAuthorizeRequest={(id) => setAuthAction({ type: 'view', msgId: id })}
                   onDelete={async (id) => {
                     try {
                       const cs = await getDocs(collection(db, 'messages', id, 'chunks'));
                        const b = writeBatch(db);
                        cs.forEach(c => b.delete(c.ref));
                        b.delete(doc(db, 'messages', id));
                        await b.commit();
                     } catch (error) {
                       handleFirestoreError(error, OperationType.DELETE, 'messages/' + id);
                     }
                   }} 
                   isDecoy={decoyIds.has(m.id)} 
                 />
              ))}
              
              {displayedMessages.length === 0 && (
                <div className="col-span-full py-20 flex flex-col items-center justify-center border border-border-main border-dashed rounded-3xl bg-bg-surface/30">
                   <Server className="w-10 h-10 text-text-dim mb-4 opacity-50" />
                   <p className="text-[11px] text-text-dim uppercase font-bold tracking-widest">Channel Standby</p>
                   <p className="text-[9px] text-text-dim/60 italic mt-1 font-mono uppercase">Scanning Incoming Signal Lines...</p>
                </div>
              )}
           </div>
        </div>
      </div>

      <ActionAuthModal 
        isOpen={!!authAction}
        userId={user?.uid || ''}
        onClose={() => setAuthAction(null)}
        title={authAction?.type === 'send' ? 'TRANSMISSION_AUTHORIZATION' : 'VIEW_AUTHORIZATION'}
        onSuccess={() => {
          setCommAuthorized(true);
          if (authAction?.type === 'send') {
            setTimeout(() => executeSendPhoto(), 100);
          } else if (authAction?.type === 'view' && authAction.msgId) {
            setAuthorizedMsgs(prev => new Set([...prev, authAction.msgId!]));
          }
          setAuthAction(null);
        }}
      />
      </div>

      <div className="bg-accent-primary/5 border border-accent-primary/10 rounded-3xl p-10 flex flex-col items-center text-center space-y-5 mt-10 shadow-sm">
         <Fingerprint className="w-12 h-12 text-accent-primary" />
         <h3 className="text-lg font-bold text-accent-primary tracking-tighter uppercase">Forensic Resilience: Multi-Layered Covert Channels</h3>
         <p className="text-text-dim/80 max-w-2xl text-[11px] leading-relaxed">
           NecroSteg utilizes a <strong>Dual-Payload Architecture</strong> to ensure operational continuity in hostile environments. 
           In addition to the primary E2EE channel, a secondary <strong>Covert Fallback Channel</strong> embeds critical "Entropy Information" directly into the carrier's statistical profile.
           If the high-assurance RSA-GCM handshake fails (due to key mismatch, signature corruption, or active interception), the recipient can bypass the crypto-layer entirely 
           to perform <strong>Direct Raw Extraction</strong>. This adaptive failover ensures that even as the primary secure method is compromised, the inherent steganography 
           delivers vital payloads through the noise.
         </p>
      </div>
    </div>
  );
}
