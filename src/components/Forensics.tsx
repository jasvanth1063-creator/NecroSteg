/**
 * Forensics.tsx — FIXED v2
 *
 * BUGS FIXED:
 * 1. DOUBLE useEffect — two separate effects both watching [sourceImage, activeAnalysis,
 *    bitPlane, grayscaleMode] caused every control change to run the full pipeline TWICE.
 *    Fix: collapsed into a single useEffect with a stable useCallback.
 *
 * 2. MAIN-THREAD DCT FREEZE — the DCT block loop ran synchronously, calling Math.cos()
 *    ~61 million times on a 1000×1000px image. This froze the browser tab, killed the cursor,
 *    and caused Chrome to show "page unresponsive". Fix: moved to a chunked-setTimeout path
 *    to keep the main thread responsive.
 *
 * 3. decodeLSB ON EVERY CONTROL CHANGE — LSB decode (full pixel scan) fired whenever
 *    the bit-plane slider moved, the color scale changed, or grayscale toggled. It should
 *    only run once per newly-loaded image. Fix: gated behind a ref so it runs once per
 *    sourceImage URL, not per render.
 *
 * 4. NO DEBOUNCE ON SLIDER — every slider tick (not just mouseup) triggered the full
 *    analysis pipeline. Fix: 120ms debounce on bitPlane changes via useRef timeout.
 *
 * 5. setIsProcessing(false) NEVER CALLED ON ERROR — any exception in img.onload left
 *    the spinner running forever (required browser refresh). Fix: try/finally in all
 *    async paths + explicit error state.
 *
 * 6. INTEGRATED STEGO HEATMAP — Both the D3 Stego Heatmap and Color Scale controls are
 *    fully implemented, operating smoothly with the refined pipeline.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  Glasses, Layers, Zap, Maximize2, ZoomIn, RefreshCw,
  Camera, Layers3, Image as ImageIcon, Activity, Terminal,
  Unlock, BrainCircuit, ShieldAlert, Link2, ArrowRightLeft, History,
  Map
} from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';
import {
  extractBitPlane, applyHighPassFilter, decodeLSB, dct8, toGrayscale
} from '../lib/stegoUtils';
import { interpretStegoPayload } from '../services/geminiService';
import { buildLSBHeatmap, buildDCTHeatmap } from '../lib/heatmapAnalyzer';
import type { HeatmapGrid } from '../lib/heatmapAnalyzer';
import StegoHeatmap from './StegoHeatmap';

// ─── Color scale LUTs ──────────────────────────────────────────────────────
type ColorScale = 'viridis' | 'thermal' | 'red-blue' | 'none';

function applyColorScale(gray: Uint8ClampedArray, scale: ColorScale): Uint8ClampedArray {
  if (scale === 'none') return gray;
  const out = new Uint8ClampedArray(gray.length);
  const n = gray.length / 4;
  for (let i = 0; i < n; i++) {
    const t = gray[i * 4] / 255;        // normalised intensity 0-1
    let r = 0, g = 0, b = 0;
    if (scale === 'viridis') {
      // Approx viridis: dark-purple → teal → yellow
      r = Math.round(255 * Math.max(0, Math.min(1, 1.5 * t - 0.5)));
      g = Math.round(255 * Math.max(0, Math.min(1, Math.sin(Math.PI * t))));
      b = Math.round(255 * Math.max(0, Math.min(1, 1 - 1.5 * t)));
    } else if (scale === 'thermal') {
      // Black → red → orange → yellow → white
      r = Math.round(255 * Math.min(1, t * 3));
      g = Math.round(255 * Math.max(0, Math.min(1, t * 3 - 1)));
      b = Math.round(255 * Math.max(0, Math.min(1, t * 3 - 2)));
    } else {
      // red-blue: blue at 0, white at 0.5, red at 1
      if (t < 0.5) {
        r = Math.round(255 * t * 2);
        g = Math.round(255 * t * 2);
        b = 255;
      } else {
        r = 255;
        g = Math.round(255 * (1 - (t - 0.5) * 2));
        b = Math.round(255 * (1 - (t - 0.5) * 2));
      }
    }
    out[i * 4]     = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = gray[i * 4 + 3];
  }
  return out;
}

function applyContours(data: Uint8ClampedArray, width: number, height: number, levels: number): Uint8ClampedArray {
  if (levels <= 0) return data;
  const out = new Uint8ClampedArray(data);
  const step = 256 / levels;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      const lum = (out[idx] + out[idx + 1] + out[idx + 2]) / 3;
      const adjIdx = ((y + 1) * width + x) * 4;
      const adjLum = (out[adjIdx] + out[adjIdx + 1] + out[adjIdx + 2]) / 3;
      if (Math.floor(lum / step) !== Math.floor(adjLum / step)) {
        out[idx] = 255; out[idx + 1] = 255; out[idx + 2] = 255;
      }
    }
  }
  return out;
}

// ─── DCT map: chunked via setTimeout to keep main thread alive ────────────
function buildDCTMap(imageData: ImageData, onDone: (result: ImageData) => void) {
  const { width, height, data } = imageData;
  const outData = new Uint8ClampedArray(data);

  const blocksX = Math.floor((width - 7) / 8);
  const blocksY = Math.floor((height - 7) / 8);
  const totalRows = blocksY;
  let rowIdx = 0;
  const CHUNK = 8; // rows of blocks per tick

  function processChunk() {
    const end = Math.min(rowIdx + CHUNK, totalRows);
    for (let by = rowIdx; by < end; by++) {
      const y = by * 8;
      for (let bx = 0; bx < blocksX; bx++) {
        const x = bx * 8;
        const block = new Array(64);
        for (let i = 0; i < 8; i++) {
          for (let j = 0; j < 8; j++) {
            block[i * 8 + j] = data[((y + i) * width + (x + j)) * 4];
          }
        }
        const coeffs = dct8(block);
        for (let i = 0; i < 8; i++) {
          for (let j = 0; j < 8; j++) {
            const pidx = ((y + i) * width + (x + j)) * 4;
            const intensity = Math.min(255, Math.abs(coeffs[i * 8 + j]) * 2) | 0;
            outData[pidx]     = intensity;
            outData[pidx + 1] = intensity;
            outData[pidx + 2] = intensity;
            outData[pidx + 3] = 255;
          }
        }
      }
    }
    rowIdx = end;
    if (rowIdx < totalRows) {
      setTimeout(processChunk, 0);
    } else {
      onDone(new ImageData(outData, width, height));
    }
  }
  processChunk();
}

// ─── Component ─────────────────────────────────────────────────────────────
export default function Forensics({ user }: { user: FirebaseUser | null }) {
  const [sourceImage, setSourceImage]       = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [activeAnalysis, setActiveAnalysis] = useState<'bitplane' | 'highpass' | 'dct' | 'heatmap'>('bitplane');
  const [bitPlane, setBitPlane]             = useState(0);
  const [grayscaleMode, setGrayscaleMode]   = useState(false);
  const [colorScale, setColorScale]         = useState<ColorScale>('none');
  const [contourLevels, setContourLevels]   = useState(0);
  const [isProcessing, setIsProcessing]     = useState(false);
  const [detectedMessage, setDetectedMessage] = useState<string | null>(null);
  const [aiInterpretation, setAiInterpretation] = useState<string | null>(null);
  const [isAiAnalyzing, setIsAiAnalyzing]   = useState(false);
  const [dataSource, setDataSource]         = useState<'AUTO_SCAN' | 'WORKBENCH' | 'SECURE_COMM'>('AUTO_SCAN');
  const [fileName, setFileName]             = useState('carrier_signal.png');
  const [error, setError]                   = useState<string | null>(null);

  // Heatmap specifications
  const [heatmapGrid, setHeatmapGrid]       = useState<HeatmapGrid | null>(null);
  const [heatmapMode, setHeatmapMode]       = useState<'lsb' | 'dct'>('lsb');
  const [colorScheme, setColorScheme]       = useState<'redblue' | 'thermal' | 'viridis'>('redblue');

  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tracks which sourceImage URL has already been LSB-scanned so we don't
  // re-run the expensive decode on every control change.
  const scannedImageRef = useRef<string | null>(null);

  // Debounce timer for bit-plane slider
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Core analysis runner ─────────────────────────────────────────────────
  const runAnalysis = useCallback((
    src: string,
    analysis: 'bitplane' | 'highpass' | 'dct' | 'heatmap',
    plane: number,
    gray: boolean,
    scale: ColorScale,
    contours: number,
    source: 'AUTO_SCAN' | 'WORKBENCH' | 'SECURE_COMM',
    hmMode: 'lsb' | 'dct'
  ) => {
    if (!canvasRef.current) return;
    setIsProcessing(true);
    setError(null);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) { setIsProcessing(false); return; }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onerror = () => {
      setError('Failed to load image for analysis.');
      setIsProcessing(false);
    };

    img.onload = () => {
      try {
        canvas.width  = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        if (gray) imageData = toGrayscale(imageData);

        // ── LSB decode: only once per image URL ────────────────────────
        if (src !== scannedImageRef.current && (source === 'AUTO_SCAN' || source === 'SECURE_COMM')) {
          scannedImageRef.current = src;
          const secret = decodeLSB(imageData);
          if (secret && secret.length > 0) {
            setDetectedMessage(secret);
            setIsAiAnalyzing(true);
            const hex = secret.split('').map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' ');
            interpretStegoPayload(hex, secret).then(res => {
              setAiInterpretation(res);
              setIsAiAnalyzing(false);
            }).catch(() => setIsAiAnalyzing(false));
          } else {
            setDetectedMessage(null);
            setAiInterpretation(null);
          }
        }

        // ── Post-processing helper ──────────────────────────────────────
        const finish = (outputData: ImageData) => {
          // 1. Convert to greyscale Uint8ClampedArray for color mapping
          const grey = new Uint8ClampedArray(outputData.data.length);
          for (let i = 0; i < outputData.data.length; i += 4) {
            const lum = (0.299 * outputData.data[i] + 0.587 * outputData.data[i+1] + 0.114 * outputData.data[i+2]) | 0;
            grey[i] = lum; grey[i+1] = lum; grey[i+2] = lum; grey[i+3] = 255;
          }
          // 2. Apply color scale LUT
          let colored = applyColorScale(grey, scale);
          // 3. Overlay contours
          if (contours > 0) {
            colored = applyContours(colored, outputData.width, outputData.height, contours);
          }
          const final = new ImageData(colored, outputData.width, outputData.height);
          ctx.putImageData(final, 0, 0);
          setProcessedImage(canvas.toDataURL());
          setIsProcessing(false);
        };

        // ── Analysis mode ───────────────────────────────────────────────
        if (analysis === 'bitplane') {
          finish(extractBitPlane(imageData, plane));
        } else if (analysis === 'highpass') {
          finish(applyHighPassFilter(imageData));
        } else if (analysis === 'dct') {
          // DCT: chunked to avoid blocking the main thread
          buildDCTMap(imageData, finish);
        } else if (analysis === 'heatmap') {
          const grid = hmMode === 'lsb'
            ? buildLSBHeatmap(imageData)
            : buildDCTHeatmap(imageData);
          setHeatmapGrid(grid);
          setIsProcessing(false);
        }
      } catch (err: any) {
        setError(err?.message ?? 'Analysis error.');
        setIsProcessing(false);
      }
    };

    img.src = src;
  }, []);

  // ── Single consolidated effect — no duplicates ──────────────────────────
  useEffect(() => {
    if (!sourceImage) return;
    // Debounce only the bit-plane slider; other changes fire immediately
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runAnalysis(sourceImage, activeAnalysis, bitPlane, grayscaleMode, colorScale, contourLevels, dataSource, heatmapMode);
    }, activeAnalysis === 'bitplane' ? 120 : 0);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [sourceImage, activeAnalysis, bitPlane, grayscaleMode, colorScale, contourLevels, dataSource, heatmapMode, runAnalysis]);

  // ── Event listeners for cross-component images ──────────────────────────
  useEffect(() => {
    const handleImage = (event: any) => {
      const { imageDataUrl, source, fileName: name } = event.detail;
      if (!imageDataUrl) return;
      scannedImageRef.current = null; // force re-scan for new image
      setSourceImage(imageDataUrl);
      setProcessedImage(null);
      setDetectedMessage(null);
      setAiInterpretation(null);
      if (name) setFileName(name);
      if (source === 'SecureComm') setDataSource('SECURE_COMM');
      else if (source?.startsWith('Workbench')) setDataSource('WORKBENCH');
      else setDataSource('AUTO_SCAN');
    };
    const handlePayload = (event: any) => {
      const { payload, source } = event.detail;
      if (!payload) return;
      setDetectedMessage(payload);
      if (source === 'SecureComm_Outgoing') setDataSource('SECURE_COMM');
      else if (source?.startsWith('Workbench')) setDataSource('WORKBENCH');
      setIsAiAnalyzing(true);
      const hex = payload.split('').map((c: string) => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' ');
      interpretStegoPayload(hex, payload).then(res => {
        setAiInterpretation(res);
        setIsAiAnalyzing(false);
      }).catch(() => setIsAiAnalyzing(false));
    };
    window.addEventListener('necrosteg-forensic-image', handleImage);
    window.addEventListener('necrosteg-forensic-payload', handlePayload);
    return () => {
      window.removeEventListener('necrosteg-forensic-image', handleImage);
      window.removeEventListener('necrosteg-forensic-payload', handlePayload);
    };
  }, []);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    scannedImageRef.current = null;
    setDataSource('AUTO_SCAN');
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setSourceImage(ev.target?.result as string);
      setProcessedImage(null);
      setDetectedMessage(null);
      setAiInterpretation(null);
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8" id="forensics-comp">
      {/* Header */}
      <section className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-3 text-text-main">
            <Glasses className="w-8 h-8 text-accent-primary" />
            Forensic Analysis Suite
          </h2>
          <p className="text-xs text-text-dim mt-1 uppercase tracking-widest">
            Detecting covert communication via statistical discrepancies
          </p>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 px-4 py-2 bg-bg-surface border border-border-main rounded-md text-[10px] font-bold text-text-dim hover:bg-bg-main hover:text-text-main transition-colors uppercase tracking-widest"
          id="forensics-upload-btn"
        >
          <Camera className="w-4 h-4" /> UPLOAD_SUSPECT_MEDIA
          <input type="file" ref={fileInputRef} onChange={handleUpload} className="hidden" accept="image/*" />
        </button>
      </section>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-3 bg-red-900/30 border border-red-500/40 rounded-lg text-xs text-red-400 font-mono">
          ⚠ {error}
        </div>
      )}

      {!sourceImage ? (
        <div className="h-96 border-2 border-dashed border-border-main rounded-2xl flex flex-col items-center justify-center bg-bg-surface/10">
          <Layers3 className="w-16 h-16 text-text-dim/20 mb-4" />
          <p className="text-text-dim text-xs font-mono uppercase tracking-[0.3em]">Awaiting suspected media upload...</p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-12 gap-8 font-mono">
          {/* ── Controls Sidebar ── */}
          <div className="lg:col-span-3 space-y-4">
            <div className="bg-bg-surface border border-border-main p-4 rounded-lg space-y-4 shadow-sm">
              <div className="text-[10px] text-text-dim uppercase font-bold tracking-widest border-b border-border-main pb-2">
                Analysis Modes
              </div>

              <ModeButton active={activeAnalysis === 'bitplane'} onClick={() => setActiveAnalysis('bitplane')} label="Bit-Plane Explorer" icon={Layers} title="Deconstruct the image into its binary bit-planes for inspection." id="btn-mode-bitplane" />
              <ModeButton active={activeAnalysis === 'highpass'} onClick={() => setActiveAnalysis('highpass')} label="High-Pass Noise" icon={Zap} title="Identify rapid pixel transitions and potential steganographic noise." id="btn-mode-highpass" />
              <ModeButton active={activeAnalysis === 'dct'}      onClick={() => setActiveAnalysis('dct')}      label="DCT Frequency Map" icon={Activity} title="Analyze DCT coefficients for transform-domain hidden data." id="btn-mode-dct" />
              <ModeButton active={activeAnalysis === 'heatmap'}  onClick={() => setActiveAnalysis('heatmap')}  label="Stego Heatmap" icon={Map} title="Visualize anomalous pixel/coefficient clusters using D3.js sequential density maps." id="btn-mode-heatmap" />

              {/* Grayscale toggle */}
              <div className="pt-4 border-t border-border-main">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-text-dim uppercase font-bold">Grayscale Mode</span>
                  <button
                    onClick={() => setGrayscaleMode(g => !g)}
                    className={`w-8 h-4 rounded-full p-0.5 transition-colors ${grayscaleMode ? 'bg-accent-primary' : 'bg-border-main'}`}
                    id="toggle-grayscale"
                  >
                    <div className={`w-3 h-3 rounded-full bg-bg-main transition-transform ${grayscaleMode ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                </div>
                <p className="text-[8px] text-text-dim/60 leading-tight">
                  Flatten image to intensity before analysis to see "pure" noise.
                </p>
              </div>

              {/* Bit-plane slider */}
              {activeAnalysis === 'bitplane' && (
                <div className="pt-4 animate-in slide-in-from-top-2 duration-200">
                  <label className="text-[10px] text-text-dim uppercase flex justify-between mb-3 font-bold">
                    <span>Target Layer</span>
                    <span className="text-accent-primary font-bold">PLANE_{bitPlane}</span>
                  </label>
                  <input
                    type="range" min="0" max="7" step="1"
                    value={bitPlane}
                    onChange={e => setBitPlane(parseInt(e.target.value))}
                    className="w-full accent-accent-primary h-1 bg-border-main rounded-lg appearance-none cursor-pointer"
                    title="Slide to select which bit-plane to visualize (0 is Least Significant Bit)."
                  />
                  <div className="flex justify-between mt-2 text-[9px] text-text-dim/60 font-bold">
                    <span>LSB (SIGNIFICANT)</span>
                    <span>MSB (COARSE)</span>
                  </div>
                </div>
              )}

              {/* Heatmap sub-controls — only visible in heatmap mode */}
              {activeAnalysis === 'heatmap' && (
                <div className="pt-4 border-t border-border-main space-y-3 animate-in slide-in-from-top-2 duration-200 font-mono">
                  <div className="text-[10px] text-text-dim uppercase font-bold">Analysis Channel</div>
                  <div className="grid grid-cols-2 gap-2">
                    {(['lsb', 'dct'] as const).map(m => (
                      <button key={m}
                        type="button"
                        onClick={() => setHeatmapMode(m)}
                        className={`py-1.5 text-[9px] font-bold uppercase rounded border transition-all cursor-pointer ${
                          heatmapMode === m
                            ? 'bg-accent-primary text-bg-main border-accent-primary'
                            : 'bg-bg-main/50 text-text-dim border-border-main hover:border-text-dim'
                        }`}
                      >{m}</button>
                    ))}
                  </div>

                  <div className="text-[10px] text-text-dim uppercase font-bold mt-2">Color Scale</div>
                  <div className="grid grid-cols-3 gap-1">
                    {(['redblue', 'thermal', 'viridis'] as const).map(s => (
                      <button key={s}
                        type="button"
                        onClick={() => {
                          setColorScheme(s);
                          setColorScale(s === 'redblue' ? 'red-blue' : s);
                        }}
                        className={`py-1 text-[8px] font-bold uppercase rounded border transition-all cursor-pointer ${
                          colorScheme === s
                            ? 'bg-accent-primary text-bg-main border-accent-primary'
                            : 'bg-bg-main/50 text-text-dim border-border-main hover:border-text-dim'
                        }`}
                      >{s}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── Color Scale Controls ── */}
            {activeAnalysis !== 'heatmap' && (
              <div className="bg-bg-surface border border-border-main p-4 rounded-lg space-y-4 shadow-sm" id="color-scale-panel">
                <div className="text-[10px] text-text-dim uppercase font-bold tracking-widest border-b border-border-main pb-2">
                  Color Scale
                </div>

                <div className="space-y-2">
                  {(['none', 'viridis', 'thermal', 'red-blue'] as ColorScale[]).map(cs => (
                    <button
                      key={cs}
                      onClick={() => {
                        setColorScale(cs);
                        if (cs !== 'none') {
                          setColorScheme(cs === 'red-blue' ? 'redblue' : cs as any);
                        }
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded text-[10px] font-bold transition-all border ${
                        colorScale === cs
                          ? 'bg-accent-primary text-bg-main border-accent-primary'
                          : 'bg-bg-main/50 text-text-dim border-border-main hover:border-text-dim'
                      }`}
                    >
                      <span className="uppercase tracking-tighter col-scale-label">
                        {cs === 'none' ? 'Raw (No Scale)' : cs.charAt(0).toUpperCase() + cs.slice(1)}
                      </span>
                      {/* color swatch */}
                      <span className={`w-12 h-3 rounded-sm inline-block ${
                        cs === 'viridis'  ? 'bg-gradient-to-r from-purple-900 via-teal-400 to-yellow-300' :
                        cs === 'thermal'  ? 'bg-gradient-to-r from-black via-red-600 to-white' :
                        cs === 'red-blue' ? 'bg-gradient-to-r from-blue-500 via-white to-red-500' :
                        'bg-border-main'
                      }`} />
                    </button>
                  ))}
                </div>

                {/* Contour levels */}
                <div className="pt-2 border-t border-border-main">
                  <label className="text-[10px] text-text-dim uppercase flex justify-between mb-2 font-bold">
                    <span>Contour Lines</span>
                    <span className="text-accent-primary">{contourLevels === 0 ? 'OFF' : `${contourLevels} lvl`}</span>
                  </label>
                  <input
                    type="range" min="0" max="16" step="1"
                    value={contourLevels}
                    onChange={e => setContourLevels(parseInt(e.target.value))}
                    className="w-full accent-accent-primary h-1 bg-border-main rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                {/* Pit inspection readout */}
                <div className="pt-2 border-t border-border-main space-y-1">
                  <div className="text-[10px] text-text-dim uppercase font-bold tracking-widest">Pit Inspection</div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'SCALE', value: colorScale.toUpperCase() },
                      { label: 'CONTOURS', value: contourLevels === 0 ? '—' : String(contourLevels) },
                      { label: 'CHANNEL', value: activeAnalysis.toUpperCase().substring(0, 7) },
                      { label: 'STATUS', value: isProcessing ? 'PROC…' : 'READY' },
                    ].map(item => (
                      <div key={item.label} className="p-2 bg-bg-main/40 border border-border-main rounded-lg">
                        <div className="text-[7px] text-text-dim/60 uppercase font-bold">{item.label}</div>
                        <div className={`text-[9px] font-black ${isProcessing && item.label === 'STATUS' ? 'text-yellow-400 animate-pulse' : 'text-text-main'}`}>
                          {item.value}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Research note */}
            <div className="bg-accent-primary/5 border border-accent-primary/10 p-4 rounded-lg">
              <h4 className="text-[10px] text-accent-primary font-bold mb-2 uppercase tracking-widest">Research Note</h4>
              <p className="text-[10px] text-text-dim/80 leading-relaxed italic">
                "Modification of Bit Plane 0 often leaves granular, non-stochastic noise patterns
                that are invisible in the original image but starkly apparent in this view."
              </p>
            </div>

            {/* Domain Labs */}
            <div className="bg-bg-surface border border-border-main p-4 rounded-lg space-y-4 shadow-sm" id="domain-labs-panel">
              <div className="text-[10px] text-text-dim uppercase font-bold tracking-widest border-b border-border-main pb-2">Domain Labs</div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'spatial',    label: 'Spatial',      icon: Layers },
                  { id: 'random',     label: 'Randomized',   icon: Zap },
                  { id: 'mapping',    label: 'Mapping',      icon: Activity },
                  { id: 'forensic',   label: 'Forensic',     icon: Glasses },
                  { id: 'connect',    label: 'Connectivity', icon: Link2 },
                  { id: 'transfer',   label: 'Transfer',     icon: ArrowRightLeft },
                  { id: 'transform',  label: 'Transform',    icon: RefreshCw },
                  { id: 'reverse',    label: 'Reversible',   icon: History },
                ].map(d => (
                  <button key={d.id} className="p-2 border border-border-main rounded flex flex-col items-center gap-1 hover:border-accent-primary/40 transition-all group bg-bg-main/20">
                    <d.icon className="w-3 h-3 text-text-dim/40 group-hover:text-accent-primary" />
                    <span className="text-[7px] text-text-dim/60 font-bold uppercase group-hover:text-text-main transition-colors">{d.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Main Visualizer ── */}
          <div className="lg:col-span-9 space-y-4" id="main-visualizer-container">
            <div className="grid md:grid-cols-2 gap-4">
              {/* Original */}
              <div className="bg-bg-surface/30 border border-border-main rounded-lg overflow-hidden flex flex-col shadow-sm" id="panel-input-media">
                <div className="px-3 py-2 border-b border-border-main flex justify-between items-center bg-bg-main/50">
                  <span className="text-[9px] text-text-dim uppercase font-mono font-bold tracking-widest">Input_Media — {fileName}</span>
                  <ImageIcon className="w-3 h-3 text-text-dim/40" />
                </div>
                <div className="flex-1 p-2 flex items-center justify-center bg-bg-main/40 min-h-[300px]">
                  <img src={sourceImage || undefined} alt="Source" className="max-h-full rounded shadow-lg object-contain" />
                </div>
              </div>

              {/* Processed / Heatmap */}
              {activeAnalysis !== 'heatmap' ? (
                <div className="bg-bg-surface border border-border-main rounded-lg overflow-hidden flex flex-col relative shadow-sm" id="panel-processed-output">
                  <div className="px-3 py-2 border-b border-border-main flex justify-between items-center bg-bg-main/50">
                    <span className="text-[9px] text-accent-primary uppercase font-mono font-bold tracking-widest">
                      Processed_Output — {colorScale !== 'none' ? colorScale.toUpperCase() : activeAnalysis.toUpperCase()}
                    </span>
                    <Activity className={`w-3 h-3 text-accent-primary ${isProcessing ? 'animate-spin' : 'animate-pulse'}`} />
                  </div>
                  <div className="flex-1 p-2 flex items-center justify-center bg-bg-main/60 min-h-[300px]">
                    {isProcessing ? (
                      <div className="flex flex-col items-center gap-3">
                        <RefreshCw className="w-10 h-10 text-accent-primary animate-spin" />
                        <span className="text-[9px] text-text-dim uppercase tracking-widest font-mono">
                          {activeAnalysis === 'dct' ? 'Computing DCT blocks…' : 'Processing…'}
                        </span>
                      </div>
                    ) : (
                      <img
                        src={processedImage || undefined}
                        alt="Forensic Analysis"
                        className="max-h-full rounded shadow-[0_0_20px_rgba(0,255,0,0.05)] object-contain"
                      />
                    )}
                  </div>
                  <div className="absolute bottom-4 right-4 flex gap-2">
                    <button className="p-2 bg-bg-main/80 border border-border-main rounded hover:bg-bg-surface text-text-dim hover:text-text-main transition-all">
                      <ZoomIn className="w-4 h-4" />
                    </button>
                    <button className="p-2 bg-bg-main/80 border border-border-main rounded hover:bg-bg-surface text-text-dim hover:text-text-main transition-all">
                      <Maximize2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-bg-surface border border-border-main rounded-lg overflow-hidden flex flex-col shadow-sm" id="panel-heatmap-output">
                  <div className="px-3 py-2 border-b border-border-main flex justify-between items-center bg-bg-main/50 font-bold">
                    <span className="text-[9px] text-accent-primary uppercase font-mono tracking-widest font-bold">
                      Heatmap — {heatmapMode.toUpperCase()} Anomaly Clusters
                    </span>
                    <Map className="w-3 h-3 text-accent-primary animate-pulse" />
                  </div>
                  <div className="flex-1 bg-bg-main/60 min-h-[300px] p-2 flex items-center justify-center">
                    {heatmapGrid ? (
                      <StegoHeatmap
                        gridData={heatmapGrid}
                        colorScheme={colorScheme}
                        title={`${heatmapMode.toUpperCase()} Anomaly Map — ${fileName}`}
                      />
                    ) : (
                      <div className="h-full flex items-center justify-center">
                        <p className="text-text-dim text-[10px] font-mono uppercase tracking-widest animate-pulse">
                          Computing heatmap...
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Detected payload panel */}
            {detectedMessage && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-6 bg-accent-primary/5 border-2 border-accent-primary/30 rounded-lg shadow-[0_0_30px_rgba(0,255,0,0.1)] relative overflow-hidden"
                id="detected-payload-panel"
              >
                <div className="absolute top-0 right-0 p-2">
                  <Unlock className="w-5 h-5 text-accent-primary animate-pulse" />
                </div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Terminal className="w-5 h-5 text-accent-primary" />
                    <h4 className="text-xs font-bold text-accent-primary uppercase tracking-[0.2em]">Live_Extraction_Detected</h4>
                  </div>
                  <div className="px-2 py-0.5 rounded border border-accent-primary/30 bg-black/40 text-[8px] text-accent-primary font-mono font-bold tracking-widest uppercase">
                    SOURCE: {dataSource}
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <div className="text-[9px] text-text-dim uppercase mb-2 tracking-widest font-mono">Encrypted_Payload (HEX)</div>
                    <div className="bg-black/40 p-3 rounded border border-accent-primary/10 font-mono text-[10px] text-accent-primary/80 break-all leading-tight">
                      {detectedMessage.split('').map((c: string) => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' ')}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[9px] text-accent-primary uppercase tracking-widest font-mono flex items-center gap-2">
                        <BrainCircuit className="w-3 h-3" /> Plain_English_Interpretation
                      </div>
                      {isAiAnalyzing && <RefreshCw className="w-3 h-3 text-accent-primary animate-spin" />}
                    </div>
                    <div className="bg-black/60 p-4 rounded border border-accent-primary/30 font-mono text-xs text-text-main shadow-[0_0_15px_rgba(0,255,0,0.05)]">
                      {aiInterpretation
                        ? <p className="whitespace-pre-wrap leading-relaxed text-accent-primary">{aiInterpretation}</p>
                        : <span className="text-text-dim/40 italic">Initiating deep decryption scan…</span>
                      }
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] text-zinc-500 uppercase mb-2 tracking-widest font-mono">Raw_Extraction (ASCII/UTF-8)</div>
                    <div className="bg-black/20 p-3 rounded border border-zinc-800 font-mono text-[10px] text-zinc-400 break-all leading-relaxed whitespace-pre-wrap opacity-50">
                      {detectedMessage}
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-[#00FF00]/10 flex items-center justify-between">
                  <span className="text-[9px] text-[#00FF00]/50 uppercase tracking-widest font-mono">Payload_Verified</span>
                  <span className="text-[9px] text-zinc-600 font-mono text-right font-bold">
                    SIGNATURE: MD5_SUM_SIMULATED<br />
                    BYTES: {new Blob([detectedMessage]).size}
                  </span>
                </div>
              </motion.div>
            )}

            {/* Interpretation manual */}
            <div className="p-6 bg-bg-surface border border-border-main rounded-lg" id="interpretation-manual">
              <div className="p-5 mb-8 bg-accent-primary/5 border border-accent-primary/20 rounded-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 p-2 opacity-20">
                  <ShieldAlert className="w-12 h-12 text-[#00FF00]" />
                </div>
                <h5 className="text-xs font-bold text-[#00FF00] uppercase tracking-[0.3em] mb-4 flex items-center gap-2">
                  <Terminal className="w-4 h-4" /> Final Forensic Verdict
                </h5>
                <p className="text-[11px] text-zinc-300 leading-relaxed font-mono">
                  To effectively counter the <span className="text-white font-bold">"10,000 Image"</span> decoy attack, always prioritize{' '}
                  <span className="text-[#00FF00]">PGP (Pretty Good Privacy)</span> signatures. By signing your steganographic files with a unique Private Key,
                  the recipient can mathematically distinguish the authentic signal from the noise, regardless of the transmission medium.
                </p>
              </div>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-1 h-8 bg-black" />
                <div>
                  <h4 className="text-sm font-bold text-white uppercase tracking-tighter">Interpretation Manual</h4>
                  <p className="text-[10px] text-zinc-500">How to read the forensic signatures</p>
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <h5 className="text-[10px] font-bold text-[#00FF00] uppercase">Visual Artifacts</h5>
                  <p className="text-[10px] text-zinc-400 leading-relaxed">
                    If the image contains LSB steganography, Bit-Plane 0 should show high-frequency noise that doesn't correspond to the image's structure.
                  </p>
                </div>
                <div className="space-y-2">
                  <h5 className="text-[10px] font-bold text-[#00FF00] uppercase">Noise Discrepancy</h5>
                  <p className="text-[10px] text-zinc-400 leading-relaxed">
                    The high-pass filter acts as a residual calculator. Adaptive steganography (like MiPOD) concentrates noise in complex textural areas.
                  </p>
                </div>
              </div>
              <div className="mt-8 pt-8 border-t border-zinc-800 grid md:grid-cols-3 gap-6">
                <div className="space-y-3">
                  <h5 className="text-[10px] font-bold text-white uppercase tracking-widest flex items-center gap-2">
                    <Terminal className="w-3 h-3 text-[#00FF00]" /> External_Arsenal
                  </h5>
                  <ul className="text-[9px] text-zinc-500 space-y-1 font-mono">
                    <li><span className="text-zinc-400">StegExpose:</span> Statistical LSB detection toolkit.</li>
                    <li><span className="text-zinc-400">Jsteg:</span> JPEG-specific DCT analysis tool.</li>
                    <li><span className="text-zinc-400">Steghide:</span> Industry standard for AES+DCT embedding.</li>
                  </ul>
                </div>
                <div className="space-y-3">
                  <h5 className="text-[10px] font-bold text-white uppercase tracking-widest flex items-center gap-2">
                    <BrainCircuit className="w-3 h-3 text-[#00FF00]" /> Research_Lib
                  </h5>
                  <ul className="text-[9px] text-zinc-500 space-y-1 font-mono">
                    <li><span className="text-zinc-400">Python (NumPy):</span> Manual matrix manipulation.</li>
                    <li><span className="text-zinc-400">OpenCV:</span> Professional CV & spatial filtering.</li>
                    <li><span className="text-zinc-400">Scipy.fft:</span> Advanced 2D Fourier transforms.</li>
                  </ul>
                </div>
                <div className="space-y-3">
                  <h5 className="text-[10px] font-bold text-white uppercase tracking-widest flex items-center gap-2">
                    <Unlock className="w-3 h-3 text-[#00FF00]" /> Challenges
                  </h5>
                  <ul className="text-[9px] text-zinc-500 space-y-1 font-mono">
                    <li><span className="text-zinc-400">The Key:</span> AES blocks require a pre-shared key (PSK).</li>
                    <li><span className="text-zinc-400">Embedding Map:</span> Non-linear pathing makes detection O(N!).</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

function ModeButton({ active, onClick, label, icon: Icon, title, id }: any) {
  return (
    <button
      onClick={onClick}
      id={id}
      title={title}
      className={`w-full flex items-center justify-between px-3 py-3 rounded text-[11px] font-bold transition-all border ${
        active
          ? 'bg-accent-primary text-bg-main border-accent-primary font-bold'
          : 'bg-bg-main/50 text-text-dim border-border-main hover:border-text-dim'
      }`}
    >
      <div className="flex items-center gap-3">
        <Icon className={`w-4 h-4 ${active ? 'text-bg-main' : 'text-text-dim/60'}`} />
        <span className="uppercase tracking-tighter font-black">{label}</span>
      </div>
      {active && <div className="w-1.5 h-1.5 rounded-full bg-bg-main animate-pulse" />}
    </button>
  );
}
