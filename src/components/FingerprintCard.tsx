import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

const FingerprintCard: React.FC<{ label: string; fp: string | null }> = ({ label, fp }) => {
  const [copied, setCopied] = useState(false);
  const formatted = fp ? fp.match(/.{1,4}/g)?.join(' ') ?? fp : null;
  const copy = () => {
    if (!fp) return;
    navigator.clipboard.writeText(fp);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="p-2.5 border border-black/5 dark:border-white/5 bg-white dark:bg-black/20 space-y-1.5 group">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">{label}</span>
        <button onClick={copy} className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-cyan-500">
          {copied ? <Check size={10} /> : <Copy size={10} />}
        </button>
      </div>
      <div className="text-[8px] font-mono text-cyan-600 dark:text-cyan-400/80 break-all leading-relaxed tracking-wider">
        {formatted ?? <span className="text-slate-400 italic">pending…</span>}
      </div>
    </div>
  );
};

export default FingerprintCard;
