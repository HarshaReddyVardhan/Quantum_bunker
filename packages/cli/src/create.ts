import { runJoin } from './join.js';
import { color, banner } from './ui.js';
import { Target } from './config.js';

export interface CreateOptions {
  server: string;
  name?: string;
  join: boolean;
}

interface CreateResponse {
  sessionId: string;
  name?: string;
  expiresAt: number;
  hostId: string;
  hostRecoveryToken: string;
}

export async function runCreate(opts: CreateOptions): Promise<void> {
  const resp = await fetch(`${opts.server}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: opts.name }),
  });
  if (!resp.ok) {
    throw new Error(`failed to create vault: server returned ${resp.status}`);
  }
  const data = (await resp.json()) as CreateResponse;

  banner([
    '',
    color.bold(color.cyan('  VAULT CREATED')),
    color.gray('  hash      ') + color.bold(data.sessionId),
    color.gray('  recovery  ') + data.hostRecoveryToken,
    color.gray('  expires   ') + new Date(data.expiresAt).toLocaleTimeString(),
    '',
    color.gray('  share:    ') + `quantum-bunker join ${data.sessionId}` +
      (opts.server ? color.gray(`  --server ${opts.server}`) : ''),
    '',
  ]);

  if (!opts.join) return;

  const target: Target = { server: opts.server, sessionId: data.sessionId };
  await runJoin({ target, name: opts.name, recoveryToken: data.hostRecoveryToken });
}
