import WebSocket from 'ws';
import * as readline from 'node:readline';
import { PeerChannels, NoiseFrame, EncryptedPayload } from './crypto/peer-channels.js';
import { EnvelopeType, RelayEnvelope, newNonce, randomPeerId } from './protocol.js';
import { wsUrl, Target } from './config.js';
import { Console, color, banner } from './ui.js';

export interface JoinOptions {
  target: Target;
  name?: string;
  recoveryToken?: string;
}

interface PendingRequest {
  peerId: string;
  message: string;
}

export async function runJoin(opts: JoinOptions): Promise<void> {
  const { target } = opts;
  if (!target.sessionId) {
    throw new Error('No vault hash provided. Usage: quantum-bunker join <hash>');
  }

  const meta = await fetchSession(target.server, target.sessionId);
  const vaultName = meta?.name || target.sessionId;

  const peerId = randomPeerId();
  const alias = (opts.name || '').trim().slice(0, 32);

  banner([
    '',
    color.bold(color.cyan('  QUANTUM BUNKER')) + color.gray('  ·  terminal vault client'),
    color.gray(`  vault    `) + vaultName,
    color.gray(`  server   `) + target.server,
    color.gray(`  you      `) + peerId + (alias ? color.gray(` (${alias})`) : ''),
    meta?.expiresAt ? color.gray(`  expires  `) + new Date(meta.expiresAt).toLocaleTimeString() : '',
    color.gray('  type /help for commands, /quit to leave'),
    '',
  ].filter(Boolean));

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.setPrompt(color.dim('› '));
  const out = new Console(rl);

  const client = new ChatClient({ ...opts, peerId, alias, out, rl });
  client.start();

  rl.on('line', (line) => {
    const text = line.trim();
    readline.moveCursor(process.stdout, 0, -1);
    readline.clearLine(process.stdout, 0);
    if (text) client.handleInput(text);
    rl.prompt(true);
  });

  rl.on('SIGINT', () => client.quit(0));

  await client.done;
}

interface ClientDeps extends JoinOptions {
  peerId: string;
  alias: string;
  out: Console;
  rl: readline.Interface;
}

class ChatClient {
  private readonly sessionId: string;
  private readonly peerId: string;
  private readonly alias: string;
  private readonly out: Console;
  private readonly rl: readline.Interface;
  private readonly channels: PeerChannels;
  private ws!: WebSocket;
  private peers: string[] = [];
  private aliases: Record<string, string> = {};
  private requests: PendingRequest[] = [];
  private isHost = false;
  private secured = false;
  private resolveDone!: () => void;
  readonly done: Promise<void>;

  constructor(deps: ClientDeps) {
    this.sessionId = deps.target.sessionId;
    this.peerId = deps.peerId;
    this.alias = deps.alias;
    this.out = deps.out;
    this.rl = deps.rl;
    this.done = new Promise((resolve) => { this.resolveDone = resolve; });
    this.channels = new PeerChannels({
      sessionId: this.sessionId,
      selfId: this.peerId,
      sendNoise: (_to, frame) => this.sendSignal({ ...frame }),
    });
    this.recoveryToken = deps.recoveryToken;
    this.serverUrl = deps.target.server;
  }

  private readonly recoveryToken?: string;
  private readonly serverUrl: string;

  start(): void {
    this.ws = new WebSocket(wsUrl(this.serverUrl));
    this.ws.on('open', () => {
      this.ws.send(JSON.stringify({
        type: 'join',
        sessionId: this.sessionId,
        peerId: this.peerId,
        message: this.alias || 'Hello',
        hostRecoveryToken: this.recoveryToken,
      }));
    });
    this.ws.on('message', (data) => this.onMessage(data.toString()));
    this.ws.on('close', () => {
      this.out.warn('connection closed');
      this.quit(0);
    });
    this.ws.on('error', (err) => {
      this.out.error(`socket error: ${(err as Error).message}`);
    });
  }

