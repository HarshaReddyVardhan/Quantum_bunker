import { generateKeyPair, sharedKey } from '@stablelib/x25519';
import {
  CipherState,
  SymmetricState,
  DHLEN,
  EMPTY,
  TAG_LENGTH,
  concatBytes,
} from './noise-primitives.js';

export interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export const PROTOCOL_NAME = 'Noise_XX_25519_ChaChaPoly_SHA256';

type Token = 'e' | 's' | 'ee' | 'es' | 'se';

const MESSAGE_PATTERNS: Token[][] = [
  ['e'],
  ['e', 'ee', 's', 'es'],
  ['s', 'se'],
];

export interface HandshakeOptions {
  prologue?: Uint8Array;
  // Test-only: pin the ephemeral keypair to reproduce known-answer vectors.
  fixedEphemeral?: KeyPair;
}

export interface Transport {
  send: CipherState;
  recv: CipherState;
}

export class HandshakeState {
  private readonly sym: SymmetricState;
  private readonly s: KeyPair;
  private e: KeyPair | null = null;
  private rs: Uint8Array | null = null;
  private re: Uint8Array | null = null;
  private messageIndex = 0;
  private cipherPair: [CipherState, CipherState] | null = null;
  private readonly fixedEphemeral?: KeyPair;

  constructor(
    private readonly isInitiator: boolean,
    staticKey: KeyPair,
    options: HandshakeOptions = {},
  ) {
    this.s = staticKey;
    this.fixedEphemeral = options.fixedEphemeral;
    this.sym = new SymmetricState(PROTOCOL_NAME);
    this.sym.mixHash(options.prologue ?? EMPTY);
  }

  get complete(): boolean {
    return this.cipherPair !== null;
  }

  get remoteStaticKey(): Uint8Array | null {
    return this.rs;
  }

  get localStaticKey(): Uint8Array {
    return this.s.publicKey;
  }

  get handshakeHash(): Uint8Array {
    return this.sym.handshakeHash;
  }

  get chainKey(): Uint8Array {
    return this.sym.chainKey;
  }

  transport(): Transport {
    if (!this.cipherPair) throw new Error('NOISE_HANDSHAKE_INCOMPLETE');
    const [c1, c2] = this.cipherPair;
    return this.isInitiator ? { send: c1, recv: c2 } : { send: c2, recv: c1 };
  }

  writeMessage(payload: Uint8Array = EMPTY): Uint8Array {
    const parts: Uint8Array[] = [];
    for (const token of MESSAGE_PATTERNS[this.messageIndex]) {
      if (token === 'e') {
        this.e = this.fixedEphemeral ?? generateKeyPair();
        parts.push(this.e.publicKey);
        this.sym.mixHash(this.e.publicKey);
      } else if (token === 's') {
        parts.push(this.sym.encryptAndHash(this.s.publicKey));
      } else {
        this.mixDH(token);
      }
    }
    parts.push(this.sym.encryptAndHash(payload));
    this.advance();
    return concatBytes(...parts);
  }

  readMessage(message: Uint8Array): Uint8Array {
    let offset = 0;
    for (const token of MESSAGE_PATTERNS[this.messageIndex]) {
      if (token === 'e') {
        this.re = message.slice(offset, offset + DHLEN);
        offset += DHLEN;
        this.sym.mixHash(this.re);
      } else if (token === 's') {
        const len = DHLEN + (this.sym.hasKey() ? TAG_LENGTH : 0);
        this.rs = this.sym.decryptAndHash(message.slice(offset, offset + len));
        offset += len;
      } else {
        this.mixDH(token);
      }
    }
    const payload = this.sym.decryptAndHash(message.slice(offset));
    this.advance();
    return payload;
  }

  private mixDH(token: Token): void {
    if (token === 'ee') {
      this.sym.mixKey(sharedKey(this.e!.secretKey, this.re!));
    } else if (token === 'es') {
      this.sym.mixKey(
        this.isInitiator
          ? sharedKey(this.e!.secretKey, this.rs!)
          : sharedKey(this.s.secretKey, this.re!),
      );
    } else if (token === 'se') {
      this.sym.mixKey(
        this.isInitiator
          ? sharedKey(this.s.secretKey, this.re!)
          : sharedKey(this.e!.secretKey, this.rs!),
      );
    }
  }

  private advance(): void {
    this.messageIndex += 1;
    if (this.messageIndex >= MESSAGE_PATTERNS.length) {
      this.cipherPair = this.sym.split();
    }
  }
}
