import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { 
  Upload, 
  Download, 
  Lock, 
  Unlock, 
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Binary,
  Share2,
  Zap,
  Cpu
} from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';
import { encodeLSB, decodeLSB, encodeDCT, decodeDCT, toGrayscale } from '../lib/stegoUtils';
import { safeStorage } from '../lib/safeStorage';

export default function Workbench({ user }: { user: FirebaseUser | null }) {
  const [mode, setMode] = useState<'encode' | 'decode'>('encode');
  const [stegoMethod, setStegoMethod] = useState<'lsb' | 'dct'>('lsb');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [covertEntropy, setCovertEntropy] = useState('');
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [decodedMessage, setDecodedMessage] = useState<string | null>(null);
  const [decodedEntropy, setDecodedEntropy] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [grayscaleMode, setGrayscaleMode] = useState(false);
  const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error', msg: string }>({ type: 'idle', msg: '' });
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = (event) => {
        setSelectedImage(event.target?.result as string);
        setResultImage(null);
        setDecodedMessage(null);
        setDecodedEntropy(null);
        setStatus({ type: 'idle', msg: '' });
      };
      reader.readAsDataURL(file);
    }
  };

  const processImage = async () => {
    if (!selectedImage || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    safeStorage.setItem('stego_method', stegoMethod);
    const isCovertEnabled = safeStorage.getItem('stego_covert') === 'true';
    const covertEntropyInput = safeStorage.getItem('stego_entropy') || '';

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const MAX_TRANS_DIM = 800;
      let width = img.width;
      let height = img.height;

      if (width > MAX_TRANS_DIM || height > MAX_TRANS_DIM) {
        if (width > height) {
          height = (MAX_TRANS_DIM / width) * height;
          width = MAX_TRANS_DIM;
        } else {
          width = (MAX_TRANS_DIM / height) * width;
          height = MAX_TRANS_DIM;
        }
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      
      let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      try {
        if (mode === 'encode') {
          if (!message && !covertEntropy && !covertEntropyInput) throw new Error('Enter a primary message or covert entropy.');
          
          if (grayscaleMode) {
            imageData = toGrayscale(imageData);
          }

          // Step 1: Embed Primary Message
          let stegoData = imageData;
          if (message) {
            stegoData = stegoMethod === 'lsb' 
              ? encodeLSB(stegoData, message, grayscaleMode) 
              : encodeDCT(stegoData, message, grayscaleMode);
          }

          // Step 2: Embed Covert Entropy (Secondary Channel)
          const finalEntropy = covertEntropy || (isCovertEnabled ? covertEntropyInput : '');
          if (finalEntropy) {
             // For raw extraction fallback, we use the prefix to identify it easily in this lab
             stegoData = stegoMethod === 'lsb'
              ? encodeLSB(stegoData, `[ENTROPY]${finalEntropy}`, grayscaleMode)
              : encodeDCT(stegoData, `[ENTROPY]${finalEntropy}`, grayscaleMode);
          }
          
          ctx.putImageData(stegoData, 0, 0);
          const stegoUrl = canvas.toDataURL();
          setResultImage(stegoUrl);
          
          window.dispatchEvent(new CustomEvent('necrosteg-forensic-image', {
            detail: {
                imageDataUrl: stegoUrl,
                mimeType: 'image/png',
                source: 'Workbench_Encoder'
            }
          }));

          setStatus({ 
            type: 'success', 
            msg: `Payload secured via ${stegoMethod.toUpperCase()}${covertEntropy ? ' + Covert Channel' : ''}.`
          });
        } else {
          const secret = stegoMethod === 'lsb' 
            ? decodeLSB(imageData) 
            : decodeDCT(imageData);
          
          if (secret.startsWith('[ENTROPY]')) {
             setDecodedEntropy(secret.substring(9));
             setDecodedMessage("[COVERT_ENTROPY_DETECTED]");
          } else {
             setDecodedMessage(secret);
             setDecodedEntropy(null);
          }

          if (secret) {
            window.dispatchEvent(new CustomEvent('necrosteg-forensic-payload', {
              detail: {
                payload: secret,
                source: 'Workbench_Decoder',
                method: stegoMethod
              }
            }));
            setStatus({ type: 'success', msg: 'Hidden sequence extracted successfully.' });
          } else {
            setStatus({ type: 'error', msg: 'No steganographic sequence found.' });
          }
          
          window.dispatchEvent(new CustomEvent('necrosteg-forensic-image', {
            detail: {
                imageDataUrl: selectedImage,
                mimeType: 'image/png',
                source: 'Workbench_Decoder'
            }
          }));
        }
      } catch (err: any) {
        setStatus({ type: 'error', msg: err.message });
      }
    };
    img.src = selectedImage;
  };

  const downloadResult = () => {
    if (!resultImage) return;
    const link = document.createElement('a');
    link.download = 'stego_object.png';
    link.href = resultImage;
    link.click();
  };

  const transmitToNetwork = () => {
    if (!resultImage) return;
    try {
      safeStorage.setItem('stego_payload', resultImage);
      safeStorage.setItem('stego_filename', fileName ? `stego_${fileName}` : 'stego_package.png');
      safeStorage.setItem('stego_method', stegoMethod);
      safeStorage.setItem('stego_covert', covertEntropy ? 'true' : 'false');
      
      window.dispatchEvent(new CustomEvent('stego-payload-ready'));
      window.dispatchEvent(new CustomEvent('switch-tab', { detail: 'comm' }));
    } catch (err) {
      alert("BUFFER_STAGING_FAILED: Payload too large for local buffer. Please manually save and upload the image.");
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-10">
      <div className="space-y-6">
        <div className="flex gap-1 p-1 glass-panel rounded-md w-fit">
          <button 
            onClick={() => { setMode('encode'); setStatus({ type: 'idle', msg: '' }); }}
            title="Switch to message encryption mode."
            className={`px-4 py-2 text-[10px] font-bold tracking-widest rounded transition-all ${mode === 'encode' ? 'bg-accent-primary text-bg-main' : 'text-text-dim hover:text-text-main'}`}
          >
            HIDE_DATA
          </button>
          <button 
            onClick={() => { setMode('decode'); setStatus({ type: 'idle', msg: '' }); }}
            title="Switch to hidden data extraction mode."
            className={`px-4 py-2 text-[10px] font-bold tracking-widest rounded transition-all ${mode === 'decode' ? 'bg-accent-primary text-bg-main' : 'text-text-dim hover:text-text-main'}`}
          >
            EXTRACT_DATA
          </button>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] text-text-dim uppercase font-bold tracking-widest">Protocol Domain</label>
          <div className="grid grid-cols-2 gap-2">
            <button 
              onClick={() => setStegoMethod('lsb')}
              title="Use Least Significant Bit (Spatial Domain) encoding for maximum speed."
              className={`p-3 rounded border text-left transition-all ${stegoMethod === 'lsb' ? 'bg-accent-primary/10 border-accent-primary text-accent-primary' : 'bg-bg-surface border-border-main text-text-dim hover:border-text-main'}`}
            >
              <div className="text-[10px] font-bold uppercase mb-1">Spatial (LSB)</div>
              <div className="text-[8px] opacity-70 leading-tight">Fastest, but high forensic visibility in bitplanes.</div>
            </button>
            <button 
              onClick={() => setStegoMethod('dct')}
              title="Use Discrete Cosine Transform (Frequency Domain) for compression-resistant encoding."
              className={`p-3 rounded border text-left transition-all ${stegoMethod === 'dct' ? 'bg-accent-primary/10 border-accent-primary text-accent-primary' : 'bg-bg-surface border-border-main text-text-dim hover:border-text-main'}`}
            >
              <div className="text-[10px] font-bold uppercase mb-1">Frequency (DCT)</div>
              <div className="text-[8px] opacity-70 leading-tight">Advanced. Robust against compression. Uses 8x8 block DCT.</div>
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between p-4 glass-panel rounded-lg">
           <div>
              <div className="text-[10px] font-bold uppercase text-text-main mb-1">Grayscale Processing</div>
              <p className="text-[8px] text-text-dim leading-tight">Syncs RGB channels to prevent colored noise artifacts in gray images.</p>
           </div>
           <button 
            onClick={() => setGrayscaleMode(!grayscaleMode)}
            title="Toggle between full color and grayscale signal processing."
            className={`w-12 h-6 rounded-full p-1 transition-colors ${grayscaleMode ? 'bg-accent-primary' : 'bg-border-main'}`}
           >
             <div className={`w-4 h-4 rounded-full bg-bg-main transition-transform ${grayscaleMode ? 'translate-x-6' : 'translate-x-0'}`} />
           </button>
        </div>

        <div className="p-4 bg-accent-primary/5 border border-accent-primary/20 rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-accent-primary animate-pulse" />
              <span className="text-[10px] text-accent-primary font-bold uppercase tracking-widest">Covert Fallback Channel</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer"
                checked={safeStorage.getItem('stego_covert') === 'true'}
                onChange={(e) => {
                  const checked = e.target.checked;
                  safeStorage.setItem('stego_covert', checked.toString());
                  // Force re-render by updating local state indirectly
                  setGrayscaleMode(v => v); 
                }}
              />
              <div className="w-9 h-5 bg-border-main peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent-primary"></div>
            </label>
          </div>
          <p className="text-[8px] text-text-dim leading-relaxed italic">
            Embeds raw statistical entropy that can be extracted directly even if the primary layer is compromised.
          </p>
          {safeStorage.getItem('stego_covert') === 'true' && (
            <div className="space-y-2">
               <label className="text-[9px] text-accent-primary/60 uppercase font-mono tracking-widest">Statistical_Entropy_Payload</label>
               <input 
                type="text"
                value={covertEntropy}
                onChange={(e) => {
                  setCovertEntropy(e.target.value);
                  safeStorage.setItem('stego_entropy', e.target.value);
                }}
                placeholder="Enter raw extraction data (e.g. system seed)..."
                className="w-full bg-black/60 border border-accent-primary/20 rounded-lg p-2 text-[10px] font-mono text-accent-primary outline-none focus:border-accent-primary/50"
              />
            </div>
          )}
        </div>

        <section className="space-y-4">
          <h3 className="text-xl font-bold flex items-center gap-2 text-text-main">
            {mode === 'encode' ? <Lock className="w-5 h-5 text-accent-primary" /> : <Unlock className="w-5 h-5 text-accent-primary" />}
            {mode === 'encode' ? 'Steganographic Encoding' : 'Extraction Protocol'}
          </h3>
          
          <div 
            onClick={() => fileInputRef.current?.click()}
            title="Upload a carrier image from your device."
            className={`border-2 border-dashed border-border-main rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer hover:border-accent-primary/50 transition-colors bg-bg-surface/10 group ${selectedImage ? 'py-4' : ''}`}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleImageUpload} 
              accept="image/*" 
              className="hidden" 
            />
            {selectedImage ? (
              <div className="relative group">
                <img src={selectedImage || undefined} alt="Preview" className="max-h-48 rounded border border-border-main shadow-2xl" />
                <div className="absolute inset-0 bg-bg-main/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded">
                   <RefreshCw className="text-text-main w-8 h-8" />
                </div>
              </div>
            ) : (
              <>
                <Upload className="w-10 h-10 text-text-dim mb-3 group-hover:text-accent-primary transition-colors" />
                <span className="text-xs text-text-dim font-bold uppercase tracking-widest">DRAG_DROP_OR_UPLOAD_COVER</span>
              </>
            )}
          </div>

          {mode === 'encode' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] text-text-dim uppercase font-bold tracking-widest">Primary Message Payload</label>
                <textarea 
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Enter text to conceal..."
                  className="w-full bg-bg-surface border border-border-main rounded p-4 text-xs focus:border-accent-primary focus:ring-1 focus:ring-accent-primary outline-none min-h-[80px] text-text-main"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] text-accent-primary uppercase font-bold tracking-widest flex items-center gap-2">
                  <Binary className="w-3 h-3" /> Covert Entropy Fallback
                </label>
                <input 
                  type="text"
                  value={covertEntropy}
                  onChange={(e) => setCovertEntropy(e.target.value)}
                  placeholder="Embedded statistical signature (secondary channel)..."
                  className="w-full bg-bg-surface border border-border-main rounded p-3 text-xs focus:border-accent-primary focus:ring-1 focus:ring-accent-primary outline-none text-text-main font-mono"
                />
                <p className="text-[8px] text-text-dim mt-1">This entropy is embedded directly and can be recovered even if E2EE verification fails.</p>
              </div>
            </div>
          )}

          <button 
            disabled={!selectedImage}
            onClick={processImage}
            title={mode === 'encode' ? 'Initiate the steganographic embedding process.' : 'Execute the extraction algorithm on the carrier.'}
            className="w-full bg-accent-primary text-bg-main py-4 rounded font-bold text-xs flex items-center justify-center gap-3 disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 transition-all uppercase tracking-widest"
          >
            {mode === 'encode' ? 'INITIATE_ENCODING' : 'EXECUTE_EXTRACT'}
          </button>

          {status.msg && (
            <div className={`p-4 rounded flex items-center gap-3 text-xs border ${status.type === 'success' ? 'bg-accent-primary/5 border-accent-primary/20 text-accent-primary' : 'bg-red-500/5 border-red-500/20 text-red-500'}`}>
              {status.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <span>{status.msg}</span>
            </div>
          )}
        </section>
      </div>

      <div className="space-y-6">
        <div className="glass-panel rounded-xl p-6 min-h-[400px] flex flex-col shadow-sm">
          <div className="flex justify-between items-center mb-6">
             <h3 className="text-xs font-bold tracking-widest text-text-dim uppercase flex items-center gap-2">
               <Binary className="w-4 h-4" />
               Output_Buffer
             </h3>
             <div className="flex gap-2">
                {resultImage && (
                  <>
                    <button 
                      onClick={transmitToNetwork}
                      title="Transmit the processed carrier to the Secure Communication network."
                      className="text-[10px] text-text-main border border-border-main px-3 py-1 rounded bg-bg-surface hover:bg-bg-main flex items-center gap-2 transition-colors uppercase font-bold"
                    >
                      <Share2 className="w-3 h-3 text-accent-primary" /> TRANSMIT
                    </button>
                    <button 
                      onClick={downloadResult}
                      title="Directly save the resulting image to your local storage."
                      className="text-[10px] text-accent-primary border border-accent-primary/30 px-3 py-1 rounded bg-accent-primary/5 hover:bg-accent-primary/20 flex items-center gap-2 transition-colors uppercase font-bold"
                    >
                      <Download className="w-3 h-3" /> SAVE_IMAGE
                    </button>
                  </>
                )}
             </div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center border border-border-main border-dashed rounded-lg bg-bg-main/30 p-4">
            {mode === 'encode' ? (
              resultImage ? (
                <div className="text-center animate-in fade-in zoom-in duration-300">
                  <img src={resultImage || undefined} alt="Stego Result" className="max-h-64 rounded border border-border-main shadow-xl mb-4" />
                  <p className="text-[10px] text-text-dim italic">Visual difference is imperceptible to the human eye.</p>
                </div>
              ) : (
                <div className="text-center flex flex-col items-center">
                  <RefreshCw className="w-12 h-12 text-text-dim mb-2 animate-spin-slow rotate-180 opacity-20" />
                  <span className="text-[10px] text-text-dim uppercase font-bold tracking-tighter">Awaiting process...</span>
                </div>
              )
            ) : (
              decodedMessage !== null ? (
                <div className="w-full h-full p-4 font-mono text-xs bg-bg-main/50 rounded border border-border-main overflow-y-auto break-all">
                   <div className="text-accent-primary mb-2 opacity-50 uppercase tracking-tighter font-bold">Decoded_Sequence:</div>
                   <div className="text-text-main leading-relaxed">
                     {decodedMessage || "[NO_MESSAGE_DETECTED]"}
                   </div>
                </div>
              ) : (
                <div className="text-center flex flex-col items-center">
                  <RefreshCw className="w-12 h-12 text-text-dim opacity-20 mb-2" />
                  <span className="text-[10px] text-text-dim uppercase font-bold tracking-tighter">Buffer cleared</span>
                </div>
              )
            )}
          </div>
        </div>

        <div className="p-4 glass-panel rounded font-mono text-[10px] space-y-2 shadow-sm">
          <div className="text-text-dim uppercase tracking-widest border-b border-border-main pb-2 mb-2 font-bold">Protocol Specs</div>
          <div className="flex justify-between">
             <span className="text-text-dim opacity-60">ALGORITHM:</span>
             <span className="text-accent-primary font-bold">{stegoMethod === 'lsb' ? 'LSB_SPATIAL_v1' : 'DCT_FREQUENCY_v1'}</span>
          </div>
          <div className="flex justify-between">
             <span className="text-text-dim opacity-60">DOMAIN:</span>
             <span className="text-text-main capitalize">{stegoMethod === 'lsb' ? 'Spatial' : 'Transform (DCT 8x8)'}</span>
          </div>
          <div className="flex justify-between">
             <span className="text-text-dim opacity-60">CAPACITY:</span>
             <span className="text-text-main">{stegoMethod === 'lsb' ? '0.75 bit_per_pixel' : '1 bit per 8x8 block'}</span>
          </div>
          <div className="flex justify-between">
             <span className="text-text-dim opacity-60">CIPHER:</span>
             <span className="text-text-main">NULL_PLAINTEXT</span>
          </div>
        </div>
      </div>
      
      {/* Hidden processing canvas */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