  private onMessage(raw: string): void {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'joined':
        this.isHost = !!msg.isHost;
        this.out.status(`joined vault${this.isHost ? color.yellow(' (host)') : ''}`);
        return;
      case 'pending':
        this.out.status('waiting for host approval…');
        return;
      case 'peer_update':
        this.onPeerUpdate(msg.peers as string[]);
        return;
      case 'join_request':
        this.onJoinRequest(msg.peerId, msg.message);
        return;
      case 'error':
        this.out.error(msg.message || 'server error');
        if (['Session destroyed', 'Join rejected by host', 'You have been kicked by the host'].includes(msg.message)) {
          this.quit(1);
        }
        return;
      default:
        this.onEnvelope(msg as RelayEnvelope);
    }
  }

  private onPeerUpdate(next: string[]): void {
    const prev = this.peers;
    this.peers = next;
    for (const id of next) {
      if (id === this.peerId) continue;
      this.channels.ensureChannel(id);
    }
    for (const id of prev) {
      if (!next.includes(id)) {
        this.channels.removePeer(id);
        delete this.aliases[id];
      }
    }
    const joined = next.filter(id => id !== this.peerId && !prev.includes(id));
    const left = prev.filter(id => id !== this.peerId && !next.includes(id));
    for (const id of joined) this.out.status(`${this.label(id)} joined`);
    for (const id of left) this.out.status(`${this.label(id)} left`);
    if (this.alias) this.sendSignal({ kind: 'alias', alias: this.alias });
    this.refreshSecured();
  }

  private onJoinRequest(peerId: string, message: string): void {
    this.requests = this.requests.filter(r => r.peerId !== peerId);
    this.requests.push({ peerId, message });
    this.out.warn(`${color.bold(peerId)} wants to join: ${color.gray(message || '')}`);
    this.out.info(`  approve with ${color.cyan(`/accept ${peerId}`)} or ${color.cyan(`/reject ${peerId}`)}`);
  }

  private onEnvelope(env: RelayEnvelope): void {
    if (!env || typeof env.type !== 'string') return;

    if (env.type === EnvelopeType.ACK) {
      // env.payload is the original message nonce; receipts are informational.
      return;
    }
    if (env.type === EnvelopeType.READ) {
      return;
    }
    if (env.type === EnvelopeType.SIGNALING) {
      this.onSignaling(env);
      return;
    }
    if (env.type === EnvelopeType.NOISE_MESSAGE || env.type === EnvelopeType.PLAINTEXT) {
      let text: string | null = env.payload;
      if (env.type === EnvelopeType.NOISE_MESSAGE) {
        try {
          text = this.channels.decryptFrom(env.from, JSON.parse(env.payload) as EncryptedPayload);
        } catch {
          text = null;
        }
        if (text === null) return; // not addressed to us / no channel yet
      }
      this.printIncoming(env.from, text);
      this.sendRaw({
        sessionId: env.sessionId,
        from: this.peerId,
        type: EnvelopeType.ACK,
        timestamp: Date.now(),
        nonce: newNonce(),
        payload: env.nonce,
      });
    }
  }

  private onSignaling(env: RelayEnvelope): void {
    let sig: any;
    try {
      sig = JSON.parse(env.payload);
    } catch {
      return;
    }
    if (sig.kind === 'noise') {
      this.channels.onSignal(env.from, sig as NoiseFrame);
      this.refreshSecured();
    } else if (sig.kind === 'alias' && typeof sig.alias === 'string' && sig.alias.trim()) {
      this.aliases[env.from] = sig.alias.trim().slice(0, 32);
    }
    // 'typing' and 'rtc' frames are intentionally ignored by the CLI.
  }

  private refreshSecured(): void {
    const ready = this.channels.allReady(this.peers);
    if (ready && !this.secured) {
      this.secured = true;
      const fps = this.channels.fingerprints();
      this.out.status(color.green('end-to-end encrypted') + color.gray(' — verify fingerprints with /verify'));
      void fps;
    } else if (!ready && this.secured) {
      this.secured = false;
    }
  }

  handleInput(text: string): void {
    if (text.startsWith('/')) {
      this.handleCommand(text);
      return;
    }
    this.sendChat(text);
  }

  private sendChat(text: string): void {
    const others = this.peers.filter(id => id !== this.peerId);
    if (others.length === 0) {
      this.out.warn('no peers in the vault yet');
      return;
    }
    if (!this.secured) {
      this.out.warn('secure channel not ready — message not sent');
      return;
    }
    const payload = JSON.stringify(this.channels.encryptForAll(text));
    this.sendRaw({
      sessionId: this.sessionId,
      from: this.peerId,
      type: EnvelopeType.NOISE_MESSAGE,
      timestamp: Date.now(),
      nonce: newNonce(),
      payload,
    });
    this.out.print(color.dim('you  ') + text);
  }

  private handleCommand(input: string): void {
    const [cmd, ...rest] = input.slice(1).split(/\s+/);
    const arg = rest.join(' ');
    switch (cmd) {
      case 'help':
        this.printHelp();
        break;
      case 'peers': {
        const list = this.peers.map(id => (id === this.peerId ? `${this.label(id)} ${color.gray('(you)')}` : this.label(id)));
        this.out.info(`peers: ${list.join(', ') || '(none)'}`);
        break;
      }
      case 'verify': {
        this.out.info(`your fingerprint: ${color.cyan(this.channels.ownFingerprint())}`);
        const fps = this.channels.fingerprints();
        const sns = this.channels.safetyNumbers();
        for (const id of Object.keys(fps)) {
          this.out.info(`  ${this.label(id)}  fp ${color.cyan(fps[id])}`);
          if (sns[id]) this.out.info(`  ${this.label(id)}  sn ${color.gray(sns[id])}`);
        }
        break;
      }
      case 'accept':
        this.hostAction('accept_join', arg);
        break;
      case 'reject':
        this.hostAction('reject_join', arg);
        break;
      case 'kick':
        this.hostAction('kick_peer', arg);
        break;
      case 'quit':
      case 'exit':
        this.quit(0);
        break;
      default:
        this.out.warn(`unknown command: /${cmd} (try /help)`);
    }
  }

  private hostAction(type: 'accept_join' | 'reject_join' | 'kick_peer', target: string): void {
    if (!this.isHost) {
      this.out.warn('only the host can do that');
      return;
    }
    if (!target) {
      this.out.warn(`usage: /${type === 'kick_peer' ? 'kick' : type === 'accept_join' ? 'accept' : 'reject'} <peer-id>`);
      return;
    }
    this.ws.send(JSON.stringify({ type, peerId: target }));
    this.requests = this.requests.filter(r => r.peerId !== target);
    this.out.status(`${type.replace('_', ' ')} → ${target}`);
  }

  private printHelp(): void {
    this.out.info('commands:');
    this.out.info('  /peers            list connected peers');
    this.out.info('  /verify           show key fingerprints & safety numbers');
    this.out.info('  /accept <id>      approve a pending join (host)');
    this.out.info('  /reject <id>      deny a pending join (host)');
    this.out.info('  /kick <id>        remove a peer (host)');
    this.out.info('  /quit             leave the vault');
  }

  private printIncoming(from: string, text: string): void {
    this.out.print(color.bold(color.green(this.label(from))) + '  ' + text);
  }

  private label(id: string): string {
    return this.aliases[id] ? `${this.aliases[id]}` : id;
  }

  private sendSignal(obj: Record<string, unknown>): void {
    this.sendRaw({
      sessionId: this.sessionId,
      from: this.peerId,
      type: EnvelopeType.SIGNALING,
      timestamp: Date.now(),
      nonce: newNonce(),
      payload: JSON.stringify(obj),
    });
  }

  private sendRaw(env: RelayEnvelope): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(env));
    }
  }

  quit(code: number): void {
    try { this.ws?.close(); } catch { /* ignore */ }
    this.rl.close();
    this.resolveDone();
    process.exit(code);
  }
}

interface SessionMeta {
  name?: string;
  expiresAt?: number;
  hostId?: string;
}

async function fetchSession(server: string, id: string): Promise<SessionMeta | null> {
  try {
    const resp = await fetch(`${server}/api/sessions/${encodeURIComponent(id)}`);
    if (!resp.ok) {
      throw new Error(resp.status === 404 ? 'vault not found or expired' : `server returned ${resp.status}`);
    }
    return (await resp.json()) as SessionMeta;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('vault')) throw err;
    return null; // network/metadata failure is non-fatal; the WS join will retry the lookup
  }
}
