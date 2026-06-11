import { generateKeyPair } from '@stablelib/x25519';
import { HandshakeState, KeyPair, Transport } from './noise-xx';
import {
  EMPTY,
  utf8,
  fromUtf8,
  toBase64,
  fromBase64,
  sha256,
} from './noise-primitives';

export interface NoiseFrame {
  kind: 'noise';
  to: string;
  step: 1 | 2 | 3;
  data: string;
}

export interface EncryptedPayload {
  c: Record<string, string>;
}

type Phase = 'handshaking' | 'ready' | 'failed';

interface Channel {
  initiator: boolean;
  phase: Phase;
  hs: HandshakeState;
  transport: Transport | null;
  safetyNumber: string | null;
}

interface PeerChannelsOptions {
  sessionId: string;
  selfId: string;
  sendNoise: (toPeerId: string, frame: NoiseFrame) => void;
}

export class PeerChannels {
  private readonly selfId: string;
  private readonly sendNoise: PeerChannelsOptions['sendNoise'];
  private readonly staticKey: KeyPair;
  private readonly channels = new Map<string, Channel>();

  constructor(opts: PeerChannelsOptions) {
    this.selfId = opts.selfId;
    this.sendNoise = opts.sendNoise;
    this.staticKey = loadOrCreateIdentity(opts.sessionId);
  }

  private isInitiator(peerId: string): boolean {
    return this.selfId < peerId;
  }

  private newChannel(peerId: string): Channel {
    const initiator = this.isInitiator(peerId);
    return {
      initiator,
      phase: 'handshaking',
      hs: new HandshakeState(initiator, this.staticKey),
      transport: null,
      safetyNumber: null,
    };
  }

  ensureChannel(peerId: string): void {
    if (peerId === this.selfId || this.channels.has(peerId)) return;
    const channel = this.newChannel(peerId);
    this.channels.set(peerId, channel);
    if (channel.initiator) {
      this.sendNoise(peerId, { kind: 'noise', to: peerId, step: 1, data: toBase64(channel.hs.writeMessage()) });
    }
  }

  onSignal(fromPeerId: string, frame: NoiseFrame): void {
    if (frame.to !== this.selfId) return;

    // A fresh step-1 from a peer (e.g. after their reconnect) restarts the handshake.
    let channel = this.channels.get(fromPeerId);
    if (!channel || (frame.step === 1 && channel.phase !== 'handshaking')) {
      channel = this.newChannel(fromPeerId);
      this.channels.set(fromPeerId, channel);
    }

    try {
      const data = fromBase64(frame.data);
      if (channel.initiator && frame.step === 2) {
        channel.hs.readMessage(data);
        this.sendNoise(fromPeerId, { kind: 'noise', to: fromPeerId, step: 3, data: toBase64(channel.hs.writeMessage()) });
        this.finalize(channel);
      } else if (!channel.initiator && frame.step === 1) {
        channel.hs.readMessage(data);
        this.sendNoise(fromPeerId, { kind: 'noise', to: fromPeerId, step: 2, data: toBase64(channel.hs.writeMessage()) });
      } else if (!channel.initiator && frame.step === 3) {
        channel.hs.readMessage(data);
        this.finalize(channel);
      }
    } catch {
      channel.phase = 'failed';
    }
  }

  private finalize(channel: Channel): void {
    if (!channel.hs.complete) return;
    channel.transport = channel.hs.transport();
    channel.safetyNumber = safetyNumber(channel.hs.handshakeHash);
    channel.phase = 'ready';
  }

  encryptForAll(plaintext: string): EncryptedPayload {
    const c: Record<string, string> = {};
    const bytes = utf8(plaintext);
    for (const [peerId, channel] of this.channels) {
      if (channel.phase === 'ready' && channel.transport) {
        c[peerId] = toBase64(channel.transport.send.encryptWithAd(EMPTY, bytes));
      }
    }
    return { c };
  }

  decryptFrom(fromPeerId: string, payload: EncryptedPayload): string | null {
    const channel = this.channels.get(fromPeerId);
    if (!channel || channel.phase !== 'ready' || !channel.transport) return null;
    const slot = payload?.c?.[this.selfId];
    if (typeof slot !== 'string') return null;
    try {
      return fromUtf8(channel.transport.recv.decryptWithAd(EMPTY, fromBase64(slot)));
    } catch {
      return null;
    }
  }

  removePeer(peerId: string): void {
    this.channels.delete(peerId);
  }

  isReady(peerId: string): boolean {
    return this.channels.get(peerId)?.phase === 'ready';
  }

  allReady(peerIds: string[]): boolean {
    const others = peerIds.filter(id => id !== this.selfId);
    return others.length > 0 && others.every(id => this.isReady(id));
  }

  safetyNumbers(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [peerId, channel] of this.channels) {
      if (channel.safetyNumber) out[peerId] = channel.safetyNumber;
    }
    return out;
  }
}

// Six groups of five digits derived from the handshake hash. Both peers share
// the same handshake hash, so they independently compute the same number and
// can compare it out of band to detect a relay-mounted MITM.
function safetyNumber(handshakeHash: Uint8Array): string {
  const digest = sha256(handshakeHash);
  const groups: string[] = [];
  for (let i = 0; i < 6; i++) {
    const view = new DataView(digest.buffer, digest.byteOffset + i * 4, 4);
    groups.push((view.getUint32(0) % 100000).toString().padStart(5, '0'));
  }
  return groups.join(' ');
}

function loadOrCreateIdentity(sessionId: string): KeyPair {
  const key = `qb-noise-id-${sessionId}`;
  try {
    const stored = sessionStorage.getItem(key);
    if (stored) {
      const { pub, sec } = JSON.parse(stored);
      return { publicKey: fromBase64(pub), secretKey: fromBase64(sec) };
    }
  } catch {
    // Fall through to generating a fresh identity.
  }
  const pair = generateKeyPair();
  try {
    sessionStorage.setItem(key, JSON.stringify({ pub: toBase64(pair.publicKey), sec: toBase64(pair.secretKey) }));
  } catch {
    // sessionStorage unavailable (e.g. SSR/tests) — identity stays in memory.
  }
  return pair;
}
