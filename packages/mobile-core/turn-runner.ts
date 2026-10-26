import { ApiError } from './api/request';
import type { TurnJob, TurnQuote, TurnsApi } from './api/turns';

/**
 * Tur akışı, ekrandan bağımsız: yeni tur aç → yokla → bitir. Bir tur sürerken gelen düz metin yeni tur
 * açmaz, sürene eklenir (steer); tur o arada bitmişse (409/404) yeni tur açılır.
 * Yazışma, bildirim, titreşim gibi yan etkiler çağıranda kalır.
 */

export type TurnInput = {
  text: string;
  /** Yerel görsel adresleri; `readImage` ile base64'e çevrilip yüklenir. */
  images?: string[];
  /** Ses (base64 m4a): metin yerine; sunucu yazıya çevirip turu başlatır. */
  audio?: string;
  quiet?: boolean;
  quote?: TurnQuote;
};

export type TurnHandlers = {
  /** Yeni tur açılacak (kullanıcı balonu + bekleyen kart burada eklenir). */
  onStart?: () => void;
  /** Sunucu tur kimliğini verdi; ses ise yazıya dökülmüş metin de gelir. */
  onStarted?: (id: string, text: string) => void;
  /** Her yoklamada (yalnız durum, adım sayısı ya da cevap uzunluğu değişince). */
  onUpdate?: (job: TurnJob) => void;
};

export type TurnOutcome =
  | { kind: 'empty' }
  | { kind: 'steered'; text: string }
  | { kind: 'done'; id: string; job: TurnJob }
  | { kind: 'failed'; error: ApiError; quota: boolean; started: boolean };

export type TurnRunnerOptions = {
  turns: TurnsApi;
  /** Yerel görseli base64'e çevirir (platforma özgü). */
  readImage?: (uri: string) => Promise<string>;
  /** Yeni tur açılmadan önce (ör. uzun aradan sonra sunucu hafızasını temizlemek). Steer'de çağrılmaz. */
  beforeStart?: () => Promise<void>;
  failMessage?: string;
};

/** Deneme/kullanım hakkı doldu: sakin bilgi kartı, tekrar denenmez. */
export function isQuotaError(error: unknown) {
  return error instanceof ApiError && error.code === 'quota';
}

/** Tur bitmiş ya da sunucu steer ucunu bilmiyor: yeni tur açılır. */
export function isSteerMissed(error: unknown) {
  if (!(error instanceof ApiError)) return false;
  if (error.status === 404 || error.status === 409) return true;
  return /Tur bitti|Tur bulunamadı|^Yok\.$/.test(error.message);
}

type Live = { jobId: string | null; waiters: ((id: string | null) => void)[] };

export function createTurnRunner({ turns, readImage, beforeStart, failMessage = 'Gönderilemedi.' }: TurnRunnerOptions) {
  let live: Live | null = null;

  const publish = (turn: Live, id: string) => {
    turn.jobId = id;
    for (const waiter of turn.waiters.splice(0)) waiter(id);
  };
  const end = (turn: Live) => {
    for (const waiter of turn.waiters.splice(0)) waiter(null);
    if (live === turn) live = null;
  };
  const waitId = (turn: Live) =>
    turn.jobId ? Promise.resolve(turn.jobId) : new Promise<string | null>((resolve) => turn.waiters.push(resolve));
  const asApiError = (error: unknown) => (error instanceof ApiError ? error : new ApiError(failMessage));

  async function send(input: TurnInput, handlers: TurnHandlers = {}): Promise<TurnOutcome> {
    const text = input.text.trim();
    const images = input.images ?? [];
    if (!text && images.length === 0 && !input.audio) return { kind: 'empty' };

    if (live && !input.audio && images.length === 0) {
      const current = live;
      try {
        const id = await waitId(current);
        if (id && live === current) {
          await turns.steer(id, text, input.quote);
          return { kind: 'steered', text };
        }
      } catch (error) {
        if (!isSteerMissed(error)) return { kind: 'failed', error: asApiError(error), quota: isQuotaError(error), started: false };
        end(current);
      }
    }

    const turn: Live | null = live ? null : { jobId: null, waiters: [] };
    if (turn) live = turn;
    let started = false;
    try {
      await beforeStart?.();
      handlers.onStart?.();
      let id: string;
      let sent = text;
      if (input.audio) {
        const voice = await turns.sendVoice(input.audio, { quiet: input.quiet, quote: input.quote });
        id = voice.id;
        sent = voice.text;
      } else {
        const mediaIds: string[] = [];
        for (const uri of images) {
          if (!readImage) throw new ApiError(failMessage);
          mediaIds.push(await turns.uploadImage(await readImage(uri)));
        }
        id = await turns.send({ text, mediaIds, quiet: input.quiet, quote: input.quote });
      }
      started = true;
      handlers.onStarted?.(id, sent);
      if (turn) publish(turn, id);
      let seen = '';
      const job = await turns.wait(id, (update) => {
        const key = `${update.status}|${update.steps.length}|${typeof update.answer === 'string' ? update.answer.length : -1}`;
        if (key === seen) return;
        seen = key;
        handlers.onUpdate?.(update);
      });
      return { kind: 'done', id, job };
    } catch (error) {
      return { kind: 'failed', error: asApiError(error), quota: isQuotaError(error), started };
    } finally {
      if (turn) end(turn);
    }
  }

  return {
    send,
    /** Şu an süren tur var mı. */
    busy: () => live !== null,
  };
}

export type TurnRunner = ReturnType<typeof createTurnRunner>;
