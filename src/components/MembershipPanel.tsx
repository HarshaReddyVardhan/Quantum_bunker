import React, { useState } from 'react';
import { Copy, Check, Fingerprint } from 'lucide-react';
import { useMembership } from '../useMembership';

interface MembershipPanelProps {
  membership: ReturnType<typeof useMembership>;
  hostSessions: { id: string; name: string }[];
}

const MembershipPanel: React.FC<MembershipPanelProps> = ({ membership, hostSessions }) => {
  const { memberPublicKey, issueInvite, saveToken, tokens } = membership;
  const [codeCopied, setCodeCopied] = useState(false);
  const [memberCode, setMemberCode] = useState('');
  const [vaultId, setVaultId] = useState('');
  const [invite, setInvite] = useState('');
  const [inviteCopied, setInviteCopied] = useState(false);
  const [redeem, setRedeem] = useState('');
  const [redeemMsg, setRedeemMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const copyCode = () => {
    navigator.clipboard.writeText(memberPublicKey);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const generate = () => {
    const sid = (vaultId || hostSessions[0]?.id || '').trim();
    if (!memberCode.trim() || !sid) { setInvite(''); return; }
    try { setInvite(issueInvite(memberCode, sid)); } catch { setInvite(''); }
  };

  const copyInvite = () => {
    if (!invite) return;
    navigator.clipboard.writeText(invite);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  };

  const redeemInvite = () => {
    const token = saveToken(redeem);
    if (!token) { setRedeemMsg({ ok: false, text: 'INVALID_INVITE_TOKEN' }); return; }
    setRedeemMsg({ ok: true, text: `WHITELISTED_FOR ${token.claims.sid.substring(0, 12)}…` });
    setRedeem('');
  };

  return (
    <div className="p-8 glass-panel space-y-6 relative overflow-hidden">
      <div className="flex items-center gap-4 relative z-10">
        <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
          <Fingerprint size={24} />
        </div>
        <div>
          <h3 className="text-base font-mono font-bold text-slate-900 dark:text-white uppercase tracking-widest">Whitelist</h3>
          <p className="text-[11px] text-slate-500 font-mono mt-0.5 uppercase tracking-tighter">Stateless membership — chat anytime, zero storage</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-10">
        <div className="space-y-2">
          <label className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">Your_Member_Code</label>
          <div className="flex gap-2">
            <div className="flex-1 bg-black/[0.02] dark:bg-black/40 border border-black/10 dark:border-white/10 px-3 py-2.5 text-[9px] font-mono text-emerald-600 dark:text-emerald-400/80 break-all leading-relaxed">{memberPublicKey}</div>
            <button onClick={copyCode} title="Copy member code" className="w-10 shrink-0 flex items-center justify-center border border-black/10 dark:border-white/10 text-slate-400 hover:text-emerald-500 hover:border-emerald-500/40 transition-all">
              {codeCopied ? <Check size={12} /> : <Copy size={12} />}
            </button>
          </div>
          <p className="text-[8px] font-mono text-slate-400 uppercase tracking-tighter">Share with a host to be whitelisted</p>
        </div>

        <div className="space-y-2">
          <label className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">Issue_Invite <span className="text-slate-400">(host)</span></label>
          <input value={memberCode} onChange={(e) => setMemberCode(e.target.value)} placeholder="MEMBER_CODE" className="w-full bg-black/[0.02] dark:bg-black/40 border border-black/10 dark:border-white/10 px-3 py-2.5 text-[10px] font-mono text-cyan-600 dark:text-cyan-400 placeholder:text-slate-400 dark:placeholder:text-slate-700 outline-none focus:border-emerald-500/50" />
          {hostSessions.length > 0 ? (
            <select value={vaultId || hostSessions[0]?.id} onChange={(e) => setVaultId(e.target.value)} className="w-full bg-black/[0.02] dark:bg-black/40 border border-black/10 dark:border-white/10 px-3 py-2.5 text-[10px] font-mono text-cyan-600 dark:text-cyan-400 outline-none focus:border-emerald-500/50">
              {hostSessions.map(s => <option key={s.id} value={s.id}>{(s.name || s.id.substring(0, 8))} — {s.id.substring(0, 8)}…</option>)}
            </select>
          ) : (
            <input value={vaultId} onChange={(e) => setVaultId(e.target.value)} placeholder="VAULT_HASH_ID" className="w-full bg-black/[0.02] dark:bg-black/40 border border-black/10 dark:border-white/10 px-3 py-2.5 text-[10px] font-mono text-cyan-600 dark:text-cyan-400 placeholder:text-slate-400 dark:placeholder:text-slate-700 outline-none focus:border-emerald-500/50" />
          )}
          <button onClick={generate} disabled={!memberCode.trim()} className="w-full h-9 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40 font-mono font-bold text-[10px] uppercase tracking-widest transition-all disabled:opacity-30">
            Generate_Invite
          </button>
          {invite && (
            <div className="flex gap-2">
              <div className="flex-1 bg-black/[0.02] dark:bg-black/40 border border-emerald-500/20 px-3 py-2 text-[8px] font-mono text-emerald-600 dark:text-emerald-400/80 break-all max-h-16 overflow-y-auto custom-scrollbar">{invite}</div>
              <button onClick={copyInvite} title="Copy invite" className="w-10 shrink-0 flex items-center justify-center border border-emerald-500/30 text-slate-400 hover:text-emerald-500 transition-all">
                {inviteCopied ? <Check size={12} /> : <Copy size={12} />}
              </button>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">Redeem_Invite <span className="text-slate-400">(member)</span></label>
          <textarea value={redeem} onChange={(e) => setRedeem(e.target.value)} placeholder="PASTE_INVITE_TOKEN" rows={3} className="w-full bg-black/[0.02] dark:bg-black/40 border border-black/10 dark:border-white/10 px-3 py-2.5 text-[9px] font-mono text-cyan-600 dark:text-cyan-400 placeholder:text-slate-400 dark:placeholder:text-slate-700 outline-none focus:border-emerald-500/50 resize-none custom-scrollbar" />
          <button onClick={redeemInvite} disabled={!redeem.trim()} className="w-full h-9 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40 font-mono font-bold text-[10px] uppercase tracking-widest transition-all disabled:opacity-30">
            Save_Membership
          </button>
          {redeemMsg && <p className={`text-[8px] font-mono uppercase tracking-tighter ${redeemMsg.ok ? 'text-emerald-500' : 'text-red-500'}`}>{redeemMsg.text}</p>}
          <p className="text-[8px] font-mono text-slate-400 uppercase tracking-tighter">{Object.keys(tokens).length} active membership(s)</p>
        </div>
      </div>
    </div>
  );
};

export default MembershipPanel;
