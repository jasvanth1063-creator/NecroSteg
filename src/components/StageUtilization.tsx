import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Activity, Cpu, Zap, Binary, ShieldAlert, Activity as ActivityIcon } from 'lucide-react';

interface MetricProps {
  label: string;
  value: number;
  color: string;
  unit?: string;
}

const Metric = ({ label, value, color, unit = '%' }: MetricProps) => (
  <div className="space-y-2">
    <div className="flex justify-between items-center text-[10px] font-bold tracking-widest text-text-dim uppercase">
      <span>{label}</span>
      <span className="text-text-main">{value.toFixed(1)}{unit}</span>
    </div>
    <div className="h-1 w-full bg-border-main rounded-full overflow-hidden">
      <motion.div 
        initial={{ width: 0 }}
        animate={{ width: `${value}%` }}
        className="h-full bg-current transition-all duration-1000"
        style={{ color }}
      />
    </div>
  </div>
);

interface LEDMatrixProps {
  entropy: number;
  cpu: number;
}

const LEDMatrix = ({ entropy, cpu }: LEDMatrixProps) => {
  const ROWS = 8;
  const COLS = 16;
  
  // Normalise entropy (from 0.7-1.0 range) and CPU (from 0-100 range)
  const entropyColVal = Math.max(0, Math.min(8, Math.round((entropy - 0.7) / 0.3 * 8)));
  const cpuColVal = Math.max(0, Math.min(8, Math.round((cpu / 100) * 8)));

  return (
    <div className="grid gap-[4px] p-2 bg-black/60 rounded-xl border border-border-main/40 shadow-inner" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}>
      {Array.from({ length: ROWS }).map((_, r) => {
        const rowFromBottom = ROWS - 1 - r;
        return Array.from({ length: COLS }).map((_, c) => {
          const isEntropy = c < 8 && rowFromBottom < entropyColVal;
          const isCPU     = c >= 8 && rowFromBottom < cpuColVal;
          const lit = isEntropy || isCPU;
          return (
            <div
              key={`${r}-${c}`}
              className={`w-2.5 h-2.5 rounded-full transition-all duration-500 ${
                lit
                  ? c < 8
                    ? 'bg-accent-primary shadow-[0_0_6px_#00ff00]'
                    : 'bg-sky-400 shadow-[0_0_6px_#38bdf8]'
                  : 'bg-zinc-800 opacity-20'
              }`}
              title={c < 8 ? `Entropy level (Col ${c}, Row ${rowFromBottom})` : `CPU level (Col ${c - 8}, Row ${rowFromBottom})`}
            />
          );
        });
      })}
    </div>
  );
};

export default function StageUtilization() {
  const [cpu, setCpu] = useState(42.5);
  const [mem, setMem] = useState(68.2);
  const [net, setNet] = useState(12.8);
  const [entropy, setEntropy] = useState(0.842);

  useEffect(() => {
    const interval = setInterval(() => {
      setCpu(prev => Math.min(100, Math.max(20, prev + (Math.random() - 0.5) * 5)));
      setMem(prev => Math.min(100, Math.max(40, prev + (Math.random() - 0.5) * 2)));
      setNet(prev => Math.min(100, Math.max(5, prev + (Math.random() - 0.5) * 10)));
      setEntropy(prev => Math.min(1, Math.max(0.7, prev + (Math.random() - 0.5) * 0.05)));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-6 glass-panel rounded-3xl space-y-8 font-mono">
      <div className="flex justify-between items-center">
        <h3 className="text-xs font-black text-text-main uppercase tracking-[0.3em] flex items-center gap-3">
          <ActivityIcon className="w-5 h-5 text-accent-primary" />
          SYSTEM_STAGE_UTILIZATION
        </h3>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-accent-primary animate-pulse" />
          <span className="text-[10px] font-bold text-accent-primary">ACTIVE_SYNC</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8">
        <div className="space-y-6">
          <Metric label="CPU_LOAD" value={cpu} color="#00FF00" />
          <Metric label="MEM_BUFFER" value={mem} color="#0088FF" />
          <Metric label="NET_THROUGHPUT" value={net} color="#FFD700" />
        </div>
        
        <div className="bg-bg-main p-4 rounded-2xl border border-border-main flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 p-2 opacity-10">
            <Binary className="w-12 h-12" />
          </div>
          <div>
            <p className="text-[9px] text-text-dim font-bold uppercase mb-1 tracking-widest">Entropy_Density</p>
            <div className="text-2xl font-black text-accent-primary">{entropy.toFixed(4)}</div>
          </div>
          <div className="flex items-center gap-2 mt-4 text-[9px] font-bold text-green-500/80">
            <Zap className="w-3 h-3" /> STABILITY_NORMAL
          </div>
        </div>
      </div>

      {/* Virtual LED Matrix Telemetry Node */}
      <div className="space-y-3 p-4 bg-bg-main/60 rounded-2xl border border-border-main/50">
        <div className="flex justify-between items-center text-[9px] font-bold tracking-widest text-text-dim uppercase">
          <span>LED_MATRIX // ENTROPY (LEFT) | CPU (RIGHT)</span>
          <span className="text-accent-primary animate-pulse">STREAM_LIVE</span>
        </div>
        <div className="flex justify-center py-1">
          <LEDMatrix entropy={entropy} cpu={cpu} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'LSB_ENG', icon: Binary, val: '0x42A', status: 'OK' },
          { label: 'DCT_ACC', icon: Cpu, val: '98.4%', status: 'HIGH' },
          { label: 'RSA_VAL', icon: ShieldAlert, val: 'PASS', status: 'SECURE' }
        ].map(item => (
          <div key={item.label} className="p-3 bg-bg-main/40 border border-border-main rounded-xl flex flex-col items-center gap-1 group hover:border-accent-primary/40 transition-colors">
            <item.icon className="w-4 h-4 text-text-dim group-hover:text-accent-primary transition-colors" />
            <span className="text-[8px] text-text-dim font-bold uppercase">{item.label}</span>
            <span className="text-[10px] text-text-main font-black">{item.val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
