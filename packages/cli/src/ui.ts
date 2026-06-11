import * as readline from 'node:readline';

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;

function wrap(open: number, close: number) {
  return (s: string) => (useColor ? `\x1b[${open}m${s}\x1b[${close}m` : s);
}

export const color = {
  dim: wrap(2, 22),
  bold: wrap(1, 22),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  blue: wrap(34, 39),
  magenta: wrap(35, 39),
  cyan: wrap(36, 39),
  gray: wrap(90, 39),
};

// A console bound to a readline interface so async output (incoming messages,
// status lines) can be printed above the user's in-progress input without
// clobbering it.
export class Console {
  constructor(private readonly rl: readline.Interface) {}

  print(line = ''): void {
    readline.cursorTo(process.stdout, 0);
    readline.clearLine(process.stdout, 0);
    process.stdout.write(line + '\n');
    this.rl.prompt(true);
  }

  info(line: string): void {
    this.print(color.gray(line));
  }

  status(line: string): void {
    this.print(color.cyan('• ') + color.gray(line));
  }

  warn(line: string): void {
    this.print(color.yellow('! ') + line);
  }

  error(line: string): void {
    this.print(color.red('✗ ') + line);
  }
}

export function banner(lines: string[]): void {
  for (const l of lines) process.stdout.write(l + '\n');
}
