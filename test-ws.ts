import { WebSocket } from 'ws';

async function test() {
  console.log("Creating session...");
  const res = await fetch('http://localhost:3000/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresInSeconds: 3600 })
  });
  
  const hostData = await res.json();
  console.log("Created session:", hostData);
  
  const hostWs = new WebSocket('ws://localhost:3000/ws');
  
  hostWs.on('open', () => {
    console.log("Host WS open");
    hostWs.send(JSON.stringify({
      type: 'join',
      sessionId: hostData.sessionId,
      peerId: hostData.hostId,
      message: 'host join'
    }));
  });
  
  hostWs.on('message', (data) => {
    console.log("Host received:", JSON.parse(data.toString()));
  });

  // wait 1 sec, then join as guest
  setTimeout(async () => {
    console.log("Joining session...");
    const guestRes = await fetch(`http://localhost:3000/api/sessions/${hostData.sessionId}`);
    const guestSessionData = await guestRes.json();
    console.log("Fetched session:", guestSessionData);
    
    const guestWs = new WebSocket('ws://localhost:3000/ws');
    guestWs.on('open', () => {
      console.log("Guest WS open");
      guestWs.send(JSON.stringify({
        type: 'join',
        sessionId: hostData.sessionId,
        peerId: 'user-test',
        message: 'guest join'
      }));
    });
    
    guestWs.on('message', (data) => {
      console.log("Guest received:", JSON.parse(data.toString()));
    });
  }, 1000);
}

test().catch(console.error);
