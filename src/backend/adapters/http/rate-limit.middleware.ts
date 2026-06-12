import { Request, Response, NextFunction } from 'express';

type Counter = { count: number; windowStart: number };

const SWEEP_THRESHOLD = 10_000;

export function createRateLimiter(options: { windowMs: number; max: number }) {
  const counters = new Map<string, Counter>();

  return function rateLimit(req: Request, res: Response, next: NextFunction): void {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const counter = counters.get(key) || { count: 0, windowStart: now };

    if (now - counter.windowStart > options.windowMs) {
      counter.count = 1;
      counter.windowStart = now;
    } else {
      counter.count++;
    }
    counters.set(key, counter);

    if (counters.size > SWEEP_THRESHOLD) {
      for (const [k, c] of counters) {
        if (now - c.windowStart > options.windowMs) counters.delete(k);
      }
    }

    if (counter.count > options.max) {
      res.status(429).json({ error: 'Rate limit exceeded' });
      return;
    }
    next();
  };
}
