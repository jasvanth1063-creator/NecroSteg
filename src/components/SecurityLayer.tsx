/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Lock, 
  ShieldCheck, 
  Fingerprint, 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  X,
  Eye, EyeOff,
  Keyboard,
  ShieldAlert
} from 'lucide-react';
import { 
  hashPasscode, 
  validatePasscodeComplexity, 
  getSavedHash, 
  savePasscodeHash,
  unlockSession,
  isSessionUnlocked,
  resetPasscode
} from '../services/securityService';

interface SecurityLayerProps {
  user: any; // FirebaseUser
  children: React.ReactNode;
}

export default function SecurityLayer({ user, children }: SecurityLayerProps) {
  const [onboarding, setOnboarding] = useState(false);
  const [locked, setLocked] = useState(true);
  const [isAppVisible, setIsAppVisible] = useState(true);
  const [passcode, setPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [step, setStep] = useState<'create' | 'confirm' | 'unlock'>('unlock');
  const [attempts, setAttempts] = useState(0);
  const [lockoutTime, setLockoutTime] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showBiometric, setShowBiometric] = useState(false);
  const [biometricStatus, setBiometricStatus] = useState<'scanning' | 'failed' | 'success'>('scanning');
  const [showPassword, setShowPassword] = useState(false);

  // Privacy Shield: Blur the app when visible in app switcher (minimized/hidden)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        setIsAppVisible(false);
      } else {
        // When coming back, we might want to keep it hidden until a minor delay or re-auth
        // For web, if it's visible, we show it.
        setIsAppVisible(true);
      }
    };
    window.addEventListener('visibilitychange', handleVisibility);
    return () => window.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  const checkStatus = useCallback(() => {
    if (!user) return;
    const hasHash = getSavedHash(user.uid);
    if (!hasHash) {
      setOnboarding(true);
      setStep('create');
      setLocked(true);
      setShowBiometric(false);
    } else {
      setOnboarding(false);
      setStep('unlock');
      const isUnlocked = isSessionUnlocked();
      setLocked(!isUnlocked);
      if (!isUnlocked) {
        setShowBiometric(true);
        setBiometricStatus('scanning');
        // Simulate biometric scan
        setTimeout(() => {
          setBiometricStatus('failed'); // Biometric always "fails" to force passcode fallback as per requirements
          setTimeout(() => setShowBiometric(false), 1500);
        }, 2000);
      }
    }
  }, [user]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // Lockout timer
  useEffect(() => {
    if (lockoutTime === null) return;
    if (lockoutTime <= 0) {
      setLockoutTime(null);
      setAttempts(0);
      return;
    }
    const timer = setInterval(() => {
      setLockoutTime(prev => (prev ? prev - 1 : null));
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutTime]);

  const handleCreate = () => {
    const { allPassed } = validatePasscodeComplexity(passcode);
    if (!allPassed) {
      setError("PASSWORD_REJECTED: Complexity requirements not met.");
      return;
    }
    setStep('confirm');
    setError(null);
  };

  const handleConfirm = async () => {
    if (passcode !== confirmPasscode) {
      setError("MISMATCH: Passcodes do not match.");
      return;
    }
    setLoading(true);
    try {
      const hash = await hashPasscode(passcode, user.uid);
      savePasscodeHash(user.uid, hash);
      unlockSession();
      setLocked(false);
      setOnboarding(false);
    } catch (e) {
      setError("VAULT_ERROR: Failed to secure your credentials.");
    } finally {
      setLoading(false);
    }
  };

  const handleUnlock = async () => {
    if (lockoutTime !== null) return;
    setLoading(true);
    try {
      const sanitizedPasscode = passcode;
      const savedHash = getSavedHash(user.uid);
      const inputHash = await hashPasscode(sanitizedPasscode, user.uid);
      
      if (savedHash === inputHash) {
        unlockSession();
        setLocked(false);
        setAttempts(0);
        setPasscode('');
      } else {
        const nextAttempts = attempts + 1;
        setAttempts(nextAttempts);
        if (nextAttempts >= 3) {
          setLockoutTime(30);
          setError("SECURITY_LOCK: Too many failed attempts. Locking for 30s.");
        } else {
          setError(`ACCESS_DENIED: Attempt ${nextAttempts}/3 failed.`);
        }
        setPasscode('');
      }
    } catch (e) {
      setError("VERIFICATION_FAILURE.");
    } finally {
      setLoading(false);
    }
  };

  const requirements = validatePasscodeComplexity(passcode).requirements;

  if (!user) return <>{children}</>;

  if (locked) {
    return (
      <div className="fixed inset-0 z-[9999] bg-bg-main flex items-center justify-center font-mono overflow-y-auto p-4">
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(#00FF00 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
        </div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md glass-panel p-8 rounded-2xl shadow-2xl relative overflow-hidden"
        >
          {/* Biometric Overlay */}
          <AnimatePresence>
            {showBiometric && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-50 bg-bg-surface flex flex-col items-center justify-center p-8 text-center"
              >
                <div className="relative mb-6">
                  <Fingerprint className={`w-20 h-20 ${biometricStatus === 'scanning' ? 'text-accent-primary animate-pulse' : 'text-red-500'}`} />
                  {biometricStatus === 'scanning' && (
                    <motion.div 
                      initial={{ top: '0%' }}
                      animate={{ top: '100%' }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      className="absolute left-0 right-0 h-0.5 bg-accent-primary shadow-[0_0_10px_#00FF00]"
                    />
                  )}
                </div>
                <h3 className="text-sm font-black uppercase tracking-[0.3em] mb-2">
                  {biometricStatus === 'scanning' ? 'AUTHENTICATING_BIOMETRICS' : 'BIOMETRIC_FAILED'}
                </h3>
                <p className="text-[10px] text-text-dim uppercase tracking-widest">
                  {biometricStatus === 'scanning' ? 'Scanning fingerprint/retina...' : 'Hardware sensor rejected signature.'}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Header */}
          <div className="flex flex-col items-center mb-8 text-center">
            <div className="p-4 bg-accent-primary/10 rounded-full mb-4 relative">
              <Lock className="w-10 h-10 text-accent-primary" />
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 border border-dashed border-accent-primary/30 rounded-full"
              />
            </div>
            <h2 className="text-xl font-bold tracking-[0.2em] text-accent-primary uppercase">
              {step === 'create' ? 'Define_Passcode' : step === 'confirm' ? 'Confirm_Identity' : 'Identity_Verification'}
            </h2>
            <p className="text-[10px] text-text-dim mt-2 uppercase tracking-widest">
              {step === 'create' ? 'Set your 12-char secure access token' : 'Re-enter your token for verification'}
            </p>
          </div>

          {/* Error Message */}
          <AnimatePresence>
            {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded text-[9px] text-red-500 font-bold flex items-center gap-2 uppercase tracking-wider"
              >
                <AlertTriangle className="w-3 h-3" />
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Form */}
          <div className="space-y-6">
            <div className="relative">
              <input 
                type={showPassword ? "text" : "password"}
                value={step === 'confirm' ? confirmPasscode : passcode}
                onChange={(e) => {
                  setError(null);
                  if (step === 'confirm') setConfirmPasscode(e.target.value);
                  else setPasscode(e.target.value);
                }}
                disabled={lockoutTime !== null || loading}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        if (step === 'create') handleCreate();
                        else if (step === 'confirm') handleConfirm();
                        else handleUnlock();
                    }
                }}
                placeholder={step === 'confirm' ? "CONFIRM_PASSCODE" : step === 'create' ? "SET_12_CHARACTER_PASS" : "ENTER_SECURE_TOKEN"}
                className="w-full bg-bg-main border border-border-main p-4 rounded-lg text-center font-bold tracking-[0.5em] text-accent-primary placeholder:text-text-dim/30 placeholder:tracking-widest focus:border-accent-primary/50 outline-none transition-all text-xl"
                autoFocus
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-12 top-1/2 -translate-y-1/2 text-text-dim/40 hover:text-accent-primary transition-colors"
                title="Toggle passcode visibility"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <Keyboard className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim/40" />
            </div>

            {/* Lockout Timer */}
            {lockoutTime !== null && (
              <div className="flex flex-col items-center gap-2 text-center py-4 bg-red-500/5 rounded-lg border border-red-500/10">
                <Clock className="w-5 h-5 text-red-500 animate-pulse" />
                <p className="text-xs font-bold text-red-500">SYSTEM_LOCKED</p>
                <p className="text-[10px] text-red-400 font-mono">RETRY_AVAILABLE_IN: {lockoutTime}S</p>
              </div>
            )}

            {/* Complexity Requirements (Step: Create) */}
            {step === 'create' && (
              <div className="grid grid-cols-2 gap-3 pb-4">
                <Requirement check={requirements.length} label="12+ CHARS" />
                <Requirement check={requirements.digits} label="5+ DIGITS" />
                <Requirement check={requirements.uppercase} label="1+ UPPER" />
                <Requirement check={requirements.lowercase} label="5+ LOWER" />
                <Requirement check={requirements.symbol} label="1+ SYMBOL (@#$%^&+=)" />
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-3">
              <button
                onClick={step === 'create' ? handleCreate : step === 'confirm' ? handleConfirm : handleUnlock}
                disabled={loading || lockoutTime !== null}
                className="w-full bg-accent-primary text-bg-main py-4 rounded-lg font-black text-xs uppercase tracking-[0.2em] hover:bg-emerald-500 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                    <Clock className="w-4 h-4 animate-spin" />
                ) : (
                    <>
                        {step === 'create' ? 'INITIALIZE_VAULT' : step === 'confirm' ? 'VERIFY_HASH' : 'AUTHORIZE_SESSION'}
                        <ShieldCheck className="w-4 h-4" />
                    </>
                )}
              </button>

              {(step === 'confirm' || step === 'create') && (
                  <button 
                    onClick={() => {
                        setStep('create');
                        setPasscode('');
                        setConfirmPasscode('');
                        setError(null);
                    }}
                    className="text-[9px] text-text-dim hover:text-text-main transition-colors uppercase tracking-widest text-center"
                  >
                        Reset_Entry_Parameters
                  </button>
              )}

              {step === 'unlock' && (
                <div className="mt-4 flex flex-col items-center">
                   <button 
                    onClick={() => {
                      if (window.confirm("CRITICAL_ACTION: This will wipe your secure vault local configuration. You will need to set a new 12-character passcode immediately and may lose access to previously stored session data. Proceed?")) {
                        resetPasscode(user.uid);
                        checkStatus();
                      }
                    }}
                    className="text-[8px] text-red-500/50 hover:text-red-500 transition-colors uppercase tracking-[0.2em] font-bold"
                  >
                        Forgot_Passcode?_Hard_Reset_Vault
                  </button>
                </div>
              )}
            </div>
          </div>
          
          {/* Biometric Fallback Suggestion */}
          {step === 'unlock' && (
            <div className="mt-8 flex flex-col items-center gap-2 border-t border-border-main/50 pt-6 opacity-60">
              <Fingerprint className="w-8 h-8 text-text-dim" />
              <p className="text-[8px] text-text-dim uppercase tracking-widest text-center">
                HEURISTIC_AUTH_SENSORS_AVAILABLE<br/>
                <span className="text-[7px] italic opacity-50">(Web_Environment_Emulation)</span>
              </p>
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <>
      <AnimatePresence>
        {!isAppVisible && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] bg-bg-main flex items-center justify-center overflow-hidden"
          >
            {/* Splash Circuitry */}
            <div className="absolute inset-0 opacity-20">
                <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(#00FF00 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
                <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200%] h-[200%] border border-accent-primary/10 rounded-full border-dashed"
                />
            </div>
            
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex flex-col items-center gap-6 relative z-10"
            >
              <div className="relative">
                <ShieldAlert className="w-24 h-24 text-accent-primary animate-pulse" />
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 1, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="absolute inset-0 scale-150 bg-accent-primary/5 rounded-full blur-2xl"
                />
              </div>
              <div className="text-center">
                <h1 className="text-2xl font-black tracking-[1em] text-accent-primary uppercase mb-2">ST_VAULT_ACTIVE</h1>
                <p className="text-[10px] text-text-dim uppercase tracking-[0.5em] font-mono">App Hidden | Session Locked</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {children}
    </>
  );
}

function Requirement({ check, label }: { check: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border transition-all duration-300 ${check ? 'bg-accent-primary/10 border-accent-primary/50 shadow-[0_0_10px_rgba(0,255,157,0.1)]' : 'bg-bg-main border-border-main/50'}`}>
      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors duration-300 ${check ? 'bg-accent-primary border-accent-primary' : 'bg-transparent border-text-dim/30'}`}>
        {check && <CheckCircle2 className="w-4 h-4 text-bg-main" />}
      </div>
      <span className={`text-[9px] font-black uppercase tracking-widest ${check ? 'text-accent-primary' : 'text-text-dim'}`}>
        [ {check ? 'OK' : '..'} ] {label}
      </span>
    </div>
  );
}
