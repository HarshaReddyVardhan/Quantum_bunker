import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, Send, Plus, LogIn, Copy, Check, Info, Trash2, ShieldCheck, ShieldAlert, Fingerprint, Radio, Server, Activity, Terminal, Sun, Moon, Menu, X, Share2, QrCode } from 'lucide-react';
import QRCode from 'qrcode';
import { useRelay } from './useRelay';
import { useSession } from './useSession';
import { useMembership } from './useMembership';

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('qb-theme');
    return (saved as 'light' | 'dark') || 'dark';
  });
  const [view, setView] = useState<'home' | 'chat'>(() => {
    return sessionStorage.getItem('qb-sessionId') ? 'chat' : 'home';
  });
  const [isCreating, setIsCreating] = useState(false);
  const [joinId, setJoinId] = useState('');
  const [joinMsg, setJoinMsg] = useState('');
  const [securityOptions, setSecurityOptions] = useState({
    blur: true,
    antiCapture: false
  });
  const [isFocused, setIsFocused] = useState(document.hasFocus());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [createSessionName, setCreateSessionName] = useState('');

  const {
    sessionId, sessionName, peerId, isHost, expiresAt, timeLeft, isExpired, savedSessions,
    createSession: initSession, joinSession: connectSession, resetSession, destroySession
  } = useSession();

  const membership = useMembership();

  useEffect(() => {
    localStorage.setItem('qb-theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    const handleFocus = () => setIsFocused(true);
    const handleBlur = () => setIsFocused(false);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.key === 'Meta' || e.key === 'PrintScreen') setIsFocused(false);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.metaKey && e.key !== 'Meta' && e.key !== 'PrintScreen' && document.hasFocus()) setIsFocused(true);
    };
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    const joinMatch = window.location.pathname.match(/^\/join\/([^/]+)$/);
    if (joinMatch) { setJoinId(joinMatch[1].trim()); window.history.replaceState({}, '', '/'); return; }
    const vault = new URLSearchParams(window.location.search).get('vault');
    if (vault) { setJoinId(vault.trim()); window.history.replaceState({}, '', window.location.pathname); }
  }, []);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');
  const handleCreate = async () => {
    setIsCreating(true);
    // Bind this device's host identity to the vault so it can issue whitelist
    // invites that the server verifies statelessly.
    try { await initSession(createSessionName, membership.hostPublicKey); setView('chat'); }
    catch { alert('Failed to create session'); }
    finally { setIsCreating(false); }
  };
  const handleJoin = async (id: string) => {
    try { localStorage.setItem('qb-join-msg', joinMsg || 'Hello'); await connectSession(id); setView('chat'); }
    catch { alert('Vault not found or expired.'); }
  };
  const reset = () => { resetSession(); setView('home'); };
  const handleDestroy = () => { destroySession(); setView('home'); };

  return (
    <div className={`h-screen w-full ${theme === 'dark' ? 'dark' : ''} bg-ui-bg dark:bg-brand-bg text-ui-text dark:text-slate-300 font-sans selection:bg-cyan-500/30 flex flex-col overflow-hidden`}>
      {(!isFocused && view === 'chat') && <div className="fixed inset-0 bg-black z-[99999] pointer-events-none flex items-center justify-center" />}
      
      <header className="h-16 border-b border-black/5 dark:border-white/10 flex items-center justify-between px-4 sm:px-6 bg-ui-elevated dark:bg-brand-elevated shrink-0 z-50">
        <div className="flex items-center gap-2 sm:gap-3 cursor-pointer" onClick={reset}>
          <div className="w-6 h-6 sm:w-8 sm:h-8 bg-cyan-500/20 border border-cyan-500/50 flex items-center justify-center">
            <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-cyan-400" />
          </div>
          <span className="font-mono font-bold tracking-widest text-slate-900 dark:text-white uppercase sm:text-base text-[10px]">
            QUANTUM_BUNKER <span className="text-cyan-500 text-[10px] font-normal ml-2 opacity-70 hidden md:inline">v1.0.4-RELAY</span>
          </span>
        </div>
        <div className="flex items-center gap-3 sm:gap-6">
          <div className="hidden md:flex items-center gap-4 border-r border-black/10 dark:border-white/10 pr-4 sm:pr-6">
            <label className="flex items-center gap-1.5 cursor-pointer group" title="Enable Message Blurring (Hover to reveal)">
              <input type="checkbox" checked={securityOptions.blur} onChange={(e) => setSecurityOptions(prev => ({...prev, blur: e.target.checked}))} className="accent-cyan-500 w-3 h-3 cursor-pointer" />
              <span className="text-[10px] font-mono text-slate-500 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors uppercase">Blur</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer group" title="Enable Anti-Capture Mode (Disrupts cameras)">
              <input type="checkbox" checked={securityOptions.antiCapture} onChange={(e) => setSecurityOptions(prev => ({...prev, antiCapture: e.target.checked}))} className="accent-amber-500 w-3 h-3 cursor-pointer" />
              <span className="text-[10px] font-mono text-slate-500 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors uppercase">Anti-Capture</span>
            </label>
          </div>
          <button onClick={toggleTheme} className="p-1.5 sm:p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-500 dark:text-slate-400 transition-colors" title="Toggle theme">
            {theme === 'light' ? <Moon size={16} className="sm:w-[18px] sm:h-[18px]" /> : <Sun size={16} className="sm:w-[18px] sm:h-[18px]" />}
          </button>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-mono tracking-tighter uppercase hidden lg:block">Relay Node: AIS-DEFAULT</span>
          </div>
          {view === 'chat' && (
            <button onClick={handleDestroy} className="px-2 sm:px-4 py-1.5 border border-black/10 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/5 text-[10px] font-mono transition-colors text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white uppercase flex items-center gap-2">
              <Trash2 size={12} /><span className="hidden sm:inline">Destroy_Session</span>
            </button>
          )}
          <button className="md:hidden p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-500 dark:text-slate-400" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            <Menu size={18} />
          </button>
        </div>
      </header>

      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="md:hidden border-b border-black/5 dark:border-white/10 bg-ui-elevated dark:bg-brand-elevated px-4 py-4 flex flex-col gap-4 overflow-hidden z-40">
            <div className="flex flex-col gap-3">
              <span className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-widest">Security Settings</span>
              <label className="flex items-center gap-2 cursor-pointer group">
                <input type="checkbox" checked={securityOptions.blur} onChange={(e) => setSecurityOptions(prev => ({...prev, blur: e.target.checked}))} className="accent-cyan-500 w-4 h-4 cursor-pointer" />
                <span className="text-xs font-mono text-slate-600 dark:text-slate-300 uppercase">Message Blurring</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer group">
                <input type="checkbox" checked={securityOptions.antiCapture} onChange={(e) => setSecurityOptions(prev => ({...prev, antiCapture: e.target.checked}))} className="accent-amber-500 w-4 h-4 cursor-pointer" />
                <span className="text-xs font-mono text-slate-600 dark:text-slate-300 uppercase">Anti-Capture Mode</span>
              </label>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 flex overflow-hidden relative">
        <AnimatePresence mode="wait">
          {view === 'home' ? (
            <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 overflow-y-auto custom-scrollbar relative bg-ui-bg dark:bg-brand-bg">
              <div className="absolute inset-0 bg-grid-pattern opacity-[0.03] dark:opacity-[0.05] pointer-events-none" />
              <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-cyan-500/5 to-transparent pointer-events-none" />
              <div className="scanline" />
              <div className="relative z-10 max-w-[1400px] mx-auto px-6 py-12 lg:py-20 flex flex-col gap-16">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-end">
                  <div className="lg:col-span-8 space-y-6">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-600 dark:text-cyan-400 text-[10px] font-mono uppercase tracking-[0.2em] animate-pulse">
                      <ShieldCheck size={14} />Quantum Hardened Security_
                    </div>
                    <h1 className="text-6xl sm:text-8xl font-black tracking-tighter leading-[0.9] text-slate-900 dark:text-white">BUNKER <br /><span className="text-cyan-500 italic opacity-80">PROTOCOL.</span></h1>
                    <p className="text-slate-500 dark:text-slate-500 text-xl leading-relaxed max-w-xl font-mono italic">Stateless message routing. Ephemeral handshakes. <br /><span className="text-slate-400 dark:text-slate-600">No logs. No storage. No traces.</span></p>
                  </div>
                  <div className="lg:col-span-4 hidden lg:block pb-2">
                    <div className="flex flex-col gap-4 border-l-2 border-cyan-500/30 pl-6">
                      <div className="flex items-center gap-4"><Activity size={16} className="text-cyan-500" /><span className="text-[10px] font-mono text-slate-500 uppercase">Relay_Node: ACTIVE</span></div>
                      <div className="flex items-center gap-4"><ShieldCheck size={16} className="text-emerald-500" /><span className="text-[10px] font-mono text-slate-500 uppercase">Encryption: Noise_XX</span></div>
                      <div className="flex items-center gap-4"><Terminal size={16} className="text-amber-500" /><span className="text-[10px] font-mono text-slate-500 uppercase">Uptime: 99.998%</span></div>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
                  <div className="xl:col-span-8 space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="group p-8 glass-panel hover:border-cyan-500/50 transition-all duration-500 flex flex-col gap-6 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 blur-3xl group-hover:bg-cyan-500/10 transition-colors" />
                        <div className="flex items-center gap-4 relative z-10">
                          <div className="w-12 h-12 bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-600 dark:text-cyan-400"><Plus size={24} /></div>
                          <div><h3 className="text-base font-mono font-bold text-slate-900 dark:text-white uppercase tracking-widest">Init_Vault</h3><p className="text-[11px] text-slate-500 font-mono mt-0.5 uppercase tracking-tighter">Spawn unique relay hash</p></div>
                        </div>
                        <div className="space-y-4 relative z-10">
                          <input type="text" value={createSessionName} onChange={(e) => setCreateSessionName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }} placeholder="VAULT_LABEL (OPTIONAL)" className="w-full bg-black/[0.02] dark:bg-black/40 border border-black/10 dark:border-white/10 px-4 py-3 text-xs font-mono text-cyan-600 dark:text-cyan-400 placeholder:text-slate-400 dark:placeholder:text-slate-800 outline-none focus:border-cyan-500/50" />
                          <button onClick={handleCreate} disabled={isCreating} className="w-full h-12 bg-cyan-600 hover:bg-cyan-500 dark:bg-cyan-500/20 dark:hover:bg-cyan-500/30 text-white dark:text-cyan-400 border border-cyan-500/50 font-mono font-bold text-xs uppercase transition-all tracking-widest flex items-center justify-center gap-2">
                            {isCreating ? 'PROCESS_INIT...' : 'CREATE_BUNKER'}
                          </button>
                        </div>
                      </div>
                      <div className="group p-8 glass-panel hover:border-cyan-500/50 transition-all duration-500 flex flex-col gap-6 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-slate-500/5 blur-3xl group-hover:bg-cyan-500/10 transition-colors" />
                        <div className="flex items-center gap-4 relative z-10">
                          <div className="w-12 h-12 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-center justify-center text-slate-400"><LogIn size={24} /></div>
                          <div><h3 className="text-base font-mono font-bold text-slate-900 dark:text-white uppercase tracking-widest">Enter_Vault</h3><p className="text-[11px] text-slate-500 font-mono mt-0.5 uppercase tracking-tighter">Join via existing hash</p></div>
                        </div>
                        <div className="space-y-3 relative z-10">
                          <input type="text" value={joinId} onChange={(e) => setJoinId(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && joinId.trim()) handleJoin(joinId); }} placeholder="VAULT_HASH_ID" className="w-full bg-black/[0.02] dark:bg-black/40 border border-black/10 dark:border-white/10 px-4 py-3 text-xs font-mono text-cyan-600 dark:text-cyan-400 placeholder:text-slate-400 dark:placeholder:text-slate-800 outline-none focus:border-cyan-500/50" />
                          <div className="flex gap-2">
                            <input type="text" value={joinMsg} onChange={(e) => setJoinMsg(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && joinId.trim()) handleJoin(joinId); }} placeholder="IDENT_TAG" className="flex-1 bg-black/[0.02] dark:bg-black/40 border border-black/10 dark:border-white/10 px-4 py-3 text-xs font-mono text-cyan-600 dark:text-cyan-400 placeholder:text-slate-400 dark:placeholder:text-slate-800 outline-none focus:border-cyan-500/50" />
                            <button onClick={() => handleJoin(joinId)} disabled={!joinId.trim()} className="bg-slate-900 dark:bg-white text-white dark:text-black font-mono font-bold text-[10px] uppercase px-6 hover:bg-cyan-600 dark:hover:bg-cyan-400 transition-all disabled:opacity-30">
                              {savedSessions.some(s => s.id === joinId.trim()) ? 'RECONNECT' : 'JOIN'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {[{ icon: ShieldCheck, title: 'Zero Storage', desc: 'No messages ever touch a disk. Pure volatile memory routing.' }, { icon: Lock, title: 'End-to-End', desc: 'Noise Protocol XX handshake ensures absolute privacy between peers.' }, { icon: Activity, title: 'Auto Decay', desc: 'Sessions self-destruct after inactivity. No traces left behind.' }].map((item, i) => (
                        <div key={i} className="p-5 border border-black/5 dark:border-white/5 bg-black/[0.01] dark:bg-white/[0.01] space-y-3">
                          <item.icon size={18} className="text-cyan-500/50" />
                          <h4 className="text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest">{item.title}</h4>
                          <p className="text-[10px] font-mono text-slate-500 leading-relaxed uppercase tracking-tighter">{item.desc}</p>
                        </div>
                      ))}
                    </div>
                    <MembershipPanel membership={membership} hostSessions={savedSessions.filter(s => s.role === 'host')} />
                  </div>
                  <div className="xl:col-span-4 space-y-6">
                    <div className="h-full flex flex-col p-8 glass-panel min-h-[400px]">
                      <h3 className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />Active_Vault_History</h3>
                      <div className="flex-1 space-y-3 custom-scrollbar pr-2">
                        {savedSessions.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center text-center py-12 space-y-4 opacity-40"><Activity size={32} className="text-slate-400" /><p className="text-[10px] font-mono text-slate-400 italic uppercase tracking-tighter">History_Buffer_Empty</p></div>
                        ) : (savedSessions.map((session) => (
                          <div key={session.id} className="flex gap-2 w-full">
                            <button onClick={() => handleJoin(session.id)} className="flex-1 text-left p-4 border border-black/5 dark:border-white/5 bg-white dark:bg-black/20 hover:border-cyan-500/30 hover:bg-cyan-500/5 transition-all group min-w-0">
                              <div className="flex justify-between items-start mb-2">
                                <span className="text-xs font-mono font-bold text-slate-900 dark:text-white truncate pr-2 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">{session.name || session.id.substring(0, 8)}</span>
                                <span className={`text-[8px] font-mono px-2 py-0.5 rounded-sm ${session.role === 'host' ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'}`}>{session.role.toUpperCase()}</span>
                              </div>
                              <div className="text-[9px] font-mono text-slate-500 flex items-center gap-2"><span className="opacity-50">HASH:</span><span className="text-cyan-600/70 dark:text-cyan-400/50 truncate">{session.id.substring(0, 12)}...</span></div>
                              <div className="mt-2 flex items-center justify-between">
                                <div className="text-[8px] font-mono text-slate-400 flex items-center gap-1.5"><Activity size={8} />{new Date(session.lastJoined).toLocaleString()}</div>
                                <span className="text-[9px] font-mono font-bold text-cyan-600 dark:text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity uppercase border border-cyan-500/30 px-2 py-0.5 bg-cyan-500/10">Reconnect</span>
                              </div>
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); destroySession(session.id); }} title="Destroy Session" className="w-12 flex items-center justify-center border border-black/5 dark:border-white/5 bg-white dark:bg-black/20 hover:border-red-500/30 hover:bg-red-500/10 text-slate-400 hover:text-red-500 transition-all shrink-0"><Trash2 size={14} /></button>
                          </div>
                        )))}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col md:flex-row justify-between items-center gap-4 pt-8 border-t border-black/5 dark:border-white/5 text-[9px] font-mono text-slate-400 uppercase tracking-[0.2em]">
                  <div className="flex gap-8"><span>STATUS: ALL_SYSTEMS_GO</span><span className="hidden sm:inline">LATENCY: OPTIMAL</span></div>
                  <div className="flex gap-8"><span>LOAD: 0.0012%</span><span className="text-cyan-500/50">SECURE_TUNNEL_READY</span></div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex overflow-hidden">
              <ChatRoom sessionId={sessionId!} sessionName={sessionName} peerId={peerId!} isHost={isHost} expiresAt={expiresAt} timeLeft={timeLeft} isExpired={isExpired} securityOptions={securityOptions} reset={reset} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="h-8 border-t border-black/5 dark:border-white/10 bg-ui-elevated dark:bg-brand-elevated px-4 flex items-center justify-between text-[10px] font-mono shrink-0">
        <div className="flex gap-6">
          <span className="hidden sm:inline">ENCRYPTION: <span className="text-slate-900 dark:text-white uppercase">Noise_XX + DoubleRatchet</span></span>
          <span>TRANSPORT: <span className="text-slate-900 dark:text-white">WSS/1.1</span></span>
        </div>
        <div className="flex gap-4">
          <span className="text-slate-500 hidden md:inline uppercase tracking-tighter">Contract: v1.0.4</span>
          <span className="text-emerald-500 dark:text-emerald-500 flex items-center gap-1.5 uppercase font-bold"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Node_Stable</span>
        </div>
      </footer>
    </div>
  );
}

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

  const copyCode = () => { navigator.clipboard.writeText(memberPublicKey); setCodeCopied(true); setTimeout(() => setCodeCopied(false), 2000); };

  const generate = () => {
    const sid = (vaultId || hostSessions[0]?.id || '').trim();
    if (!memberCode.trim() || !sid) { setInvite(''); return; }
    try { setInvite(issueInvite(memberCode, sid)); } catch { setInvite(''); }
  };

  const copyInvite = () => { if (!invite) return; navigator.clipboard.writeText(invite); setInviteCopied(true); setTimeout(() => setInviteCopied(false), 2000); };

  const redeemInvite = () => {
    const token = saveToken(redeem);
    if (!token) { setRedeemMsg({ ok: false, text: 'INVALID_INVITE_TOKEN' }); return; }
    setRedeemMsg({ ok: true, text: `WHITELISTED_FOR ${token.claims.sid.substring(0, 12)}…` });
    setRedeem('');
  };

  return (
    <div className="p-8 glass-panel space-y-6 relative overflow-hidden">
      <div className="flex items-center gap-4 relative z-10">
        <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400"><Fingerprint size={24} /></div>
        <div><h3 className="text-base font-mono font-bold text-slate-900 dark:text-white uppercase tracking-widest">Whitelist</h3><p className="text-[11px] text-slate-500 font-mono mt-0.5 uppercase tracking-tighter">Stateless membership — chat anytime, zero storage</p></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-10">
        <div className="space-y-2">
          <label className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">Your_Member_Code</label>
          <div className="flex gap-2">
            <div className="flex-1 bg-black/[0.02] dark:bg-black/40 border border-black/10 dark:border-white/10 px-3 py-2.5 text-[9px] font-mono text-emerald-600 dark:text-emerald-400/80 break-all leading-relaxed">{memberPublicKey}</div>
            <button onClick={copyCode} title="Copy member code" className="w-10 shrink-0 flex items-center justify-center border border-black/10 dark:border-white/10 text-slate-400 hover:text-emerald-500 hover:border-emerald-500/40 transition-all">{codeCopied ? <Check size={12} /> : <Copy size={12} />}</button>
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
          <button onClick={generate} disabled={!memberCode.trim()} className="w-full h-9 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40 font-mono font-bold text-[10px] uppercase tracking-widest transition-all disabled:opacity-30">Generate_Invite</button>
          {invite && (
            <div className="flex gap-2">
              <div className="flex-1 bg-black/[0.02] dark:bg-black/40 border border-emerald-500/20 px-3 py-2 text-[8px] font-mono text-emerald-600 dark:text-emerald-400/80 break-all max-h-16 overflow-y-auto custom-scrollbar">{invite}</div>
              <button onClick={copyInvite} title="Copy invite" className="w-10 shrink-0 flex items-center justify-center border border-emerald-500/30 text-slate-400 hover:text-emerald-500 transition-all">{inviteCopied ? <Check size={12} /> : <Copy size={12} />}</button>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">Redeem_Invite <span className="text-slate-400">(member)</span></label>
          <textarea value={redeem} onChange={(e) => setRedeem(e.target.value)} placeholder="PASTE_INVITE_TOKEN" rows={3} className="w-full bg-black/[0.02] dark:bg-black/40 border border-black/10 dark:border-white/10 px-3 py-2.5 text-[9px] font-mono text-cyan-600 dark:text-cyan-400 placeholder:text-slate-400 dark:placeholder:text-slate-700 outline-none focus:border-emerald-500/50 resize-none custom-scrollbar" />
          <button onClick={redeemInvite} disabled={!redeem.trim()} className="w-full h-9 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40 font-mono font-bold text-[10px] uppercase tracking-widest transition-all disabled:opacity-30">Save_Membership</button>
          {redeemMsg && <p className={`text-[8px] font-mono uppercase tracking-tighter ${redeemMsg.ok ? 'text-emerald-500' : 'text-red-500'}`}>{redeemMsg.text}</p>}
          <p className="text-[8px] font-mono text-slate-400 uppercase tracking-tighter">{Object.keys(tokens).length} active membership(s)</p>
        </div>
      </div>
    </div>
  );
};

const FingerprintCard: React.FC<{ label: string; fp: string | null }> = ({ label, fp }) => {
  const [copied, setCopied] = useState(false);
  const formatted = fp ? fp.match(/.{1,4}/g)?.join(' ') ?? fp : null;
  const copy = () => { if (!fp) return; navigator.clipboard.writeText(fp); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div className="p-2.5 border border-black/5 dark:border-white/5 bg-white dark:bg-black/20 space-y-1.5 group">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">{label}</span>
        <button onClick={copy} className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-cyan-500">{copied ? <Check size={10} /> : <Copy size={10} />}</button>
      </div>
      <div className="text-[8px] font-mono text-cyan-600 dark:text-cyan-400/80 break-all leading-relaxed tracking-wider">{formatted ?? <span className="text-slate-400 italic">pending…</span>}</div>
    </div>
  );
};

interface ChatRoomProps {
  sessionId: string; sessionName: string | null; peerId: string; isHost: boolean;
  expiresAt: number | null; timeLeft: string; isExpired: boolean;
  securityOptions: { blur: boolean; antiCapture: boolean }; reset: () => void;
}

function ChatRoom({ sessionId, sessionName, peerId, isHost, expiresAt, timeLeft, isExpired, securityOptions, reset }: ChatRoomProps) {
  const { messages, isConnected, isPending, activePeers, joinRequests, error, isGroup, sendMessage, sendTyping, markAsRead, acceptJoin, rejectJoin, kickPeer, latencyMs, ioLoad, peerAliases, typingPeers, secured, safetyNumbers, fingerprints, ownFingerprint, p2pPeers, transport } = useRelay(sessionId, peerId);
  const [input, setInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [logs, setLogs] = useState<{ t: string; msg: string; color: string }[]>([]);
  const [showLeftSidebar, setShowLeftSidebar] = useState(false);
  const [showRightSidebar, setShowRightSidebar] = useState(false);
  const shareLink = `${window.location.origin}/join/${sessionId}`;
  const displayName = (id: string) => peerAliases[id] || id.replace('peer-', 'PEER_');

  useEffect(() => { QRCode.toDataURL(shareLink, { margin: 1, width: 240, color: { dark: '#0a0a0a', light: '#ffffff' } }).then(setQrDataUrl).catch(() => setQrDataUrl('')); }, [shareLink]);
  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => {
    const addLog = (msg: string, color: string = 'text-slate-500') => { setLogs(prev => [...prev.slice(-20), { t: new Date().toLocaleTimeString([], { hour12: false }), msg, color }]); };
    if (isConnected) addLog('WS_CONNECT: [ESTABLISHED]', 'text-emerald-600 dark:text-emerald-500');
    if (error) { addLog(`ERR: ${error}`, 'text-red-500'); if (error.match(/Session destroyed|Join rejected|kicked/)) setTimeout(reset, 2000); }
  }, [isConnected, error, reset]);

  const handleSend = (e: React.FormEvent) => { e.preventDefault(); if (!input.trim()) return; sendMessage(input); setInput(''); };
  const copyId = () => { if (!isConnected) return; navigator.clipboard.writeText(sessionId); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const copyShareLink = () => { navigator.clipboard.writeText(shareLink); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); };

  return (
    <>
      {(showLeftSidebar || showRightSidebar) && <div className="fixed inset-0 bg-black/60 z-[60] lg:hidden backdrop-blur-sm transition-opacity" onClick={() => { setShowLeftSidebar(false); setShowRightSidebar(false); }} />}
      
      {/* Left Sidebar: scrollable on both desktop and mobile */}
      <aside className={`w-72 lg:w-72 border-r border-black/5 dark:border-white/5 bg-ui-aside dark:bg-brand-aside p-6 flex flex-col gap-8 shrink-0 z-[70] overflow-y-auto ${showLeftSidebar ? 'fixed inset-y-0 left-0 shadow-2xl' : 'hidden lg:flex'}`}>
        <button onClick={() => setShowLeftSidebar(false)} className="lg:hidden absolute top-4 right-4 text-slate-500 hover:text-slate-900 dark:hover:text-white"><X size={20} /></button>
        <section>
          <h3 className="mono-label mb-4 uppercase tracking-widest font-bold">Active Session</h3>
          <div className="space-y-4">
            <div className="p-3 bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 shadow-sm dark:shadow-none group cursor-pointer" onClick={copyId}>
              <div className="flex items-center justify-between mb-1">
                <div className="text-[10px] text-slate-500 font-mono uppercase">{sessionName ? 'Vault_Name' : 'Vault_Hash'}</div>
                <div className="flex items-center gap-2">{isGroup && <span className="text-[8px] bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 px-1 rounded-sm uppercase">GROUP</span>}{copied ? <Check size={10} className="text-emerald-500" /> : <Copy size={10} className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />}</div>
              </div>
              <div className="font-mono text-[11px] text-cyan-600 dark:text-cyan-400 break-all leading-tight italic truncate">{sessionName || sessionId}</div>
              {sessionName && <div className="text-[9px] text-slate-500 font-mono truncate mt-1">ID: {sessionId}</div>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 border border-black/5 dark:border-white/5 bg-white dark:bg-white/5 shadow-sm dark:shadow-none"><div className="text-[9px] text-slate-500 font-mono text-center">PEER</div><div className="text-xs font-mono text-slate-900 dark:text-white text-center uppercase">{peerId?.replace('peer-', '') || ''}</div></div>
              <div className="p-2 border border-black/5 dark:border-white/5 bg-white dark:bg-white/5 shadow-sm dark:shadow-none"><div className="text-[9px] text-slate-500 font-mono text-center">STATUS</div><div className={`text-[10px] font-mono text-center font-bold ${isConnected ? 'text-emerald-600 dark:text-emerald-500' : 'text-red-500'}`}>{isConnected ? 'ONLINE' : 'OFFLINE'}</div></div>
            </div>
            {expiresAt && (
              <div className="p-3 bg-black/[0.02] dark:bg-white/5 border border-black/5 dark:border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2"><div className={`w-1.5 h-1.5 rounded-full ${isExpired ? 'bg-red-500' : 'bg-cyan-500'}`} /><span className="text-[9px] text-slate-500 font-mono uppercase">Decay_Timer</span></div>
                <span className={`text-[11px] font-mono font-bold ${isExpired ? 'text-red-500' : 'text-cyan-600 dark:text-cyan-400'}`}>{timeLeft}</span>
              </div>
            )}
          </div>
        </section>
        <section>
          <h3 className="mono-label mb-4 uppercase tracking-widest font-bold flex items-center gap-2"><QrCode size={12} /> Share Vault</h3>
          <div className="space-y-3">
            {qrDataUrl && <div className="p-3 bg-white border border-black/5 dark:border-white/10 flex items-center justify-center"><img src={qrDataUrl} alt="Vault join QR code" className="w-full max-w-[180px] aspect-square" /></div>}
            <button onClick={copyShareLink} className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-cyan-500/30 bg-cyan-500/5 hover:bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 text-[10px] font-mono uppercase tracking-widest transition-colors">{linkCopied ? <><Check size={12} /> Link_Copied</> : <><Share2 size={12} /> Copy_Share_Link</>}</button>
            <p className="text-[9px] font-mono text-slate-500 italic uppercase tracking-tighter leading-relaxed text-center">Scan or share to auto-fill the vault hash</p>
          </div>
        </section>
        <section>
          <h3 className="mono-label mb-4 uppercase tracking-widest font-bold">Relay Interface</h3>
          <ul className="space-y-3">
            <li className="flex items-center justify-between text-[11px]"><span className="font-mono text-slate-500 dark:text-slate-400">ENVELOPE_TYPE</span><span className="text-emerald-600 dark:text-emerald-500">LOCKED</span></li>
            <li className="flex items-center justify-between text-[11px]"><span className="font-mono text-slate-500 dark:text-slate-400">SESSION_MEMORY</span><span className="text-slate-700 dark:text-slate-200 uppercase">Ephem</span></li>
            <li className="flex items-center justify-between text-[11px]"><span className="font-mono text-slate-500 dark:text-slate-400">ZERO_KNOWLEDGE</span><span className="text-emerald-600 dark:text-emerald-500 font-bold italic">ACTIVE</span></li>
            <li className="flex items-center justify-between text-[11px]"><span className="font-mono text-slate-500 dark:text-slate-400">MSG_CRYPTO</span><span className="text-cyan-600 dark:text-cyan-400 font-bold">DoubleRatchet</span></li>
          </ul>
        </section>
        <section>
          <h3 className="mono-label mb-4 uppercase tracking-widest font-bold flex items-center gap-2"><Fingerprint size={12} /> Key Fingerprints</h3>
          <div className="space-y-3">
            <FingerprintCard label="YOU" fp={ownFingerprint} />
            {Object.keys(fingerprints).map(id => <FingerprintCard key={id} label={peerAliases[id] || id.replace('peer-', 'PEER_')} fp={fingerprints[id]} />)}
            {Object.keys(fingerprints).length === 0 && <p className="text-[9px] font-mono text-slate-400 italic uppercase tracking-tighter">Peer fingerprints appear after handshake</p>}
          </div>
        </section>
        {isHost && joinRequests.length > 0 && (
          <section>
            <h3 className="mono-label mb-4 uppercase tracking-widest font-bold text-amber-500">Join Requests</h3>
            <div className="space-y-2">
              {joinRequests.map(req => (
                <div key={req.peerId} className="p-3 bg-amber-500/10 border border-amber-500/20">
                  <div className="text-[10px] font-mono text-amber-600 dark:text-amber-400 mb-2 truncate"><strong>{req.peerId.substring(0, 8)}...</strong>: "{req.message}"</div>
                  <div className="flex gap-2">
                    <button onClick={() => acceptJoin(req.peerId)} className="flex-1 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] py-1 border border-emerald-500/30 hover:bg-emerald-500/30">Accept</button>
                    <button onClick={() => rejectJoin(req.peerId)} className="flex-1 bg-red-500/20 text-red-600 dark:text-red-400 text-[10px] py-1 border border-red-500/30 hover:bg-red-500/30">Reject</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
        <div className="mt-auto"><div className="p-4 bg-cyan-500/5 dark:bg-cyan-900/10 border border-cyan-500/20 text-center"><p className="text-[9px] italic text-cyan-700 dark:text-cyan-200/60 leading-relaxed font-mono uppercase tracking-tighter">Server acts as a passive forwarder. Payloads are never persisted or decrypted. Memory-only store active.</p></div></div>
      </aside>

      <section className="flex-1 flex flex-col bg-ui-bg dark:bg-brand-bg relative min-w-0">
        <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-black/5 dark:border-white/5 bg-ui-elevated dark:bg-brand-elevated">
          <button onClick={() => setShowLeftSidebar(true)} className="flex items-center gap-2 text-[10px] font-mono uppercase text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"><Info size={14} /> Vault Info</button>
          <button onClick={() => setShowRightSidebar(true)} className="flex items-center gap-2 text-[10px] font-mono uppercase text-slate-500 hover:text-amber-600 dark:hover:text-amber-400 transition-colors">Logs <Activity size={14} /></button>
        </div>
        {/* Mobile Join Requests */}
        {isHost && joinRequests.length > 0 && (
          <div className="lg:hidden p-4 bg-amber-500/10 border-b border-amber-500/20">
            <h3 className="mono-label mb-2 uppercase tracking-widest font-bold text-amber-500">Join Requests</h3>
            <div className="flex flex-col gap-2">
              {joinRequests.map(req => (
                <div key={req.peerId} className="flex flex-col sm:flex-row gap-2 justify-between items-start sm:items-center bg-white dark:bg-black/20 p-2 border border-amber-500/20">
                  <div className="text-[10px] font-mono text-amber-600 dark:text-amber-400 truncate max-w-[200px]"><strong>{req.peerId.substring(0, 8)}...</strong>: "{req.message}"</div>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <button onClick={() => acceptJoin(req.peerId)} className="flex-1 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] px-3 py-1 border border-emerald-500/30 hover:bg-emerald-500/30">Accept</button>
                    <button onClick={() => rejectJoin(req.peerId)} className="flex-1 bg-red-500/20 text-red-600 dark:text-red-400 text-[10px] px-3 py-1 border border-red-500/30 hover:bg-red-500/30">Reject</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Desktop Join Requests Banner */}
        {isHost && joinRequests.length > 0 && (
          <div className="hidden lg:block px-6 py-3 bg-amber-500/10 border-b border-amber-500/20">
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="text-[10px] font-mono uppercase tracking-widest font-bold text-amber-500 shrink-0">Join Requests ({joinRequests.length}):</h3>
              {joinRequests.map(req => (
                <div key={req.peerId} className="flex items-center gap-2 bg-white dark:bg-black/20 px-3 py-1.5 border border-amber-500/20">
                  <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400 truncate max-w-[180px]"><strong>{req.peerId.substring(0, 8)}...</strong>: "{req.message}"</span>
                  <button onClick={() => acceptJoin(req.peerId)} className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] px-2 py-0.5 border border-emerald-500/30 hover:bg-emerald-500/30 font-mono uppercase">Accept</button>
                  <button onClick={() => rejectJoin(req.peerId)} className="bg-red-500/20 text-red-600 dark:text-red-400 text-[10px] px-2 py-0.5 border border-red-500/30 hover:bg-red-500/30 font-mono uppercase">Reject</button>
                </div>
              ))}
            </div>
          </div>
        )}
        {activePeers.length > 0 && (
          <div className="px-6 py-2 border-b border-black/5 dark:border-white/5 flex items-center gap-2 text-[10px] font-mono bg-black/[0.02] dark:bg-white/[0.02]">
            <span className="text-slate-500 uppercase">In Chat:</span>
            {isGroup && <span className="px-2 py-0.5 rounded-sm bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 font-bold ml-1 uppercase">GROUP</span>}
            {activePeers.length > 1 && (secured ? <span className="flex items-center gap-1 px-2 py-0.5 rounded-sm bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-bold uppercase" title="Noise_XX handshake complete — E2E encrypted."><ShieldCheck size={11} /> E2E_SECURED</span> : <span className="flex items-center gap-1 px-2 py-0.5 rounded-sm bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-bold uppercase animate-pulse" title="Establishing Noise_XX handshakes..."><ShieldAlert size={11} /> HANDSHAKING</span>)}
            {activePeers.length > 1 && (transport === 'p2p' ? <span className="flex items-center gap-1 px-2 py-0.5 rounded-sm bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 font-bold uppercase" title="Direct P2P data channel."><Radio size={11} /> DIRECT_P2P</span> : <span className="flex items-center gap-1 px-2 py-0.5 rounded-sm bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20 font-bold uppercase" title="Via (blind) WS relay."><Server size={11} /> VIA_RELAY</span>)}
            <div className="flex gap-2 overflow-x-auto custom-scrollbar no-scrollbar ml-2">
              {activePeers.map(p => (
                <span key={p} className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full ${p === peerId ? 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700'}`}>
                  {p === peerId ? `${displayName(p)} (You)` : displayName(p)}
                  {p !== peerId && safetyNumbers[p] && <span className="text-emerald-600 dark:text-emerald-400 cursor-help" title={`Safety number:\n${safetyNumbers[p]}`}><Fingerprint size={11} /></span>}
                  {p !== peerId && (p2pPeers.includes(p) ? <span className="text-cyan-600 dark:text-cyan-400 cursor-help" title="Direct P2P"><Radio size={11} /></span> : <span className="text-slate-400 dark:text-slate-500 cursor-help" title="Relayed"><Server size={11} /></span>)}
                  {isHost && isGroup && p !== peerId && <button onClick={() => kickPeer(p)} className="hover:text-red-500 transition-colors ml-0.5" title="Kick user">✕</button>}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 p-6 overflow-y-auto flex flex-col gap-6 custom-scrollbar">
          <AnimatePresence initial={false}>
            {messages.map((msg, i) => {
              const isMe = msg.from === peerId;
              const accentColor = msg.from === 'peer-a' ? 'cyan' : 'orange';
              const alignClass = isMe ? 'items-end self-end text-right' : 'items-start self-start text-left';
              const dotColor = accentColor === 'cyan' ? 'bg-cyan-500' : 'bg-orange-500';
              const headColor = accentColor === 'cyan' ? 'text-cyan-600 dark:text-cyan-500' : 'text-orange-600 dark:text-amber-500';
              const borderClass = isMe ? 'border-r-2 border-r-cyan-500' : 'border-l-2 border-l-orange-500';
              const statusText = msg.status === 'seen' ? '✓✓' : msg.status === 'delivered' ? '✓✓' : msg.status === 'sent' ? '✓' : '...';
              const statusColor = msg.status === 'seen' ? 'text-cyan-500' : 'text-slate-400';
              const deliveredList = msg.deliveredTo.length > 0 ? msg.deliveredTo.map(p => p.replace('peer-', '')).join(', ') : 'None';
              const seenList = msg.seenBy.length > 0 ? msg.seenBy.map(p => p.replace('peer-', '')).join(', ') : 'None';
              const titleText = `Delivered to: ${deliveredList}\nSeen by: ${seenList}`;
              const blurClass = securityOptions.blur ? 'blur-sm hover:blur-none active:blur-none cursor-pointer' : '';
              const antiCaptureTextClass = securityOptions.antiCapture ? 'animate-[strobe_0.05s_infinite] drop-shadow-[0_0_1px_rgba(255,255,255,0.8)]' : '';

              return (
                <motion.div key={`${msg.nonce}-${i}`} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className={`flex flex-col max-w-[85%] ${alignClass} relative group/message`}>
                  <div className="flex items-center gap-2 mb-1.5 px-1 text-ui-muted dark:text-slate-600">
                    {!isMe && <span className={`w-1.5 h-1.5 ${dotColor}`} />}
                    <span className={`text-[10px] font-mono ${headColor} uppercase font-bold tracking-tighter`}>{displayName(msg.from)}</span>
                    <span className="text-[9px] font-mono italic">{new Date(msg.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 } as any)}</span>
                    {isMe && <span className={`text-[10px] font-mono font-bold ${statusColor}`} title={titleText}>{statusText}</span>}
                    {isMe && <span className={`w-1.5 h-1.5 ${dotColor}`} />}
                  </div>
                  <div className={`p-4 bg-black/[0.02] dark:bg-white/[0.03] border border-black/5 dark:border-white/5 ${borderClass} text-sm leading-relaxed text-slate-700 dark:text-slate-300 font-mono shadow-sm dark:shadow-xl relative overflow-hidden group transition-all duration-300 ${blurClass}`}
                    onMouseEnter={() => { if (!isMe) markAsRead(msg.nonce); }}
                    onTouchStart={() => { if (!isMe) markAsRead(msg.nonce); }}
                  >
                    <div className={`relative z-10 ${antiCaptureTextClass}`}>{msg.payload}</div>
                    <div className="absolute inset-0 bg-gradient-to-br from-black/[0.01] dark:from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          <div ref={scrollRef} className="shrink-0" />

          {isPending ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 opacity-50"><Activity size={48} className="mb-4 text-amber-400 animate-pulse" /><p className="text-[10px] font-mono uppercase tracking-[0.3em] text-amber-500">Waiting for host approval...</p></div>
          ) : messages.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 opacity-30"><Activity size={48} className="mb-4 text-slate-400 dark:text-slate-600" /><p className="text-[10px] font-mono uppercase tracking-[0.3em] text-slate-500">Waiting for encrypted handshakes...</p></div>
          )}
        </div>

        <AnimatePresence>
          {typingPeers.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} className="px-6 py-1.5 flex items-center gap-2 text-[10px] font-mono text-cyan-600 dark:text-cyan-400 shrink-0">
              <span className="flex gap-0.5"><span className="w-1 h-1 rounded-full bg-cyan-500 animate-bounce [animation-delay:-0.3s]" /><span className="w-1 h-1 rounded-full bg-cyan-500 animate-bounce [animation-delay:-0.15s]" /><span className="w-1 h-1 rounded-full bg-cyan-500 animate-bounce" /></span>
              <span className="uppercase tracking-tighter italic truncate">{typingPeers.map(displayName).join(', ')} {typingPeers.length > 1 ? 'are' : 'is'} typing...</span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="h-20 border-t border-black/5 dark:border-white/5 p-4 shrink-0 bg-ui-elevated dark:bg-brand-elevated">
          <form onSubmit={handleSend} className="h-full flex gap-4 max-w-5xl mx-auto">
            <div className="flex-1 bg-white dark:bg-black/40 border border-black/10 dark:border-white/10 focus-within:border-cyan-500/50 transition-colors flex items-center px-4 font-mono text-sm group">
              <span className="text-cyan-600 dark:text-cyan-500 mr-3 select-none">$</span>
              <input type="text" value={input} onChange={(e) => { setInput(e.target.value); sendTyping(); }} placeholder="Type encrypted payload..." className="flex-1 bg-transparent border-none outline-none text-slate-700 dark:text-slate-300 placeholder:text-slate-400 dark:placeholder:text-slate-700" autoComplete="off" disabled={activePeers.length <= 1 || isPending} />
            </div>
            <button type="submit" disabled={!isConnected || !input.trim() || activePeers.length <= 1 || isPending} className="bg-slate-900 dark:bg-white text-white dark:text-black px-10 font-mono text-xs font-bold uppercase transition-all enabled:hover:bg-cyan-600 dark:enabled:hover:bg-cyan-400 disabled:opacity-20 flex items-center gap-2">Relay<Terminal size={14} /></button>
          </form>
        </div>
      </section>

      {/* Right Sidebar (Event Logs) */}
      <aside className={`w-72 lg:w-64 border-l border-black/5 dark:border-white/5 bg-ui-aside dark:bg-brand-aside p-4 flex flex-col shrink-0 z-[70] ${showRightSidebar ? 'fixed inset-y-0 right-0 shadow-2xl overflow-y-auto' : 'hidden lg:flex'}`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="mono-label uppercase tracking-widest font-bold">Event Log</h3>
          <button onClick={() => setShowRightSidebar(false)} className="lg:hidden text-slate-500 hover:text-slate-900 dark:hover:text-white"><X size={20} /></button>
        </div>
        <div className="flex-1 font-mono text-[10px] space-y-3 opacity-60 overflow-y-auto custom-scrollbar italic leading-tight">
          {logs.map((log, i) => <div key={i} className={log.color}>[{log.t}] {log.msg}</div>)}
          <div className="text-slate-500 dark:text-slate-600 animate-pulse uppercase tracking-tight">[HANDSHAKE_WAIT] - Listening...</div>
        </div>
        <div className="pt-4 mt-4 border-t border-black/5 dark:border-white/5">
          <div className="flex justify-between items-end">
            <div><div className="text-[9px] text-slate-500 font-mono uppercase">IO_LOAD</div><div className="text-base font-mono text-slate-900 dark:text-white">{ioLoad.toFixed(3)}%</div></div>
            <div className="text-right"><div className="text-[9px] text-slate-500 font-mono uppercase">LATENCY</div><div className={`text-base font-mono tracking-tighter ${latencyMs === null ? 'text-slate-400 dark:text-slate-600' : latencyMs < 50 ? 'text-emerald-600 dark:text-emerald-400' : latencyMs < 150 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}>{latencyMs === null ? '—' : `${latencyMs}ms`}</div></div>
          </div>
        </div>
      </aside>
    </>
  );
}