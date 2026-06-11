#!/usr/bin/env node
import { runJoin } from './join.js';
import { runCreate } from './create.js';
import { parseArgs, resolveTarget } from './config.js';
import { color } from './ui.js';

const VERSION = '0.1.0';

const HELP = `${color.bold('quantum-bunker')} — terminal client for Quantum Bunker E2EE vaults

${color.bold('USAGE')}
  quantum-bunker join <hash|url> [options]
  quantum-bunker create [options]

${color.bold('COMMANDS')}
  join <hash>      Join an existing vault by its hash (or full share URL)
  create           Spin up a new vault and drop into it as host

${color.bold('OPTIONS')}
  -s, --server <url>   Relay server (default: $QB_SERVER or http://localhost:3000)
  -n, --name <alias>   Display name shown to other peers
      --token <token>  Host recovery token (re-claim host on reconnect)
      --no-join        (create) print the hash without entering the chat
  -h, --help           Show this help
  -v, --version        Print version

${color.bold('EXAMPLES')}
  quantum-bunker join a1b2c3d4 --name neo
  quantum-bunker join "https://bunker.example/?vault=a1b2c3d4"
  quantum-bunker create --name host --server https://bunker.example
`;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const { positional, flags } = parseArgs(argv);
  const command = positional[0];

  if (flags.version || flags.v) {
    process.stdout.write(VERSION + '\n');
    return;
  }
  if (flags.help || flags.h || command === 'help' || !command) {
    process.stdout.write(HELP + '\n');
    return;
  }

  const server = str(flags.server) ?? str(flags.s);
  const name = str(flags.name) ?? str(flags.n);
  const token = str(flags.token);

  if (command === 'join') {
    const hash = positional[1];
    if (!hash) throw new Error('missing vault hash. Usage: quantum-bunker join <hash>');
    const target = resolveTarget(hash, server);
    await runJoin({ target, name, recoveryToken: token });
    return;
  }

  if (command === 'create') {
    await runCreate({
      server: (server ?? process.env.QB_SERVER ?? 'http://localhost:3000').replace(/\/+$/, ''),
      name,
      join: flags['no-join'] !== true,
    });
    return;
  }

  throw new Error(`unknown command: ${command} (try --help)`);
}

function str(v: string | boolean | undefined): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

main().catch((err) => {
  process.stderr.write(color.red('✗ ') + (err instanceof Error ? err.message : String(err)) + '\n');
  process.exit(1);
});
