import { asRecord, type Requester } from './request';
import type { AskQuestion, TurnChange, TurnStep } from './turns';

/**
 * Cihazlar arası senkron uçları (context-server `src/sync.js`): kalıcı ana sohbet dizisi, canlı kanal (`/v1/live`),
 * küçük ortak durum (`/v1/state`, anahtar başına son yazan kazanır) ve varlık (`/v1/presence`).
 * Eski sunucu bu uçları bilmez (404): çağıran senkronu kapatır.
 */

export type ThreadMessage = {
  id: string;
  seq: number;
  role: 'user' | 'assistant';
  text: string;
  at: string;
  status: 'pending' | 'done' | 'error';
  jobId?: string;
  deviceId?: string;
  model?: string;
  source?: string;
  title?: string;
  url?: string;
  taskId?: string;
  error?: string;
  quote?: { id?: string; role: 'user' | 'assistant'; text: string; title?: string };
  steps?: TurnStep[];
  changes?: TurnChange[];
  ask?: AskQuestion[];
  images?: number;
  redacted?: boolean;
};

export type DeviceKind = 'phone' | 'desktop' | 'web';

export type PresenceRow = {
  deviceId: string;
  name: string;
  kind: DeviceKind;
  /** Ekranın kısa adı (`kod`, `sohbet`…). */
  screen: string;
  /** Öbür cihazda açılacak adres (örn. `/kod?p=helm&s=…`). */
  ref: string;
  /** Şeritte görünen ad (örn. `Kod › helm · Giriş sayfası`). */
  title?: string;
  active: boolean;
  activeAt: string;
};

export type PresenceInput = {
  /** Kurulumun kalıcı kimliği; aynı jetonu paylaşan cihazları ayırır. */
  client: string;
  kind: DeviceKind;
  screen: string;
  ref: string;
  title: string;
  active: boolean;
};

export type LiveEvent =
  | { seq: number; type: 'message'; message: ThreadMessage }
  | { seq: number; type: 'message.partial'; id: string; jobId: string; text: string }
  | { seq: number; type: 'thread.cleared' }
  | { seq: number; type: 'state'; key: string; value: unknown; updatedAt?: string; deviceId?: string }
  | { seq: number; type: 'presence'; presence: PresenceRow };

/** `reset`: sunucu yeniden başladı ya da çok geride kalındı — dizi baştan okunmalı. */
export type LivePage = { seq: number; events: LiveEvent[]; reset?: boolean };

export type ThreadPage = { items: ThreadMessage[]; seq: number; more: boolean };

export type SyncStateEntry = { value: unknown; updatedAt: string; deviceId?: string };

function threadRows(rows: unknown): ThreadMessage[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row): row is ThreadMessage => {
    const r = asRecord(row);
    return !!r && typeof r.id === 'string' && typeof r.text === 'string';
  });
}

export function createSyncApi(request: Requester) {
  return {
    /** Dizi sayfası: `after` verilmezse son `limit` mesaj. */
    async thread(opts: { after?: number; limit?: number } = {}): Promise<ThreadPage> {
      const query = new URLSearchParams();
      if (opts.after != null) query.set('after', String(opts.after));
      if (opts.limit) query.set('limit', String(opts.limit));
      const body = await request(`/v1/threads/main/messages?${query.toString()}`);
      return { items: threadRows(body.items), seq: Number(body.seq) || 0, more: body.more === true };
    },

    /** Yerel yazışmayı bir kez yükler; sunucu kimliğe göre tekilleştirir. */
    async importThread(items: unknown[]) {
      const body = await request('/v1/threads/main/import', { body: { items }, timeoutMs: 60_000 });
      return { added: Number(body.added) || 0, seq: Number(body.seq) || 0 };
    },

    /** Uzun istek: yeni olay yoksa sunucu `wait` sn bekler. */
    async live(since: number, wait = 25): Promise<LivePage> {
      const body = await request(`/v1/live?since=${since}&wait=${wait}`, { timeoutMs: (wait + 10) * 1000 });
      return {
        seq: Number(body.seq) || 0,
        events: Array.isArray(body.events) ? (body.events as LiveEvent[]) : [],
        ...(body.reset === true ? { reset: true } : {}),
      };
    },

    async readState(prefix = '') {
      const body = await request(`/v1/state?prefix=${encodeURIComponent(prefix)}`);
      return (asRecord(body.state) ?? {}) as Record<string, SyncStateEntry>;
    },

    /** Anahtar başına son yazan kazanır; `null` siler. Değer ≤16 KB. */
    async patchState(changes: Record<string, unknown>) {
      await request('/v1/state', { method: 'PATCH', body: { state: changes } });
    },

    /** Bu cihazın yerini bildirir; öbür cihazları döner. */
    async presence(input: PresenceInput) {
      const body = await request('/v1/presence', { body: input });
      return Array.isArray(body.others) ? (body.others as PresenceRow[]) : [];
    },
  };
}

export type SyncApi = ReturnType<typeof createSyncApi>;
