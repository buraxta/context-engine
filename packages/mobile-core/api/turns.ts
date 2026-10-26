import { ApiError, asRecord, asString, type Requester } from './request';

/** Sohbet turları: `POST /v1/turns` → `GET /v1/turns/:id` yoklaması (bkz. backend-core/contract.md). */

export type TurnStep = { name: string; label: string };
export type TurnVault = { mode: 'find'; q: string } | { mode: 'saved'; flush: boolean } | { mode: 'flush' };
export type TurnChange = { path: string };

/** Asistanın seçenekli sorusu (soru_sor / vaka_sec): sohbette kart olarak çizilir. */
export type AskQuestion = {
  question: string;
  header?: string;
  multi?: boolean;
  options: { label: string; description?: string }[];
};

/** Asistanın önerdiği kapalı modül. `setup`: açılırken kısa tanışma sorulacak mı. */
export type ModuleSuggestion = { module: string; label: string; intro: string; reason: string; setup: boolean };

export type TurnStatus = 'queued' | 'running' | 'done' | 'error';

export type TurnJob = {
  id: string;
  status: TurnStatus;
  steps: TurnStep[];
  answer: string | null;
  changes: TurnChange[];
  error: string | null;
  /** Hatanın makine kodu ('quota': deneme hakkı doldu — sakin kart, tekrar denenmez). */
  code?: string;
  /** Şifre isteği: model görmez, uygulama kasa sayfasını bu aramayla açar. */
  vault: TurnVault | null;
  /** Kullanıcının mesajı kilit kelimesiydi (sunucu yakaladı): balon gizlenip silinir. */
  redactUser?: boolean;
  ask?: AskQuestion[] | null;
  suggest?: ModuleSuggestion | null;
  /** Cevabı veren model. */
  model?: string | null;
};

/** Yanıtlanan mesaj (alıntı): sunucu metnin başına ekler, model neye cevap verildiğini görür. */
export type TurnQuote = { role: 'user' | 'assistant'; text: string };

const STATUSES: TurnStatus[] = ['queued', 'running', 'done', 'error'];

export function isTurnFinished(job: Pick<TurnJob, 'status'>) {
  return job.status === 'done' || job.status === 'error';
}

export function parseSuggest(value: unknown): ModuleSuggestion | null {
  const row = asRecord(value);
  if (!row || typeof row.module !== 'string' || !/^[a-z_]{1,40}$/.test(row.module) || typeof row.label !== 'string') return null;
  return {
    module: row.module,
    label: row.label,
    intro: asString(row.intro),
    reason: asString(row.reason),
    setup: row.setup === true,
  };
}

export function parseAsk(value: unknown): AskQuestion[] | null {
  if (!Array.isArray(value)) return null;
  const questions = value.flatMap((raw): AskQuestion[] => {
    const row = asRecord(raw);
    if (!row || typeof row.question !== 'string' || !Array.isArray(row.options)) return [];
    const options = row.options.flatMap((option) => {
      const o = asRecord(option);
      if (!o || typeof o.label !== 'string' || !o.label.trim()) return [];
      return [{ label: o.label, ...(typeof o.description === 'string' ? { description: o.description } : {}) }];
    });
    return options.length ? [{ question: row.question, options, ...(row.multi === true ? { multi: true } : {}) }] : [];
  });
  return questions.length ? questions : null;
}

export function parseTurnVault(value: unknown): TurnVault | null {
  const row = asRecord(value);
  if (!row) return null;
  if (row.mode === 'find' && typeof row.q === 'string') return { mode: 'find', q: row.q };
  if (row.mode === 'saved') return { mode: 'saved', flush: row.flush === true };
  if (row.mode === 'flush') return { mode: 'flush' };
  return null;
}

function parseSteps(value: unknown): TurnStep[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    const row = asRecord(raw);
    return row && typeof row.name === 'string' ? [{ name: row.name, label: asString(row.label, row.name) }] : [];
  });
}

function parseChanges(value: unknown): TurnChange[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    const row = asRecord(raw);
    return row && typeof row.path === 'string' ? [{ path: row.path }] : [];
  });
}

export function parseTurn(body: Record<string, unknown>, id: string): TurnJob {
  return {
    id: String(body.id ?? id),
    status: STATUSES.includes(body.status as TurnStatus) ? (body.status as TurnStatus) : 'error',
    steps: parseSteps(body.steps),
    answer: typeof body.answer === 'string' ? body.answer : null,
    changes: parseChanges(body.changes),
    error: typeof body.error === 'string' ? body.error : null,
    ...(typeof body.code === 'string' ? { code: body.code } : {}),
    vault: parseTurnVault(body.vault),
    redactUser: body.redactUser === true,
    ask: parseAsk(body.ask),
    suggest: parseSuggest(body.suggest),
    model: typeof body.model === 'string' && body.model ? body.model : null,
  };
}

