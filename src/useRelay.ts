import { useState, useEffect, useCallback, useRef } from 'react';
import { RelayEnvelope, EnvelopeType } from './shared/contracts/v1/envelope';
import { PeerChannels, NoiseFrame } from './crypto/peer-channels';
import { WebRTCMesh, RtcFrame, shouldUseP2P } from './transport/webrtc-mesh';
import { randomId } from './random';
import { buildJoinCredentials } from './membership-store';

export interface LocalMessage extends RelayEnvelope {
  status: 'sending' | 'sent' | 'delivered' | 'seen';
  deliveredTo: string[];
  seenBy: string[];
}

export function useRelay(sessionId: string | null, peerId: string | null) {
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [activePeers, setActivePeers] = useState<string[]>([]);
  const [joinRequests, setJoinRequests] = useState<{peerId: string; message: string}[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isGroup, setIsGroup] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [ioLoad, setIoLoad] = useState<number>(0);
  const [peerAliases, setPeerAliases] = useState<Record<string, string>>({});
  const [typingAt, setTypingAt] = useState<Record<string, number>>({});
  const [secured, setSecured] = useState(false);
  const [safetyNumbers, setSafetyNumbers] = useState<Record<string, string>>({});
  const [fingerprints, setFingerprints] = useState<Record<string, string>>({});
  const [ownFingerprint, setOwnFingerprint] = useState<string | null>(null);
  const [p2pPeers, setP2pPeers] = useState<string[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const channelsRef = useRef<PeerChannels | null>(null);
  const meshRef = useRef<WebRTCMesh | null>(null);
  const activePeersRef = useRef<string[]>([]);
  const readSentRef = useRef<Set<string>>(new Set());
  const pingTimestampRef = useRef<Map<string, number>>(new Map());
  const bytesInWindowRef = useRef<number>(0);
  const typingStopRef = useRef<number | null>(null);
  const typingSentAtRef = useRef<number>(0);

  // Disappear messages after 5 mins
  useEffect(() => {
    const interval = setInterval(() => {
      setMessages(prev => prev.filter(m => Date.now() - m.timestamp < 5 * 60 * 1000));
    }, 10000); // Check every 10s
    return () => clearInterval(interval);
  }, []);

  // IO load: reset byte window every second, express as % of 1MB reference
  // (1_000_000 matches MAX_PAYLOAD_BYTES in src/backend/core/constants.ts)
  useEffect(() => {
    const interval = setInterval(() => {
      const bytes = bytesInWindowRef.current;
      bytesInWindowRef.current = 0;
      setIoLoad(Math.min((bytes / 1_000_000) * 100, 100));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const sendRaw = useCallback((envelope: RelayEnvelope) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      const data = JSON.stringify(envelope);
      socketRef.current.send(data);
      bytesInWindowRef.current += data.length;
    }
  }, []);

  const sendSignal = useCallback((obj: Record<string, unknown>) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN || !sessionId || !peerId) return;
    sendRaw({
      sessionId,
      from: peerId,
      type: EnvelopeType.SIGNALING,
      timestamp: Date.now(),
      nonce: randomId(),
      payload: JSON.stringify(obj),
    });
  }, [sessionId, peerId, sendRaw]);

  // Routes an envelope over the direct mesh when every peer has an open data
  // channel; otherwise over the WS relay. All-or-nothing per message keeps the
  // server out of the loop entirely once P2P is established, without risking
  // duplicate delivery in mixed mode.
  const dispatch = useCallback((env: RelayEnvelope) => {
    const mesh = meshRef.current;
    const others = activePeersRef.current.filter(id => id !== peerId);
    if (mesh && shouldUseP2P(others, id => mesh.isConnected(id))) {
      const data = JSON.stringify(env);
      for (const id of others) mesh.send(id, data);
    } else {
      sendRaw(env);
    }
  }, [peerId, sendRaw]);

  const connect = useCallback(() => {
    if (!sessionId || !peerId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);

    channelsRef.current = new PeerChannels({
      sessionId,
      selfId: peerId,
      sendNoise: (to: string, frame: NoiseFrame) => sendSignal({ ...frame }),
    });
    setOwnFingerprint(channelsRef.current.ownFingerprint());

    const refreshCrypto = () => {
      const mgr = channelsRef.current;
      if (!mgr) return;
      setSafetyNumbers(mgr.safetyNumbers());
      setFingerprints(mgr.fingerprints());
      setSecured(mgr.allReady(activePeersRef.current));
      if (ownFingerprint === null) setOwnFingerprint(mgr.ownFingerprint());
    };

    const refreshTransport = () => {
      setP2pPeers(meshRef.current?.connectedPeers() ?? []);
    };

    // Transport-agnostic: invoked for envelopes arriving over the WS relay AND
    // over direct data channels.
    const handleEnvelope = (env: RelayEnvelope) => {
      if (env.type === EnvelopeType.PONG) {
        const sentAt = pingTimestampRef.current.get(env.nonce);
        if (sentAt !== undefined) {
          setLatencyMs(Date.now() - sentAt);
          pingTimestampRef.current.delete(env.nonce);
        }
        return;
      }

      if (env.type === EnvelopeType.ACK) {
        setMessages(prev => prev.map(m => {
          if (m.nonce === env.payload) {
            const deliveredTo = Array.from(new Set([...m.deliveredTo, env.from]));
            return { ...m, deliveredTo, status: m.status === 'seen' ? 'seen' : 'delivered' };
          }
          return m;
        }));
        return;
      }

      if (env.type === EnvelopeType.READ) {
        setMessages(prev => prev.map(m => {
          if (m.nonce === env.payload) {
            const seenBy = Array.from(new Set([...m.seenBy, env.from]));
            return { ...m, seenBy, status: 'seen' };
          }
          return m;
        }));
        return;
      }

      // SIGNALING payloads are client-interpreted control frames; the server
      // forwards them opaquely and never inspects the contents.
      if (env.type === EnvelopeType.SIGNALING) {
        try {
          const sig = JSON.parse(env.payload);
          if (sig.kind === 'noise') {
            channelsRef.current?.onSignal(env.from, sig as NoiseFrame);
            refreshCrypto();
          } else if (sig.kind === 'rtc') {
            void meshRef.current?.onSignal(env.from, sig as RtcFrame);
            refreshTransport();
          } else if (sig.kind === 'typing') {
            setTypingAt(prev => {
              if (sig.state) return { ...prev, [env.from]: Date.now() };
              const { [env.from]: _removed, ...rest } = prev;
              return rest;
            });
          } else if (sig.kind === 'alias' && typeof sig.alias === 'string' && sig.alias.trim()) {
            const alias = sig.alias.trim().slice(0, 32);
            setPeerAliases(prev => (prev[env.from] === alias ? prev : { ...prev, [env.from]: alias }));
          }
        } catch {
          // Ignore malformed signaling frames
        }
        return;
      }

      if (env.type === EnvelopeType.PLAINTEXT || env.type === EnvelopeType.NOISE_MESSAGE) {
        let text: string | null = env.payload;
        if (env.type === EnvelopeType.NOISE_MESSAGE) {
          const mgr = channelsRef.current;
          try {
            text = mgr ? mgr.decryptFrom(env.from, JSON.parse(env.payload)) : null;
          } catch {
            text = null;
          }
          // Not addressed to us, or no established channel yet â€” drop silently.
          if (text === null) return;
        }

        setMessages(prev => {
          if (prev.some(m => m.nonce === env.nonce)) return prev; // Deduplicate
          return [...prev, { ...env, payload: text as string, status: 'delivered', deliveredTo: [], seenBy: [] }];
        });

        // Auto-reply with ACK over whichever transport is active.
        dispatch({
          sessionId: env.sessionId,
          from: peerId,
          type: EnvelopeType.ACK,
          timestamp: Date.now(),
          nonce: randomId(),
          payload: env.nonce,
        });
      }
    };

    meshRef.current = new WebRTCMesh({
      selfId: peerId,
      sendRtc: (to: string, frame: RtcFrame) => sendSignal({ ...frame }),
      onMessage: (_from: string, data: string) => {
        try {
          handleEnvelope(JSON.parse(data) as RelayEnvelope);
        } catch {
          // Ignore malformed data-channel frames.
        }
      },
      onStateChange: refreshTransport,
    });

    socket.onopen = () => {
      console.log('WS Connected');
      const msg = localStorage.getItem('qb-join-msg') || 'Hello';
      const recoveryToken = localStorage.getItem(`qb-recovery-${sessionId}`);
      const peerToken = sessionStorage.getItem(`qb-peer-token-${sessionId}`);
      // If this device holds a host-signed membership token for the vault, the
      // server auto-admits without host approval.
      const credentials = buildJoinCredentials(sessionId, peerId);
      socket.send(JSON.stringify({
        type: 'join',
        sessionId,
        peerId,
        message: msg,
        hostRecoveryToken: recoveryToken,
        peerToken,
        membershipToken: credentials?.membershipToken,
        joinProof: credentials?.joinProof,
      }));
    };

    socket.onmessage = (event) => {
      bytesInWindowRef.current += (event.data as string).length;
      const data = JSON.parse(event.data);
      
      if (data.type === 'joined') {
        setIsConnected(true);
        setIsPending(false);
        setError(null);
        if (data.peerToken) {
          sessionStorage.setItem(`qb-peer-token-${sessionId}`, data.peerToken);
        }
        // Server might tell us we are host via recovery
        if (data.isHost) {
          // This would ideally update useSession, but we can at least log it or handle local state if needed
          console.log('Joined as Host (recovered)');
        }
        return;
      }

      if (data.type === 'pending') {
        setIsPending(true);
        return;
      }

      if (data.type === 'peer_update') {
        const prev = activePeersRef.current;
        const next = data.peers as string[];
        activePeersRef.current = next;
        setActivePeers(next);
        setIsGroup(!!data.isGroup);
        const mgr = channelsRef.current;
        const mesh = meshRef.current;
        for (const id of next) {
          if (id === peerId) continue;
          mgr?.ensureChannel(id);
          mesh?.ensurePeer(id);
        }
        for (const id of prev) {
          if (next.includes(id)) continue;
          mgr?.removePeer(id);
          mesh?.removePeer(id);
        }
        refreshCrypto();
        refreshTransport();
        return;
      }

      if (data.type === 'join_request') {
        setJoinRequests(prev => [...prev, { peerId: data.peerId, message: data.message }]);
        return;
      }

      if (data.type === 'error') {
        setError(data.message);
        if (data.message === 'Session destroyed' || data.message === 'Join rejected by host' || data.message === 'You have been kicked by the host') {
           socket.close();
        }
        return;
      }

      // Any other message is a relayed envelope.
      handleEnvelope(data as RelayEnvelope);
    };

    socket.onclose = () => {
      setIsConnected(false);
      console.log('WS Disconnected');
    };

    socket.onerror = (err) => {
      setError('WebSocket connection failed');
      console.error(err);
    };

    socketRef.current = socket;
  }, [sessionId, peerId, sendRaw, sendSignal, dispatch]);

  const sendMessage = useCallback((payload: string, type: EnvelopeType = EnvelopeType.NOISE_MESSAGE) => {
    if (!socketRef.current || !isConnected || !sessionId || !peerId || activePeers.length <= 1) return;

    const wirePayload =
      type === EnvelopeType.NOISE_MESSAGE && channelsRef.current
        ? JSON.stringify(channelsRef.current.encryptForAll(payload))
        : payload;

    const wireEnvelope: RelayEnvelope = {
      sessionId,
      from: peerId,
      type,
      timestamp: Date.now(),
      nonce: randomId(),
      payload: wirePayload,
    };

    dispatch(wireEnvelope);

    if (typingStopRef.current) {
      clearTimeout(typingStopRef.current);
      typingStopRef.current = null;
    }
    if (typingSentAtRef.current) {
      typingSentAtRef.current = 0;
      sendSignal({ kind: 'typing', state: false });
    }

    // Local echo keeps the plaintext so the sender sees their own message.
    setMessages(prev => [...prev, {
      ...wireEnvelope,
      payload,
      status: 'sent',
      deliveredTo: [],
      seenBy: []
    }]);
  }, [isConnected, sessionId, peerId, activePeers.length, dispatch, sendSignal]);

  const sendTyping = useCallback(() => {
    if (activePeers.length <= 1) return;
    const now = Date.now();
    if (now - typingSentAtRef.current > 2000) {
      typingSentAtRef.current = now;
      sendSignal({ kind: 'typing', state: true });
    }
    if (typingStopRef.current) clearTimeout(typingStopRef.current);
    typingStopRef.current = window.setTimeout(() => {
      typingSentAtRef.current = 0;
      typingStopRef.current = null;
      sendSignal({ kind: 'typing', state: false });
    }, 3000);
  }, [activePeers.length, sendSignal]);

  const markAsRead = useCallback((nonce: string) => {
    if (!sessionId || !peerId || readSentRef.current.has(nonce)) return;
    readSentRef.current.add(nonce);

    dispatch({
      sessionId,
      from: peerId,
      type: EnvelopeType.READ,
      timestamp: Date.now(),
      nonce: randomId(),
      payload: nonce,
    });
  }, [sessionId, peerId, dispatch]);

  useEffect(() => {
    if (sessionId && peerId) {
      connect();
    }
    return () => {
      socketRef.current?.close();
      meshRef.current?.reset();
      meshRef.current = null;
    };
  }, [sessionId, peerId, connect]);

  // Periodic PING to measure round-trip latency
  useEffect(() => {
    if (!isConnected || !sessionId || !peerId) return;
    const interval = setInterval(() => {
      const nonce = randomId();
      pingTimestampRef.current.set(nonce, Date.now());
      sendRaw({
        sessionId,
        from: peerId,
        type: EnvelopeType.PING,
        timestamp: Date.now(),
        nonce,
        payload: '',
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [isConnected, sessionId, peerId, sendRaw]);

  // Announce our display alias on connect and whenever the peer set changes,
  // so newly joined peers learn how to label us.
  useEffect(() => {
    if (!isConnected || activePeers.length <= 1) return;
    const alias = (localStorage.getItem('qb-join-msg') || '').trim();
    if (alias && alias.toLowerCase() !== 'hello') {
      sendSignal({ kind: 'alias', alias: alias.slice(0, 32) });
    }
  }, [isConnected, activePeers.length, sendSignal]);

  // Expire typing indicators if no explicit "stop" frame arrives.
  useEffect(() => {
    const interval = setInterval(() => {
      setTypingAt(prev => {
        const now = Date.now();
        const next = Object.fromEntries(Object.entries(prev).filter(([, t]) => now - (t as number) < 4000));
        return Object.keys(next).length === Object.keys(prev).length ? prev : next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const acceptJoin = useCallback((targetPeerId: string) => {
    if (!socketRef.current) return;
    socketRef.current.send(JSON.stringify({ type: 'accept_join', peerId: targetPeerId }));
    setJoinRequests(prev => prev.filter(req => req.peerId !== targetPeerId));
  }, []);

  const rejectJoin = useCallback((targetPeerId: string) => {
    if (!socketRef.current) return;
    socketRef.current.send(JSON.stringify({ type: 'reject_join', peerId: targetPeerId }));
    setJoinRequests(prev => prev.filter(req => req.peerId !== targetPeerId));
  }, []);

  const kickPeer = useCallback((targetPeerId: string) => {
    if (!socketRef.current) return;
    socketRef.current.send(JSON.stringify({ type: 'kick_peer', peerId: targetPeerId }));
  }, []);

  const typingPeers = Object.keys(typingAt).filter(id => id !== peerId);
  const otherPeers = activePeers.filter(id => id !== peerId);
  const transport: 'p2p' | 'relayed' =
    otherPeers.length > 0 && otherPeers.every(id => p2pPeers.includes(id)) ? 'p2p' : 'relayed';

  return { messages, isConnected, isPending, activePeers, joinRequests, error, isGroup, sendMessage, sendTyping, markAsRead, acceptJoin, rejectJoin, kickPeer, latencyMs, ioLoad, peerAliases, typingPeers, secured, safetyNumbers, fingerprints, ownFingerprint, p2pPeers, transport };
}
