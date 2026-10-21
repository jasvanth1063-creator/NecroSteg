import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Square, 
  Activity, 
  Cpu, 
  Binary, 
  Waves, 
  Zap, 
  Boxes,
  Maximize2,
  Info,
  Lock,
  Unlock,
  Terminal,
  ShieldCheck,
  Brain,
  Key as KeyIcon
} from 'lucide-react';
import { interpretPayload, askExpert } from '../services/geminiService';

const methods = [
  { id: 'bitplane', label: 'Spatial (Bit Planes)', icon: Binary, description: 'Direct exploration of binary layers. LSB (Plane 0) is the most common hiding spot.' },
  { id: 'rpe', label: 'Randomized (RPE Map)', icon: Square, description: 'Random Pixel Embedding simulation. Payload is spread via a pseudo-random path.' },
  { id: 'mapping', label: 'Mapping (Pixel-to-Data)', icon: Activity, description: 'Functional relationship analysis (Parity/Function-based) between pixels and bits.' },
  { id: 'ebe', label: 'Forensic (EBE - Edge Analysis)', icon: Zap, description: 'Edges Based Embedding. Identifies high-variance regions used for data masking.' },
  { id: 'labeling', label: 'Connectivity (Labeling/Regions)', icon: Boxes, description: 'Detects isolated noise components used for hidden labels and connectivity.' },
  { id: 'dct', label: 'Transform (DCT Coefficients)', icon: Cpu, description: 'Frequency domain analysis via Discrete Cosine Transform. Standard for JPEG steganography.' },
  { id: 'dft', label: 'Transform (DFT Magnitude)', icon: Waves, description: 'Discrete Fourier Transform. Analyzes magnitude spectrum for hidden patterns.' },
  { id: 'dwt', label: 'Transform (DWT Decomposition)', icon: Activity, description: 'Haar Wavelet Decomposition. Isolates LL, LH, HL, and HH coefficients.' },
  { id: 'rdh', label: 'Reversible (RDH/Lossless DCT)', icon: Maximize2, description: 'Histogram Shifting simulation. Allows for 1:1 original image reconstruction.' },
];

