import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Database, 
  Cpu, 
  ShieldCheck, 
  ArrowRight,
  ExternalLink,
  Layers,
  Zap,
  ChevronRight,
  X,
  BookOpen,
  Info
} from 'lucide-react';

interface Dataset {
  name: string;
  description: string;
  size: string;
  url?: string;
  stats?: {
    detection: string;
    capacity: string;
    format: string;
  };
  aiInsight?: string;
}

interface Section {
  title: string;
  description: string;
  techs: string[];
  icon: any;
  color: string;
  datasets: Dataset[];
  statisticalProfile: {
    avgDetection: string;
    payloadLimit: string;
    commonAttack: string;
  };
}

interface Props {
  onGoToWorkbench: () => void;
}

export default function ResearchHub({ onGoToWorkbench }: Props) {
  const [activeProtocol, setActiveProtocol] = useState<number | null>(null);

  const sections: Section[] = [
    {
      title: "SPATIAL DOMAIN",
      description: "Direct pixel value modification. Simple but vulnerable to statistical attacks.",
      techs: ["LSB Matching", "EBE (Edge-Based)", "RPE (Random Pixel)", "PVD", "Labeling"],
      icon: Layers,
      color: "text-blue-400",
      statisticalProfile: {
        avgDetection: "84.2%",
        payloadLimit: "0.4 bpp",
        commonAttack: "Chi-Square Analysis"
      },
      datasets: [
        { 
          name: "BOSSBase 1.01 + 0.4 WOW", 
          description: "10,000 grayscale images in PGM format embedded with the content-adaptive WOW algorithm at 0.4 bpp. The industry standard for spatial domain benchmarking.", 
          size: "10,000 IMAGES",
          url: "https://www.kaggle.com/datasets?search=BOSSBase+1.01+WOW+0.4",
          stats: { detection: "94.2%", capacity: "0.4 bpp", format: "PGM/WOW" },
          aiInsight: "Primary benchmark for SRNet. High-frequency texture noise makes LSB-matching detection impossible without deep feature extraction."
        },
        { 
          name: "BOWS2 (Benchmark v2)", 
          description: "Benchmark for Watermarking and Steganography. Originally from the BOWS-2 competition, focusing on robust synchronisation and geometric attacks.", 
          size: "10,000 IMAGES",
          url: "https://www.kaggle.com/datasets?search=BOWS2+steganalysis",
          stats: { detection: "88.4%", capacity: "0.5 bpp", format: "TIFF/JPG" },
          aiInsight: "Critical for testing robustness against re-sampling and geometric transforms in spatial coordinates."
        },
        { 
          name: "ALASKA #1 (Large Scale)", 
          description: "A heterogeneous dataset from the first ALASKA competition, featuring images from various cameras with diverse processing pipelines.", 
          size: "50,000+ IMAGES",
          url: "https://www.kaggle.com/datasets?search=ALASKA+steganalysis",
          stats: { detection: "Variable", capacity: "0.6 bpp", format: "RAW/JPEG" },
          aiInsight: "Essential for testing 'Into the Wild' scenarios where image origins and processing histories are unknown."
        }
      ]
    },
    {
      title: "TRANSFORM DOMAIN",
      description: "Modifying coefficients in DCT, DFT, or DWT signals. More robust to processing.",
      techs: ["J-UNIWARD", "DFT Magnitude", "DWT (Haar)", "RDH (Lossless)"],
      icon: Zap,
      color: "text-amber-400",
      statisticalProfile: {
        avgDetection: "62.8%",
        payloadLimit: "0.2 bpp",
        commonAttack: "DCT Histogram Shift"
      },
      datasets: [
        { 
          name: "Steganalysis-JPEG-LSB", 
          description: "Standard JPEG steganography samples with varying Quality Factors for quantization analysis in the DCT domain.", 
          size: "30,000+ IMAGES",
          url: "https://www.kaggle.com/datasets?search=JPEG+steganalysis+LSB",
          stats: { detection: "74.2%", capacity: "0.2 bpp", format: "JPEG" },
          aiInsight: "Focuses on J-UNIWARD embedding patterns in high-frequency DCT coefficients. Key for frequency-domain classifiers."
        },
        { 
          name: "ImageNet Samples (HuggingFace)", 
          description: "Subsampled datasets from ImageNet-1K used to train robust universal transform domain classifiers at production scale.", 
          size: "100,000+ SAMPLES",
          url: "https://huggingface.co/datasets/imagenet-1k",
          stats: { detection: "58.9%", capacity: "0.3 bpp", format: "JPEG" },
          aiInsight: "Large scale diversity helps in training models (USP) that identify patterns across thousands of disparate object classes."
        },
        { 
          name: "LFW Faces (Biometric)", 
          description: "Labeled Faces in the Wild. Standard benchmark for biometric steganography and facial texture noise analysis.", 
          size: "13,233 IMAGES",
          url: "https://huggingface.co/datasets/lfw",
          stats: { detection: "81.4%", capacity: "0.1 bpp", format: "JPG" },
          aiInsight: "Low-entropy textures in skin make stego-signals significantly easier to detect via frequency-domain noise analysis."
        }
      ]
    },
    {
      title: "DEEP STACK ANALYSIS",
      description: "CNN-based classification to detect hidden data in 'into the wild' scenarios.",
      techs: ["YeNet", "SRNet", "CNN Ensembles"],
      icon: Cpu,
      color: "text-purple-400",
      statisticalProfile: {
        avgDetection: "98.1%",
        payloadLimit: "0.1 bpp",
        commonAttack: "CNN Prediction Map"
      },
      datasets: [
        { 
          name: "ALASKA 2.0 (Deep Stack)", 
          description: "Modern gold standard for deep learning steganalysis. Features 75,000 images with advanced adaptive embedding (J-UNIWARD, WOW).", 
          size: "75,000+ IMAGES",
          url: "https://www.kaggle.com/datasets?search=ALASKA2+steganalysis",
          stats: { detection: "98.5%", capacity: "Variable", format: "JPEG" },
          aiInsight: "The definitive benchmark for high-order statistical detection via deep feature ensembles (SRNet)."
        },
        { 
          name: "StegoGAN Dataset (Raw)", 
          description: "Synthetic datasets generated by GANs to evaluate the detection of deep synthetic fingerprints and artifacts.", 
          size: "50,000 IMAGES",
          url: "https://www.kaggle.com/datasets?search=steganalysis",
          stats: { detection: "91.2%", capacity: "0.8 bpp", format: "PNG" },
          aiInsight: "Analyzes the statistical delta between human-designed heuristics and AI-generated stego-patterns."
        },
        { 
          name: "High-Res SZU Research", 
          description: "High-resolution datasets for testing high-capacity deep neural embedding in complex dense image textures.", 
          size: "5,000+ SAMPLES",
          url: "https://www.kaggle.com/datasets?search=steganography",
          stats: { detection: "87.6%", capacity: "1.2 bpp", format: "TIF/PNG" },
          aiInsight: "Explores the limits of CNN-based hiding techniques in large-scale multi-spectral image sources."
        }
      ]
    }

  ];

  return (
    <div className="space-y-12 pb-24">
      <section className="space-y-4">
        <div className="flex items-center gap-4 mb-4">
          <div className="px-3 py-1 bg-[#00FF00]/10 border border-[#00FF00]/20 rounded text-[#00FF00] text-[10px] tracking-[0.2em]">
            RESEARCH_RESOURCES_V2.0
          </div>
          <div className="flex items-center gap-2 text-zinc-600 text-[10px] font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00FF00] animate-pulse" />
            GATEWAY: <a href="https://www.kaggle.com/datasets?search=steganalysis" target="_blank" rel="noopener noreferrer" className="text-[#00FF00] hover:underline">KAG_STEG_REPO</a>
          </div>
        </div>
        <h2 className="text-4xl font-bold tracking-tight text-text-main max-w-2xl leading-tight">
          Image Steganalysis: <span className="text-accent-primary">Methodology Hub</span>
        </h2>
        <p className="text-text-dim max-w-3xl leading-relaxed text-sm">
          Comprehensive access to the benchmarks and protocols cited in "Digital Image Steganalysis: Current Methodologies and Future Challenges". Inspect the datasets used to train the world's most advanced detectors.
        </p>
      </section>

      <div className="grid md:grid-cols-3 gap-6">
        {sections.map((section, idx) => (
          <motion.div 
            key={section.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="p-6 glass-panel rounded-xl hover:border-accent-primary/30 transition-all group relative overflow-hidden"
          >
            <div className={`absolute top-0 right-0 w-32 h-32 opacity-10 blur-3xl rounded-full translate-x-1/2 -translate-y-1/2 bg-current ${section.color}`} />
            
            <div className="flex justify-between items-start mb-6">
              <section.icon className={`w-10 h-10 ${section.color}`} />
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-mono text-text-dim">BENCHMARK</span>
                <span className="text-xs font-bold text-text-main leading-none mt-1">v4.2.0</span>
              </div>
            </div>

            <h3 className="text-accent-primary text-sm font-black tracking-widest mb-3 uppercase">{section.title}</h3>
            <p className="text-xs text-text-dim mb-6 h-12 leading-relaxed">
              {section.description}
            </p>
            
            <div className="flex flex-wrap gap-2 mb-8">
              {section.techs.slice(0, 3).map(t => (
                <span key={t} className="px-2 py-0.5 bg-bg-main/40 border border-border-main rounded text-[9px] text-text-dim font-mono">
                  {t}
                </span>
              ))}
              <span className="px-2 py-0.5 bg-accent-primary/10 border border-accent-primary/20 rounded text-[9px] text-accent-primary font-bold uppercase tracking-tighter">
                {section.datasets.reduce((acc, d) => acc + parseInt(d.size.replace(/,/g, '') || '0'), 0).toLocaleString()}+ SAMPLES
              </span>
            </div>

            <button 
              onClick={() => setActiveProtocol(idx)}
              title={`Read the detailed forensic protocol for ${section.title}.`}
              className="w-full py-3 bg-bg-main/50 hover:bg-accent-primary/10 border border-border-main hover:border-accent-primary/40 rounded-lg text-[10px] text-text-dim hover:text-accent-primary font-bold tracking-widest flex items-center justify-center gap-3 transition-all"
            >
              READ_PROTOCOL <ChevronRight className="w-3 h-3" />
            </button>
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {activeProtocol !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-main/90 backdrop-blur-md"
            onClick={() => setActiveProtocol(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 40 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 40 }}
              className="glass-panel backdrop-blur-xl rounded-2xl w-full max-w-4xl overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.5)]"
              onClick={e => e.stopPropagation()}
            >
              <div className="grid md:grid-cols-12 h-full">
                {/* Protocol Sidebar - Stats */}
                <div className="md:col-span-4 bg-bg-main/40 p-8 border-r border-border-main space-y-8">
                  <div className="space-y-4">
                    <BookOpen className={`w-8 h-8 ${sections[activeProtocol].color}`} />
                    <h3 className="text-xl font-bold text-text-main tracking-widest uppercase">
                      {sections[activeProtocol].title}
                    </h3>
                    <div className="px-2 py-1 bg-accent-primary/5 border border-accent-primary/20 rounded inline-block">
                      <span className="text-[9px] text-accent-primary font-bold uppercase tracking-widest">Statistical Profile</span>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-1">
                      <div className="text-[10px] text-text-dim font-bold uppercase">Detection Threshold</div>
                      <div className="text-lg font-mono text-text-main">{sections[activeProtocol].statisticalProfile.avgDetection}</div>
                      <div className="h-1 bg-border-main rounded-full overflow-hidden">
                        <div className={`h-full bg-blue-400 w-[${sections[activeProtocol].statisticalProfile.avgDetection}]`} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] text-text-dim font-bold uppercase">Payload Capacity</div>
                      <div className="text-lg font-mono text-text-main">{sections[activeProtocol].statisticalProfile.payloadLimit}</div>
                    </div>
                    <div className="space-y-2">
                        <div className="text-[10px] text-text-dim font-bold uppercase">Primary Attack Vector</div>
                        <div className="text-xs font-bold text-accent-primary p-3 bg-accent-primary/5 border border-accent-primary/10 rounded-lg">
                          {sections[activeProtocol].statisticalProfile.commonAttack}
                        </div>
                    </div>
                  </div>

                  <div className="pt-8 border-t border-border-main/50 space-y-4">
                    <div className="text-[9px] text-text-dim font-mono uppercase tracking-widest">Global Master Repository</div>
                    <a 
                      href="https://www.kaggle.com/datasets?search=steganalysis" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-[10px] text-accent-primary hover:underline font-bold"
                    >
                      <ExternalLink className="w-3 h-3" />
                      KAG_STEG_MASTER_INDEX
                    </a>
                  </div>
                </div>

                {/* Main Content - Datasets */}
                <div className="md:col-span-8 p-10 space-y-8 max-h-[85vh] overflow-y-auto custom-scrollbar">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-text-main">Reference Datasets</h4>
                      <p className="text-xs text-text-dim">Verified academic and engineering baseline sets.</p>
                    </div>
                    <button 
                      onClick={() => setActiveProtocol(null)}
                      title="Close protocol overview."
                      className="p-2 hover:bg-text-main/5 rounded-full text-text-dim hover:text-text-main transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="grid gap-6">
                    {sections[activeProtocol].datasets.map((ds, dIdx) => (
                      <motion.div 
                        key={ds.name}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: dIdx * 0.1 }}
                        onClick={() => ds.url && window.open(ds.url, '_blank', 'noopener,noreferrer')}
                        title={`Open dataset source: ${ds.name}`}
                        className="group relative p-6 bg-bg-main/20 border border-border-main hover:border-accent-primary/30 rounded-2xl cursor-pointer transition-all"
                      >
                        <div className="flex justify-between items-start mb-4">
                          <div className="space-y-2">
                             <div className="flex items-center gap-3">
                                <span className="text-base font-black text-text-main group-hover:text-accent-primary transition-colors">{ds.name}</span>
                                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-accent-primary/10 border border-accent-primary/20 rounded tracking-tighter">
                                  <ShieldCheck className="w-2.5 h-2.5 text-accent-primary" />
                                  <span className="text-[8px] font-black text-accent-primary uppercase">VERIFIED_KAG_SOURCE</span>
                                </div>
                                <ExternalLink className="w-3.5 h-3.5 text-text-dim group-hover:text-accent-primary transition-colors" />
                             </div>
                             <div className="flex items-center gap-2">
                                <span className="text-[8px] px-1.5 py-0.5 bg-bg-main border border-border-main text-text-dim font-mono rounded tracking-tighter uppercase">{ds.size}</span>
                                <span className="text-[8px] px-1.5 py-0.5 bg-bg-main border border-border-main text-text-dim font-mono rounded tracking-tighter uppercase">FORMAT: {ds.stats?.format}</span>
                                <span className="text-[8px] px-1.5 py-0.5 bg-accent-primary/10 border border-accent-primary/30 text-accent-primary font-mono rounded tracking-tighter uppercase">REF_ID: KAG_{ds.name.replace(/\s+/g, '_').toUpperCase().slice(0, 10)}</span>
                             </div>
                          </div>
                        </div>

                        <p className="text-xs text-text-dim mb-6 leading-relaxed">
                          {ds.description}
                        </p>

                        <div className="p-4 bg-accent-primary/5 border border-accent-primary/10 rounded-xl">
                          <div className="flex items-center gap-2 mb-2">
                            <Cpu className="w-3 h-3 text-accent-primary" />
                            <span className="text-[9px] font-bold text-accent-primary uppercase tracking-widest">AI_ANALYSIS</span>
                          </div>
                          <p className="text-[10px] text-text-main italic leading-relaxed">
                            "{ds.aiInsight}"
                          </p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <section className="glass-panel backdrop-blur-xl rounded-2xl p-10 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-80 h-80 bg-accent-primary/5 blur-[100px] rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="relative z-10 grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-8">
            <h3 className="text-3xl font-bold text-text-main flex items-center gap-4">
              <ShieldCheck className="text-accent-primary w-10 h-10" />
              Operational Lab
            </h3>
            <p className="text-text-dim leading-relaxed">
              Transition from theory to practice. Our workbench implements spatial LSB matching techniques tested against the BOSSbase benchmarks listed above.
            </p>
            <button 
              onClick={onGoToWorkbench}
              title="Navigate to the operational workbench to begin signal processing."
              className="bg-accent-primary text-bg-main px-8 py-4 rounded-lg font-black text-xs flex items-center gap-4 hover:bg-emerald-500 transition-all transform hover:-translate-y-1 shadow-[0_0_20px_rgba(0,255,0,0.1)] hover:shadow-[0_0_30px_rgba(0,255,0,0.2)] uppercase tracking-widest"
            >
              DEPLOY_WORKBENCH <ArrowRight className="w-5 h-5" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4">
            <div className="p-8 bg-bg-main/40 rounded-2xl border border-border-main hover:border-text-dim transition-colors group flex flex-col justify-center items-center text-center">
              <Database className="w-8 h-8 text-text-dim mb-4 group-hover:text-accent-primary transition-colors" />
              <div className="text-[10px] text-text-dim font-bold uppercase mb-2 tracking-wider">Research Index</div>
              <div className="text-sm font-bold text-text-main">12 Primary Sets</div>
              <div className="text-sm font-bold text-text-main">4M+ Images Indexed</div>
            </div>
          </div>
        </div>
      </section>

      <section className="p-6 bg-bg-main border border-border-main rounded-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Zap className="w-4 h-4 text-accent-primary animate-pulse" />
            <h4 className="text-[10px] font-black text-text-main tracking-[0.3em] uppercase">Resource_Sync_Log</h4>
          </div>
          <span className="text-[9px] font-mono text-text-dim">POLLING_INTERVAL: 500ms</span>
        </div>
        <div className="space-y-1 font-mono text-[9px]">
          <div className="text-text-dim"><span className="text-accent-primary">[OK]</span> LATENCY_CHECK: KAGGLE_API_GATEWAY {"->"} 8ms</div>
          <div className="text-text-dim"><span className="text-accent-primary">[OK]</span> SOURCE_VERIFIED: BOSSBase_1.01_WOW0.4 {"->"} Kaggle_Verified</div>
          <div className="text-text-dim"><span className="text-accent-primary">[OK]</span> SOURCE_VERIFIED: ALASKA_2.0 {"->"} Official_Registry_Confirmed</div>
          <div className="text-text-dim"><span className="text-accent-primary">[OK]</span> HUGGINGFACE_SYNC: ImageNet_Samples {"->"} Active_Pipeline</div>
          <div className="text-text-dim opacity-50 animate-pulse">_LISTENING_FOR_METRIC_CHANGES...</div>
        </div>
      </section>
    </div>
  );
}
