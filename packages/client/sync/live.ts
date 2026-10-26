import { ApiError } from '../api/request';
import type { LiveEvent, SyncApi, ThreadMessage } from '../api/sync';

/**
 * Canlı kanal döngüsü, platformsuz: diziyi yetişir, sonra `/v1/live` uzun isteğiyle izler. Telefon arka plana
 * geçince `pause()`, öne gelince `resume()` (kaldığı seq'ten); masaüstü hep açık tutar.
 * Eski sunucu (404) görülünce döngü kendiliğinden biter.
 */

export type LiveHandlers = {
  /** Diziden okunan (ilk sayfa ya da yetişme) mesajlar. */
  onMessages: (messages: ThreadMessage[]) => void;
  /** Canlı olaylar, geldiği sırayla. */
  onEvents: (events: LiveEvent[]) => void;
  /** Açılışta bir kez, yetişmeden önce (örn. yerel yazışmayı içe aktarma). Hata döngüyü durdurmaz; 404 durdurur. */
  prepare?: () => Promise<void>;
  /** Sunucu senkronu bilmiyor (404). */
  onUnsupported?: () => void;
};

export type LiveOptions = {
  /** İlk açılışta okunacak son mesaj sayısı. */
  firstPage?: number;
  /** Uzun istek bekleme süresi (sn). */
  wait?: number;
  /** Testte beklemeyi kısaltmak için. */
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const isMissing = (error: unknown) => error instanceof ApiError && error.status === 404;

export function createLiveSync(api: SyncApi, handlers: LiveHandlers, options: LiveOptions = {}) {
  const firstPage = options.firstPage ?? 200;
  const sleep = options.sleep ?? defaultSleep;
  let seq: number | null = null;
  let generation = 0;
  let stopped = true;
  let prepared = false;
  let unsupported = false;

  const unsupportedNow = () => {
    unsupported = true;
    handlers.onUnsupported?.();
  };

  const catchUp = async (mine: number) => {
    if (seq == null) {
      const page = await api.thread({ limit: firstPage });
      if (mine !== generation) return;
      handlers.onMessages(page.items);
      seq = page.seq;
      return;
    }
    let more = true;
    while (more && mine === generation) {
      const page = await api.thread({ after: seq, limit: 200 });
      if (mine !== generation) return;
      handlers.onMessages(page.items);
      const last = page.items.at(-1)?.seq;
      more = page.more && last != null;
      if (last != null) seq = last;
      if (!more) seq = Math.max(seq ?? 0, page.seq);
    }
  };

  const loop = async (mine: number) => {
    if (!prepared && handlers.prepare) {
      try {
        await handlers.prepare();
        prepared = true;
      } catch (error) {
        if (isMissing(error)) return unsupportedNow();
      }
    }
    let backoff = 2000;
    while (mine === generation) {
      try {
        await catchUp(mine);
        while (mine === generation) {
          const page = await api.live(seq ?? 0, options.wait);
          if (mine !== generation) return;
          if (page.reset) {
            seq = null;
            break;
          }
          if (page.events.length) handlers.onEvents(page.events);
          seq = Math.max(seq ?? 0, page.seq);
          backoff = 2000;
        }
      } catch (error) {
        if (isMissing(error)) return unsupportedNow();
        if (mine !== generation) return;
        await sleep(backoff);
        backoff = Math.min(30_000, backoff * 2);
      }
    }
  };

  const resume = () => {
    if (unsupported) return;
    stopped = false;
    generation += 1;
    void loop(generation);
  };

  return {
    /** Başlatır ya da (duraklatılmışsa) kaldığı yerden sürdürür. */
    resume,
    start: resume,
    /** Uçuştaki istek biter ama sonucu yok sayılır; yeni istek açılmaz. */
    pause: () => {
      generation += 1;
      stopped = true;
    },
    stop: () => {
      generation += 1;
      stopped = true;
    },
    get running() {
      return !stopped;
    },
    /** Bilinen son olay numarası. */
    get seq() {
      return seq;
    },
  };
}

export type LiveSync = ReturnType<typeof createLiveSync>;
