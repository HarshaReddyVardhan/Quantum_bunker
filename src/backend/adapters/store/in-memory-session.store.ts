import { ISessionStore } from '../../application/ports/session-store.port';
import { Session } from '../../../shared/contracts/v1/session';

export class InMemorySessionStore implements ISessionStore {
  private sessions = new Map<string, Session>();

  async save(session: Session): Promise<void> {
    this.sessions.set(session.id, session);
  }

  async get(id: string): Promise<Session | null> {
    return this.sessions.get(id) || null;
  }

  async delete(id: string): Promise<void> {
    this.sessions.delete(id);
  }

  async touch(id: string): Promise<void> {
    const sess = this.sessions.get(id);
    if (sess) {
      sess.lastActivityAt = Date.now();
    }
  }

  async cleanup(): Promise<Session[]> {
    const now = Date.now();
    const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes inactivity
    const deleted: Session[] = [];
    
    for (const [id, sess] of this.sessions.entries()) {
      const isExpired = sess.expiresAt < now;
      const isInactive = (now - sess.lastActivityAt) > INACTIVITY_TIMEOUT;
      const isEmptyTooLong = sess.participantCount === 0 && sess.emptySince !== null && (now - sess.emptySince) > 5 * 60 * 1000;

      if (isExpired || isInactive || isEmptyTooLong) {
        this.sessions.delete(id);
        deleted.push(sess);
      }
    }
    return deleted;
  }
}