export type TurnsOptions = {
  /** Cevap ekranda izleniyor (masaüstü): sunucu bu tur için push atmaz, `seen` beklenir. */
  watch?: boolean;
  /** Yoklama aralığı ve üst sınır (ms). */
  pollMs?: number;
  maxWaitMs?: number;
  /** Zaman aşımı metni. */
  timeoutMessage?: string;
  /** Sunucu tur kimliği/metin göndermediğinde. */
  missingIdMessage?: string;
  noSpeechMessage?: string;
};

export type SendTurnInput = { text: string; mediaIds?: string[]; quiet?: boolean; quote?: TurnQuote };

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });

export function createTurnsApi(request: Requester, options: TurnsOptions = {}) {
  const pollMs = options.pollMs ?? 250;
  const maxWaitMs = options.maxWaitMs ?? 180_000;
  const missingId = options.missingIdMessage ?? 'Tur kimliği gelmedi.';
  const watch = options.watch ? { watch: true } : {};

  async function send({ text, mediaIds, quiet = false, quote }: SendTurnInput) {
    const body = await request('/v1/turns', {
      body: {
        text,
        ...(mediaIds?.length ? { mediaIds } : {}),
        ...(quote ? { quote } : {}),
        ...(quiet ? { quiet: true } : {}),
        ...watch,
      },
    });
    if (typeof body.id !== 'string') throw new ApiError(missingId);
    return body.id;
  }

  async function transcribe(data: string, lang?: 'en') {
    const body = await request('/v1/transcribe', {
      body: lang ? { mime: 'audio/mp4', data, lang } : { mime: 'audio/mp4', data },
      timeoutMs: 130_000,
    });
    if (typeof body.text !== 'string' || !body.text.trim()) throw new ApiError(options.noSpeechMessage ?? 'Sesten metin çıkarılamadı.');
    return body.text.trim();
  }

  /** Ses → yazı → tur tek istekte. Ucu bilmeyen sunucuda (404) transcribe + turns'e düşülür. */
  async function sendVoice(data: string, { quiet = false, quote }: { quiet?: boolean; quote?: TurnQuote } = {}) {
    try {
      const body = await request('/v1/voice-turn', {
        body: { mime: 'audio/mp4', data, quiet, ...watch, ...(quote ? { quote } : {}) },
        timeoutMs: 130_000,
      });
      if (typeof body.id !== 'string' || typeof body.text !== 'string') throw new ApiError(missingId);
      return { id: body.id, text: body.text };
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        const text = await transcribe(data);
        return { id: await send({ text, quiet, quote }), text };
      }
      throw error;
    }
  }

  async function uploadImage(data: string, mime = 'image/jpeg') {
    const body = await request('/v1/media', { body: { mime, data }, timeoutMs: 60_000 });
    if (typeof body.id !== 'string') throw new ApiError(missingId);
    return body.id;
  }

  /** Çalışan tura ek metin. Tur bitmişse (409) ya da sunucu ucu bilmiyorsa (404) hata; çağıran yeni tur açar. */
  async function steer(id: string, text: string, quote?: TurnQuote) {
    await request(`/v1/turns/${encodeURIComponent(id)}/steer`, { body: quote ? { text, quote } : { text } });
  }

  /** Cevap ekranda gösterildi: sunucu bu tur için push atmaz. Hata sessiz. */
  async function markSeen(id: string) {
    await request(`/v1/turns/${encodeURIComponent(id)}/seen`, { method: 'POST' }).catch(() => {});
  }

  async function get(id: string) {
    return parseTurn(await request(`/v1/turns/${encodeURIComponent(id)}`), id);
  }

  /** Tur bitene kadar yoklar; her yanıtta `onUpdate`. `signal` iptal ederse son durumu döner. */
  async function wait(id: string, onUpdate: (job: TurnJob) => void = () => {}, signal?: AbortSignal) {
    const started = Date.now();
    for (;;) {
      const job = await get(id);
      onUpdate(job);
      if (isTurnFinished(job) || signal?.aborted) return job;
      if (Date.now() - started > maxWaitMs) throw new ApiError(options.timeoutMessage ?? 'Cevap zaman aşımına uğradı.');
      await sleep(pollMs, signal);
    }
  }

  async function clearHistory() {
    const body = await request('/v1/history', { method: 'DELETE' });
    return typeof body.turns === 'number' ? body.turns : 0;
  }

  return { send, sendVoice, transcribe, uploadImage, steer, markSeen, get, wait, clearHistory };
}

export type TurnsApi = ReturnType<typeof createTurnsApi>;
