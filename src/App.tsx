/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldAlert, 
  Binary, 
  Search, 
  BookOpen, 
  MessageSquare, 
  Image as ImageIcon,
  ChevronRight,
  Terminal,
  Activity,
  Globe,
  LogOut,
  User as UserIcon,
  ShieldCheck,
  Sun,
  Moon,
  Lock,
  Cpu
} from 'lucide-react';
import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { auth } from './lib/firebase';
import Workbench from './components/Workbench';
import Forensics from './components/Forensics';
import Domains from './components/Domains';
import ResearchHub from './components/ResearchHub';
import AIChat from './components/AIChat';
import SecureComm from './components/SecureComm';
import SecurityLayer from './components/SecurityLayer';

type Tab = 'workbench' | 'forensics' | 'domains' | 'research' | 'chat' | 'comm';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('research');
  const [systemReady, setSystemReady] = useState(false);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [isBlurred, setIsBlurred] = useState(false);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsBlurred(document.hidden);
    };
    const handleBlur = () => setIsBlurred(true);
    const handleFocus = () => setIsBlurred(false);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
  }, [theme]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const handleSwitchTab = (e: any) => {
      setActiveTab(e.detail);
    };
    window.addEventListener('switch-tab', handleSwitchTab);
    return () => window.removeEventListener('switch-tab', handleSwitchTab);
  }, []);

  useEffect(() => {
    // Artificial "System Initialization" delay for aesthetic
    const timer = setTimeout(() => setSystemReady(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  const navItems = [
    { id: 'research', label: 'RESEARCH HUB', icon: BookOpen, title: 'Explore steganography fundamentals and theoretical research.' },
    { id: 'workbench', label: 'WORKBENCH', icon: Binary, title: 'Encode and decode hidden data using advanced algorithms.' },
    { id: 'forensics', label: 'FORENSICS', icon: Search, title: 'Perform forensic analysis on carrier signals to detect anomalies.' },
    { id: 'domains', label: 'DOMAINS', icon: Activity, title: 'Visualize and cross-reference domain-specific steganographic artifacts.' },
    { id: 'comm', label: 'SECURE COMM', icon: Globe, title: 'Exchange encrypted, self-destructing message packages in real-time.' },
    { id: 'chat', label: 'AI EXPERT', icon: MessageSquare, title: 'Consult with the Neural Intelligence Core for expert analysis.' },
  ] as const;

  if (!systemReady) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center font-mono">
        <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
          <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(#00FF00 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
        </div>
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center relative z-10"
        >
          <div className="relative mb-8">
            <Cpu className="w-16 h-16 text-accent-primary animate-pulse" />
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
              className="absolute -inset-2 border-2 border-dashed border-accent-primary/30 rounded-full"
            />
          </div>
          
          <div className="flex flex-col items-center gap-4">
            <div className="text-xl font-bold tracking-[0.3em] text-accent-primary uppercase flex items-center gap-3">
              <span className="w-2 h-2 bg-accent-primary rounded-full animate-ping" />
              Initializing_Environment
            </div>
            
            <div className="w-80 h-1 bg-white/5 overflow-hidden rounded-full border border-white/10">
              <motion.div 
                initial={{ x: '-100%' }}
                animate={{ x: '100%' }}
                transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                className="w-full h-full bg-gradient-to-r from-transparent via-accent-primary to-transparent"
              />
            </div>

            <div className="flex gap-8 mt-4 text-[10px] text-accent-primary/60 font-bold tracking-widest uppercase">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-accent-primary" />
                Auth_Ready
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-accent-primary" />
                Secure_Sync
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-accent-primary" />
                Neural_Link
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-bg-main text-text-main font-mono selection:bg-accent-primary selection:text-bg-main transition-colors duration-300 relative ${isBlurred ? 'blur-[50px] pointer-events-none' : ''}`}>
      {/* Decorative Background for Glassmorphism */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-[0.03] dark:opacity-[0.02]">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-accent-primary blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-accent-primary blur-[100px]" />
      </div>

      <SecurityLayer user={user}>
        {/* Header */}
      <header className="border-b border-border-main bg-bg-surface backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3" title="STEGANO_LABS: The ultimate digital forensics and covert communication environment">
          <div className="p-2 bg-bg-main rounded border border-border-main shadow-sm">
            <ShieldAlert className="w-6 h-6 text-accent-primary" />
          </div>
          <div>
            <h1 className="text-accent-primary font-bold tracking-tighter text-lg leading-none">STEGANO_LABS</h1>
            <p className="text-text-dim text-[10px] tracking-widest uppercase">Digital Forensics Framework</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="hidden md:flex gap-4 items-center">
            <div className="flex items-center gap-2 text-[10px] text-text-dim uppercase">
              <div className="w-2 h-2 rounded-full bg-accent-primary animate-pulse" />
              Secure_Link_Active
            </div>
            <div className="h-4 w-px bg-border-main" />
            <div className="text-[10px] text-text-dim uppercase">
              {new Date().toLocaleDateString()}
            </div>
          </div>

          <button 
            onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            className="p-2 rounded-lg border border-border-main bg-bg-main text-text-dim hover:text-accent-primary transition-all flex items-center gap-2 group"
            title={theme === 'dark' ? 'Enable Light Mode' : 'Enable Dark Mode'}
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 transition-transform group-hover:rotate-12" />
            ) : (
              <Moon className="w-4 h-4 transition-transform group-hover:-rotate-12" />
            )}
            <span className="text-[9px] font-bold tracking-widest hidden sm:inline uppercase">
              {theme === 'dark' ? 'Light_Mode' : 'Dark_Mode'}
            </span>
          </button>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row min-h-[calc(100vh-65px)]">
        {/* Sidebar Nav */}
        <nav className="w-full lg:w-64 lg:border-r border-border-main bg-bg-surface backdrop-blur-sm p-4 flex flex-row lg:flex-col gap-2 overflow-x-auto custom-scrollbar">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              title={item.title}
              className={`flex items-center gap-3 px-4 py-3 rounded text-xs transition-all duration-200 group relative whitespace-nowrap lg:w-full border ${
                activeTab === item.id 
                  ? 'bg-bg-main text-accent-primary border-border-main' 
                  : 'text-text-dim hover:text-text-main hover:bg-bg-main/50 border-transparent'
              }`}
            >
              <item.icon className={`w-4 h-4 ${activeTab === item.id ? 'text-accent-primary' : 'text-text-dim/60 group-hover:text-text-dim'}`} />
              <span className="tracking-widest font-bold">{item.label}</span>
              {activeTab === item.id && (
                <motion.div 
                  layoutId="active-pill"
                  className="absolute right-2 w-1 h-4 bg-accent-primary rounded-full hidden lg:block shadow-[0_0_8px_rgba(0,255,0,0.4)]"
                />
              )}
            </button>
          ))}
          
          {/* Patch Notes Section */}
          <div className="mt-8 mb-8 hidden lg:block overflow-hidden">
            <h3 className="text-[10px] font-bold text-text-dim uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
              <Activity className="w-3 h-3 text-accent-primary" /> Latest_Patches
            </h3>
            <div className="space-y-3">
              <UpdateItem text="Identity Integration: My Profile added to sidebar footer." />
              <UpdateItem text="Auto-Avatar: Unique Bottts icons for all operators." />
              <UpdateItem text="Operator Badge: Visual status indicators active." />
              <UpdateItem text="Session Control: Quick logout access implemented." />
            </div>
          </div>

          <div className="mt-auto hidden lg:block p-4 border border-border-main rounded bg-bg-main/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] text-text-dim/60 uppercase font-bold">System Stats</span>
              <Activity className="w-3 h-3 text-accent-primary" />
            </div>
            <div className="space-y-2">
              <StatBar label="CPU" progress={45} />
              <StatBar label="MEM" progress={72} />
              <StatBar label="NET" progress={12} />
            </div>
          </div>

          {/* User Profile Section */}
          <div className="mt-4 border-t border-border-main pt-4 hidden lg:block">
            {user ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-2 rounded bg-bg-main border border-border-main">
                  <div className="relative">
                    <div className="w-10 h-10 rounded bg-accent-primary/10 border border-accent-primary/30 overflow-hidden">
                      <img 
                        src={`https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}`} 
                        alt="Operator"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-accent-primary border-2 border-bg-surface rounded-full" />
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <p className="text-[10px] font-bold text-text-main truncate uppercase tracking-widest">{user.displayName || 'Operator_Proxied'}</p>
                    <div className="flex items-center gap-1">
                      <ShieldCheck className="w-2.5 h-2.5 text-accent-primary" />
                      <span className="text-[8px] text-text-dim font-mono uppercase">Auth_Verified</span>
                    </div>
                  </div>
                </div>
                
                <button 
                  onClick={() => signOut(auth)}
                  title="Securely terminate the current session and wipe local cache."
                  className="w-full flex items-center justify-between px-3 py-2 rounded text-[10px] text-text-dim hover:text-red-500 hover:bg-red-500/5 transition-colors group border border-transparent hover:border-red-500/20"
                >
                  <span className="font-bold tracking-widest uppercase">Terminate_Session</span>
                  <LogOut className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-2 rounded bg-bg-main border border-border-main opacity-50">
                <div className="w-10 h-10 rounded bg-bg-surface flex items-center justify-center">
                  <UserIcon className="w-5 h-5 text-text-dim" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-text-dim uppercase tracking-widest">Offline</p>
                  <p className="text-[8px] text-text-dim/60 font-mono">UNAUTHORIZED</p>
                </div>
              </div>
            )}
          </div>
        </nav>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-6 md:p-10 relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="max-w-6xl mx-auto"
            >
              {activeTab === 'research' && <ResearchHub onGoToWorkbench={() => setActiveTab('workbench')} />}
              {activeTab === 'workbench' && <Workbench user={user} />}
              {activeTab === 'forensics' && <Forensics user={user} />}
              {activeTab === 'domains' && <Domains />}
              {activeTab === 'comm' && <SecureComm user={user} />}
              {activeTab === 'chat' && <AIChat />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      </SecurityLayer>

      {/* Footer */}
      <footer className="border-t border-border-main bg-bg-surface px-6 py-2 flex items-center justify-between text-[9px] text-text-dim">
        <div className="uppercase tracking-widest">© 2026 Stegano_Labs | Classified Research Data</div>
        <div className="flex gap-4 font-mono">
          <span title="The time delay for a data packet to travel to the server and back.">LATENCY: 14MS</span>
          <span title="The percentage of data packets that fail to reach their destination.">PKT_LOSS: 0%</span>
          <span className="text-accent-primary font-bold" title="Overall health status of the digital forensics environment.">STATUS_NOMINAL</span>
        </div>
      </footer>
    </div>
  );
}

function StatBar({ label, progress }: { label: string, progress: number }) {
  const titles: Record<string, string> = {
    'CPU': 'Current central processing unit utilization.',
    'MEM': 'Available system memory and buffer cache usage.',
    'NET': 'Real-time network throughput and packet exchange rate.'
  };
  return (
    <div className="space-y-1" title={titles[label] || `Status of ${label}`}>
      <div className="flex justify-between text-[8px] uppercase tracking-tighter text-text-dim">
        <span>{label}</span>
        <span>{progress}%</span>
      </div>
      <div className="w-full h-0.5 bg-border-main rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          className="h-full bg-accent-primary" 
        />
      </div>
    </div>
  );
}

function UpdateItem({ text }: { text: string }) {
  return (
    <div className="flex gap-2 group">
      <div className="w-1 h-1 rounded-full bg-accent-primary/40 mt-1.5 shrink-0 group-hover:bg-accent-primary" />
      <p className="text-[9px] text-text-dim leading-tight group-hover:text-text-main transition-colors uppercase font-mono">
        {text}
      </p>
    </div>
  );
}