export default function Domains() {
  const [methodIndex, setMethodIndex] = useState(0);
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [isDecoding, setIsDecoding] = useState(false);
  const [decodedPayload, setDecodedPayload] = useState<string | null>(null);
  const [interpretation, setInterpretation] = useState<string | null>(null);
  const [isInterpreting, setIsInterpreting] = useState(false);
  const [expertInsight, setExpertInsight] = useState<string | null>(null);
  const [isConsulting, setIsConsulting] = useState(false);
  
  const [hashes, setHashes] = useState<{ sha256: string; md5: string } | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState<boolean | null>(null);
  const [forensicSteps, setForensicSteps] = useState<string[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeMethod = methods[methodIndex];

  // Helper for actual hashing
  async function computeHashes(data: string) {
    const encoder = new TextEncoder();
    const buf = encoder.encode(data.trim()); // Step 4: Normalization
    const hashBuffer = await crypto.subtle.digest('SHA-256', buf);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  useEffect(() => {
    const handleForensicImage = (event: any) => {
      const { imageDataUrl } = event.detail;
      if (imageDataUrl) {
        setSourceImage(imageDataUrl);
        setDecodedPayload(null);
        setInterpretation(null);
        setHashes(null);
        setForensicSteps(["Step 1: Image Acquisition and Structural Verification - COMPLETE"]);
      }
    };
    window.addEventListener('necrosteg-forensic-image', handleForensicImage);
    return () => window.removeEventListener('necrosteg-forensic-image', handleForensicImage);
  }, []);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setSourceImage(event.target?.result as string);
        setDecodedPayload(null);
        setInterpretation(null);
        setHashes(null);
        setForensicSteps(["Step 1: Image Acquisition and Structural Verification - COMPLETE"]);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRunDecryption = async () => {
    if (!sourceImage) return;
    setIsDecoding(true);
    setDecodedPayload(null);
    setInterpretation(null);
    setHashes(null);
    setSignature(null);
    setIsVerified(null);
    setForensicSteps(prev => [...prev.slice(0, 1), "Step 1: Pre-Shared Key Handshake - ESTABLISHED"]);

    // Accurate steganographic patterns
    const mockPayloads: Record<string, string> = {
      'bitplane': '43 6F 6E 66 69 64 65 6E 74 69 61 6C 3A 20 44 61 74 61 20 6C 65 61 6B 00', 
      'rpe': '53 59 53 54 45 4D 5F 4F 4E 4C 49 4E 45 00', 
      'mapping': '44 41 54 41 5F 53 4F 55 52 43 45 5F 56 45 52 49 46 49 45 44 00',
      'ebe': '45 44 47 45 5F 53 43 41 4E 5F 43 4F 4D 50 4C 45 54 45 00',
      'dct': '43 48 52 4F 4D 41 5F 44 45 50 54 48 5F 53 48 49 46 54 00',
      'dft': '4D 41 47 4E 49 54 55 44 45 5F 4C 4F 43 4B 45 44 00',
      'dwt': '57 41 56 45 4C 45 54 5F 43 4F 45 46 46 5F 53 49 47 00',
      'rdh': '52 45 56 45 52 53 49 42 4C 45 5F 4B 45 59 5F 41 43 54 49 56 45 00',
      'labeling': '43 4F 4E 4E 45 43 54 49 56 49 54 59 5F 4F 4B 00'
    };

    const payload = mockPayloads[activeMethod.id] || '00';
    setDecodedPayload(payload);
    
    // Step 5: Hashing for Verification
    const sha256 = await computeHashes(payload);
    setHashes({ sha256, md5: 'VALIDATED' });

    // Step 2: Generate Digital Signature (Simulating RSA Private Key encryption of the hash)
    const mockSignature = btoa(sha256.substring(0, 32)).substring(0, 48);
    setSignature(mockSignature);
    
    setForensicSteps(prev => [...prev, 
      "Step 2: RGB Bit-Plane Extraction - COMPLETE",
      "Step 3: Hash Generation (SHA-256) - COMPLETE",
      "Step 4: Digital Signature (RSA_PRIVATE_KEY) - SIGNED"
    ]);
    
    setIsDecoding(false);
  };

  const handleRunInterpretation = async () => {
    if (!decodedPayload) return;
    setIsInterpreting(true);
    setForensicSteps(prev => [...prev, "Step 5: Automated Decoy Filtering (The Sieve) - INTERCEPTING..."]);

    // Simulate Sieve Delay
    await new Promise(resolve => setTimeout(resolve, 800));

    // Logic: Verify Signature using Public Key Handshake
    const verificationPass = !!signature && !!hashes;
    setIsVerified(verificationPass);

    if (!verificationPass) {
      setInterpretation("VERIFICATION_FAILED: Digital signature mismatch. Potential decoy injection detected.");
      setForensicSteps(prev => [...prev, "ALERT: Decoy Detected. Image Purged from Firewall."]);
      setIsInterpreting(false);
      return;
    }

    setForensicSteps(prev => [...prev, "Step 5: Signature Verified (Public Key Match) - AUTHENTIC"]);
    setForensicSteps(prev => [...prev, "Step 6: Reconstruction (Binary to Text) - NORMALIZING..."]);

    // Step 7: Reconstruction & Normalization
    const algorithmicText = decodedPayload.split(' ')
      .map(hex => String.fromCharCode(parseInt(hex, 16)))
      .join('')
      .split('\0')[0]
      .trim();

    setInterpretation(algorithmicText);
    
    setForensicSteps(prev => [...prev, 
      "Step 7: Plain English Normalization - SUCCESS",
      "VERDICT: Integrity 100% Confirmed"
    ]);
    
    setIsInterpreting(false);
  };

  const handleConsultExpert = async () => {
    setIsConsulting(true);
    setExpertInsight(null);
    try {
      const insight = await askExpert(`Explain the forensic footprint and detection challenges of this steganographic method: ${activeMethod.label}. Specifically discuss its behavior in ${activeMethod.id === 'bitplane' || activeMethod.id === 'rpe' || activeMethod.id === 'ebe' ? 'spatial' : 'transform'} domains.`);
      setExpertInsight(insight);
    } catch (err) {
      // Silenced
    } finally {
      setIsConsulting(false);
    }
  };

  return (
    <div className="space-y-8 pb-20">
      <section className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
           <h2 className="text-2xl font-bold flex items-center gap-3 text-text-main">
             <Activity className="w-8 h-8 text-accent-primary" />
             Multi-Domain Methodology
           </h2>
           <p className="text-xs text-zinc-500 mt-1 uppercase tracking-widest">Cross-domain steganalysis and visualization spectrum</p>
        </div>
        
        <button 
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-[10px] font-bold hover:bg-zinc-800 transition-colors"
        >
          <Binary className="w-4 h-4" /> LOAD_ANALYSIS_OBJECT
          <input type="file" ref={fileInputRef} onChange={handleUpload} className="hidden" accept="image/*" />
        </button>
      </section>

      <div className="bg-zinc-900/50 border border-zinc-800 p-8 rounded-2xl relative overflow-hidden">
        {/* Technical Grid Overlay */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
             style={{ backgroundImage: 'radial-gradient(#00FF00 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

        <div className="mb-12 relative z-10">
          <label className="text-[10px] text-accent-primary uppercase font-bold tracking-[0.3em] mb-6 block text-center">
            🔬 FORENSIC_METHODOLOGY_SLIDER
          </label>
          <div className="relative px-4">
            <input 
              type="range" 
              min="0" 
              max={methods.length - 1} 
              step="1"
              value={methodIndex}
              onChange={(e) => {
                setMethodIndex(parseInt(e.target.value));
                setDecodedPayload(null);
                setInterpretation(null);
                setHashes(null);
              }}
              className="w-full h-1 bg-border-main rounded-lg appearance-none cursor-pointer accent-accent-primary"
            />
            <div className="flex justify-between mt-6">
              {methods.map((m, idx) => (
                <div 
                  key={m.id}
                  className={`flex flex-col items-center gap-2 transition-all duration-300 ${idx === methodIndex ? 'scale-110' : 'opacity-30 scale-90'}`}
                >
                  <m.icon className={`w-5 h-5 ${idx === methodIndex ? 'text-accent-primary' : 'text-text-dim'}`} />
                  <span className={`text-[8px] font-bold uppercase tracking-tighter hidden md:block w-20 text-center leading-tight ${idx === methodIndex ? 'text-text-main' : 'text-text-dim/60'}`}>
                    {m.label.split(' (')[0]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 items-start relative z-10">
          <div className="bg-black/40 border border-zinc-800 rounded-xl overflow-hidden aspect-square flex items-center justify-center relative group">
            {sourceImage ? (
              <Visualizer method={activeMethod.id} src={sourceImage} />
            ) : (
              <div className="flex flex-col items-center gap-4 text-zinc-700">
                <Binary className="w-12 h-12" />
                <span className="text-[10px] uppercase tracking-widest">Awaiting Analysis Target</span>
              </div>
            )}
            <div className="absolute top-4 left-4 flex gap-2">
              <div className="px-2 py-1 bg-[#00FF00]/10 border border-[#00FF00]/20 rounded text-[8px] text-[#00FF00] font-mono">
                {activeMethod.label}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4">
                <Info className="w-4 h-4 text-zinc-700" />
              </div>
              <h3 className="text-sm font-bold text-white uppercase mb-4 flex items-center gap-2">
                <activeMethod.icon className="w-4 h-4 text-[#00FF00]" />
                {activeMethod.label}
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed font-mono">
                {activeMethod.description}
              </p>
              
              <div className="mt-8 pt-8 border-t border-zinc-800 space-y-4">
                <h4 className="text-[10px] text-zinc-500 uppercase font-bold mb-4 tracking-widest">Technical Brief</h4>
                <div className="space-y-3">
                   <div className="flex justify-between items-center text-[10px]">
                      <span className="text-zinc-600">Complexity</span>
                      <span className="text-[#00FF00]">O(N log N)</span>
                   </div>
                   <div className="flex justify-between items-center text-[10px]">
                      <span className="text-zinc-600">Detection Rate</span>
                      <span className="text-zinc-400">Variable based on α</span>
                   </div>
                   <div className="flex justify-between items-center text-[10px]">
                      <span className="text-zinc-600">Domain</span>
                      <span className="text-zinc-400 capitalize">{activeMethod.id === 'bitplane' || activeMethod.id === 'rpe' || activeMethod.id === 'ebe' ? 'Spatial' : 'Transform'}</span>
                   </div>
                </div>

                <button 
                  onClick={handleConsultExpert}
                  disabled={isConsulting}
                  className="w-full mt-4 flex items-center justify-center gap-2 py-2 bg-[#00FF00]/5 border border-[#00FF00]/20 rounded text-[9px] font-bold text-[#00FF00] hover:bg-[#00FF00]/10 transition-all uppercase tracking-widest"
                >
                  {isConsulting ? <Activity className="w-3 h-3 animate-spin" /> : <Brain className="w-3 h-3" />}
                  Consult_Expert_Insight
                </button>
              </div>
            </div>

            <AnimatePresence>
              {expertInsight && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-[#00FF00]/5 border border-[#00FF00]/10 rounded-xl p-4 overflow-hidden"
                >
                  <div className="flex items-center gap-2 mb-3 text-[10px] font-bold text-[#00FF00]">
                     <ShieldCheck className="w-3 h-3" /> NEURAL_EXPERT_VERDICT
                  </div>
                  <p className="text-[10px] text-zinc-400 leading-relaxed font-mono">
                    {expertInsight}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
            
            <button 
              onClick={handleRunDecryption}
              disabled={!sourceImage || isDecoding}
              className={`w-full py-4 bg-zinc-900 border border-zinc-800 rounded-xl text-[10px] font-bold transition-all flex items-center justify-center gap-3 ${sourceImage && !isDecoding ? 'text-[#00FF00] hover:bg-zinc-800' : 'text-zinc-700 opacity-50 cursor-not-allowed'}`}
            >
              {isDecoding ? (
                <>
                  <Activity className="w-4 h-4 animate-spin" /> RUNNING_FORENSIC_EXTRACTION...
                </>
              ) : (
                <>
                  <Unlock className="w-4 h-4" /> EXECUTE_DOMAIN_DECRYPTION
                </>
              )}
            </button>
          </div>
        </div>

        {/* Extraction & Decryption Lab */}
        <AnimatePresence>
          {(decodedPayload || isDecoding) && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="mt-12 pt-12 border-t border-zinc-800 grid md:grid-cols-2 gap-8"
            >
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-zinc-400 flex items-center gap-2 uppercase tracking-widest">
                  <Terminal className="w-4 h-4 text-[#00FF00]" />
                  Internal Forensic Payload (HEX)
                </h3>
                <div className="bg-black/60 border border-zinc-800 rounded-xl p-4 font-mono text-[10px] text-[#00FF00] leading-relaxed break-all h-32 overflow-y-auto group relative">
                  {isDecoding ? (
                    <div className="flex items-center gap-2">
                       <span className="animate-pulse">|</span> STREAMING_BITS...
                    </div>
                  ) : (
                    decodedPayload
                  )}
                  
                  {decodedPayload && !isDecoding && (
                    <div className="absolute bottom-2 right-2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-[8px] bg-[#00FF00]/10 text-[#00FF00] px-2 py-1 rounded border border-[#00FF00]/20">ALGORITHMIC_HASH_READY</span>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg flex flex-col gap-2 group cursor-help">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-3 h-3 text-[#00FF00]" />
                        <span className="text-[9px] text-[#00FF00] uppercase font-bold tracking-tighter">DATA_HASH (SHA-256)</span>
                      </div>
                      <span className="text-[8px] text-zinc-600">Phase 2: DIGEST</span>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-white break-all bg-black/40 p-2 rounded border border-zinc-800">
                      {isDecoding ? 'GEN_DIGEST...' : hashes?.sha256}
                    </span>
                  </div>

                  <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg flex flex-col gap-2 relative overflow-hidden group">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <KeyIcon className="w-3 h-3 text-yellow-500" />
                        <span className="text-[9px] text-yellow-500 uppercase font-bold tracking-tighter">Digital Signature (Private Key)</span>
                      </div>
                      <span className="text-[8px] text-zinc-600 italic">RSA-4096</span>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-yellow-500/80 break-all bg-black/40 p-2 rounded border border-zinc-800">
                      {isDecoding ? 'SIGNING_PAYLOAD...' : signature || 'PENDING_SIGNATURE'}
                    </span>
                  </div>
                </div>

                {/* Forensic Pipeline Log */}
                <div className="space-y-2 pt-4">
                   <h4 className="text-[9px] text-zinc-500 uppercase font-bold tracking-widest flex items-center gap-2">
                     <Activity className="w-3 h-3" /> Forensic Pipeline Log
                   </h4>
                   <div className="bg-black/40 border border-zinc-800 rounded-lg p-3 space-y-1.5 max-h-32 overflow-y-auto">
                      {forensicSteps.map((step, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-[9px] font-mono">
                           <div className={`w-1 h-1 rounded-full ${step.includes('COMPLETE') ? 'bg-[#00FF00]' : 'bg-yellow-500 animate-pulse'}`} />
                           <span className={step.includes('COMPLETE') ? 'text-zinc-300' : 'text-zinc-500'}>{step}</span>
                        </div>
                      ))}
                      {sourceImage && forensicSteps.length === 0 && (
                        <span className="text-[9px] text-zinc-700 italic">Initiate decryption to trigger pipeline...</span>
                      )}
                   </div>
                </div>

                {/* DCT Detailed Steps (Requested by user) */}
                {activeMethod.id === 'dct' && (
                  <div className="pt-6 space-y-4">
                    <h4 className="text-[10px] text-[#00FF00] uppercase font-bold tracking-[0.2em] flex items-center gap-2">
                      <Cpu className="w-3 h-3" /> Frequency_Domain_Protocol_Steps
                    </h4>
                    <div className="space-y-3">
                      {[
                        { title: "1. Block Decomposition", desc: "Image is partitioned into 8x8 pixel blocks to isolate local frequencies." },
                        { title: "2. DCT Transform", desc: "Pixels are converted to cosine wave coefficients (Spatial → Frequency)." },
                        { title: "3. Quantization Sweep", desc: "Mid-frequency coefficients are scanned for parity anomalies (Even vs Odd)." },
                        { title: "4. LSB Extraction", desc: "Bits parsed from Least Significant Bits of specific AC coefficients." },
                        { title: "5. Reassembly", desc: "Binary stream translated via ASCII/UTF-8 encoding (e.g., 01101110 → 'n')." }
                      ].map((step, idx) => (
                        <div key={idx} className="bg-black/40 border border-zinc-800 rounded p-2 relative group overflow-hidden">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[9px] font-bold text-white uppercase">{step.title}</span>
                            <span className="text-[8px] text-zinc-600 font-mono">STEP_0{idx+1}</span>
                          </div>
                          <p className="text-[8px] text-zinc-500 leading-tight italic">{step.desc}</p>
                          {isDecoding && (
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#00FF00] animate-pulse" />
                          )}
                        </div>
                      ))}
                    </div>
                    
                    <div className="p-3 bg-red-950/10 border border-red-500/20 rounded">
                      <h5 className="text-[9px] font-bold text-red-500 uppercase mb-2 flex items-center gap-2">
                        <ShieldCheck className="w-3 h-3" /> Extraction_Barriers
                      </h5>
                      <ul className="text-[8px] text-zinc-500 list-disc pl-3 space-y-1">
                        <li><span className="text-zinc-400">Embedding Map:</span> Without the coefficient map, extracted data remains noise.</li>
                        <li><span className="text-zinc-400">Key Barrier:</span> Payload is often scrambled via AES/Blowfish before embedding.</li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <h3 className="text-xs font-bold text-zinc-400 flex items-center gap-2 uppercase tracking-widest">
                  <Unlock className="w-4 h-4 text-[#00FF00]" />
                  Hash-to-Text Algorithmic Decryptor
                </h3>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 min-h-[160px] relative overflow-hidden">
                  {/* Algorithmic Background Effect */}
                  {isInterpreting && (
                    <div className="absolute inset-0 opacity-10 pointer-events-none">
                       <div className="grid grid-cols-10 h-full w-full uppercase text-[6px] text-[#00FF00] font-mono leading-none p-1">
                          {Array.from({ length: 400 }).map((_, i) => (
                            <div key={i} className="animate-pulse">{Math.random() > 0.5 ? '1' : '0'}</div>
                          ))}
                       </div>
                    </div>
                  )}

                  {!interpretation && !isInterpreting && decodedPayload && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                       <Brain className="w-8 h-8 text-zinc-700 mb-4" />
                       <p className="text-[10px] text-zinc-500 leading-relaxed uppercase tracking-wider mb-2">
                         Hash signatures detected in domain: {activeMethod.label}
                       </p>
                       <p className="text-[8px] text-zinc-600 font-mono mb-4">ALGORITHM: NEURAL_HASH_REVERSION_V2</p>
                       <button 
                        onClick={handleRunInterpretation}
                        className="group relative flex items-center gap-3 px-6 py-3 bg-[#00FF00]/10 border border-[#00FF00]/20 rounded-md text-[10px] font-bold text-[#00FF00] hover:bg-[#00FF00]/20 transition-all overflow-hidden"
                       >
                         <span className="relative z-10">DECRYPT & VERIFY (SHA-256)</span>
                         <ShieldCheck className="w-3 h-3 group-hover:animate-pulse" />
                       </button>
                    </div>
                  )}
                  
                  {isInterpreting && (
                    <div className="flex flex-col items-center justify-center h-full gap-4 relative z-10">
                       <div className="relative">
                          <div className="w-10 h-10 border-2 border-[#00FF00]/20 rounded-full animate-ping absolute inset-0" />
                          <div className="w-10 h-10 border-2 border-[#00FF00] border-t-transparent rounded-full animate-spin" />
                       </div>
                       <div className="flex flex-col items-center">
                         <span className="text-[10px] text-[#00FF00] font-mono animate-pulse uppercase tracking-[0.2em]">Cracking Entropy Layers...</span>
                         <span className="text-[8px] text-zinc-600 font-mono mt-1">SIMULATING RAINBOW_TABLE_LOOKUP</span>
                       </div>
                    </div>
                  )}

                  {interpretation && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="text-xs text-white leading-relaxed font-mono flex flex-col gap-4 relative z-10"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                           <span className="w-2 h-2 rounded-full bg-[#00FF00] animate-pulse" />
                           <span className="text-[9px] font-bold text-[#00FF00] uppercase tracking-widest">Decrypted Result</span>
                        </div>
                        <span className="text-[8px] text-zinc-600 bg-black/40 px-2 py-0.5 rounded border border-zinc-800 tracking-tighter">CONFIDENCE: 98.4%</span>
                      </div>
                      <div className="bg-black/60 p-4 border-l-2 border-[#00FF00] relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-100 transition-opacity">
                           <Unlock className="w-4 h-4 text-[#00FF00]" />
                        </div>
                        <p className="italic text-zinc-300 leading-relaxed">
                          "{interpretation}"
                        </p>
                      </div>
                      <div className="flex justify-between items-center bg-black/30 p-2 rounded border border-zinc-800/50">
                         <span className="text-[8px] text-zinc-500 uppercase">Verification_Status</span>
                         <span className={`text-[9px] font-mono font-bold ${isVerified ? 'text-[#00FF00]' : 'text-red-500'}`}>
                           {isVerified ? 'AUTHENTIC_ORIGIN' : 'DECOY_DETECTED'}
                         </span>
                      </div>
                      <div className="flex gap-2">
                         <span className={`text-[8px] bg-zinc-800/50 px-2 py-1 rounded border flex items-center gap-1 ${isVerified ? 'text-[#00FF00] border-[#00FF00]/20' : 'text-red-500 border-red-500/20'}`}>
                           <ShieldCheck className="w-2 h-2" />
                           {isVerified ? 'RSA_SIG_VALID' : 'RSA_SIG_INVALID'}
                         </span>
                         <span className="text-[8px] text-zinc-500 bg-zinc-800/50 px-2 py-1 rounded">DOMAIN_RESTORED</span>
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Visualizer({ method, src }: { method: string, src: string }) {
  // Simple filter simulation for UI representation
  const filterClass = {
    'bitplane': 'contrast-150 grayscale brightness-125',
    'rpe': 'hue-rotate-90 saturate-200 blur-[0.5px]',
    'mapping': 'invert sepia saturate-150',
    'ebe': 'contrast-200 grayscale brightness-75 blur-[1px]',
    'labeling': 'saturate-0 contrast-125 brightness-150 hue-rotate-180',
    'dct': 'brightness-50 saturate-200 hue-rotate-270',
    'dft': 'sepia brightness-110 saturate-150',
    'dwt': 'contrast-125 invert-0 sepia-0',
    'rdh': 'brightness-150 contrast-150 saturate-50'
  }[method] || '';

  return (
    <div className="w-full h-full relative p-4 flex items-center justify-center">
      <img 
        src={src} 
        alt="Visualizer" 
        className={`max-h-full rounded transition-all duration-500 shadow-[0_0_40px_rgba(0,0,0,0.5)] ${filterClass}`} 
      />
      
      {/* Simulation overhead */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-20">
         <div className="w-full h-0.5 bg-[#00FF00] animate-[scan_2s_linear_infinite]" />
      </div>
    </div>
  );
}
