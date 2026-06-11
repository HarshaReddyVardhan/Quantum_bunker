// Resolves the RTCConfiguration used for every peer connection.
//
// Default is an EMPTY iceServers list: peers connect via host candidates only
// (LAN / localhost / same network) and no public IP is leaked to any third
// party. Operators who need NAT traversal set VITE_ICE_SERVERS to either a JSON
// array of RTCIceServer objects or a comma-separated list of URLs.

export function parseIceServers(raw: string | undefined): RTCIceServer[] {
  if (!raw || !raw.trim()) return [];

  const text = raw.trim();
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.filter(s => s && typeof s === 'object' && 'urls' in s) as RTCIceServer[];
      }
    } catch {
      return [];
    }
    return [];
  }

  const urls = text.split(',').map(u => u.trim()).filter(Boolean);
  return urls.length ? [{ urls }] : [];
}

export function getIceConfig(): RTCConfiguration {
  const meta = import.meta as unknown as { env?: Record<string, string | undefined> };
  return { iceServers: parseIceServers(meta.env?.VITE_ICE_SERVERS) };
}
