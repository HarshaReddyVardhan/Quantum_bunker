import { useState, useEffect, useCallback, useRef } from 'react';
import { RelayEnvelope, EnvelopeType } from './shared/contracts/v1/envelope';

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
  const socketRef = useRef<WebSocket | null>(null);
  const readSentRef = useRef<Set<string>>(new Set());

  // Disappear messages after 5 mins
  useEffect(() => {
    const interval = setInterval(() => {
      setMessages(prev => prev.filter(m => Date.now() - m.timestamp < 5 * 60 * 1000));
    }, 10000); // Check every 10s
    return () => clearInterval(interval);
  }, []);

  const sendRaw = useCallback((envelope: RelayEnvelope) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(envelope));
    }
  }, []);

  const connect = useCallback(() => {
    if (!sessionId || !peerId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log('WS Connected');
      const msg = localStorage.getItem('qb-join-msg') || 'Hello';
      const recoveryToken = localStorage.getItem(`qb-recovery-${sessionId}`);
      socket.send(JSON.stringify({ 
        type: 'join', 
        sessionId, 
        peerId, 
        message: msg,
        hostRecoveryToken: recoveryToken
      }));
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'joined') {
        setIsConnected(true);
        setIsPending(false);
        setError(null);
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
        setActivePeers(data.peers);
        setIsGroup(!!data.isGroup);
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

      // It's a relay envelope
      const env = data as RelayEnvelope;

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

      // Handle normal message
      if (env.type === EnvelopeType.PLAINTEXT || env.type === EnvelopeType.NOISE_MESSAGE) {
        setMessages(prev => {
          if (prev.some(m => m.nonce === env.nonce)) return prev; // Deduplicate
          return [...prev, { ...env, status: 'delivered', deliveredTo: [], seenBy: [] }];
        });
        
        // Auto-reply with ACK
        sendRaw({
          sessionId,
          from: peerId,
          type: EnvelopeType.ACK,
          timestamp: Date.now(),
          nonce: Math.random().toString(36).substring(7),
          payload: env.nonce,
        });
      }
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
  }, [sessionId, peerId, sendRaw]);

  const sendMessage = useCallback((payload: string, type: EnvelopeType = EnvelopeType.PLAINTEXT) => {
    if (!socketRef.current || !isConnected || !sessionId || !peerId || activePeers.length <= 1) return;

    const envelope: RelayEnvelope = {
      sessionId,
      from: peerId,
      type,
      timestamp: Date.now(),
      nonce: Math.random().toString(36).substring(7),
      payload,
    };

    sendRaw(envelope);
    
    setMessages(prev => [...prev, {
      ...envelope,
      status: 'sent',
      deliveredTo: [],
      seenBy: []
    }]);
  }, [isConnected, sessionId, peerId, activePeers.length, sendRaw]);

  const markAsRead = useCallback((nonce: string) => {
    if (!sessionId || !peerId || readSentRef.current.has(nonce)) return;
    readSentRef.current.add(nonce);
    
    sendRaw({
      sessionId,
      from: peerId,
      type: EnvelopeType.READ,
      timestamp: Date.now(),
      nonce: Math.random().toString(36).substring(7),
      payload: nonce,
    });
  }, [sessionId, peerId, sendRaw]);

  useEffect(() => {
    if (sessionId && peerId) {
      connect();
    }
    return () => {
      socketRef.current?.close();
    };
  }, [sessionId, peerId, connect]);

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

  return { messages, isConnected, isPending, activePeers, joinRequests, error, isGroup, sendMessage, markAsRead, acceptJoin, rejectJoin, kickPeer };
}
