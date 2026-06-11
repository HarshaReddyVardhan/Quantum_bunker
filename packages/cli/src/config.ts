export interface Target {
  server: string;
  sessionId: string;
}

const DEFAULT_SERVER = 'http://localhost:3000';

// Accepts either a bare vault hash or a full share link
// (e.g. https://host/?vault=<id>). A URL also pins the server origin unless
// --server overrides it.
export function resolveTarget(hash: string, serverOpt?: string): Target {
  const raw = hash.trim();
  if (/^https?:\/\//i.test(raw)) {
    const url = new URL(raw);
    const vault = url.searchParams.get('vault') ?? url.hash.replace(/^#\/?/, '');
    return {
      server: stripSlash(serverOpt ?? url.origin),
      sessionId: vault.trim(),
    };
  }
  return {
    server: stripSlash(serverOpt ?? process.env.QB_SERVER ?? DEFAULT_SERVER),
    sessionId: raw,
  };
}

export function wsUrl(server: string): string {
  const url = new URL(server);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${url.protocol}//${url.host}/ws`;
}

export interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
}

// Minimal flag parser: `--key value`, `--flag`, and `-x` shorthands.
export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      const key = arg.slice(1);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function stripSlash(s: string): string {
  return s.replace(/\/+$/, '');
}
