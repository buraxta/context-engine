/**
 * kod-runner HTTP katmanı. Bağlantı (`{ apiUrl, token }`) her çağrıda parametre: telefon güvenli depodan, masaüstü
 * kendi ayarından okur — bu paket saklamaz. Kilitliyse sunucu 423 döner (`isLocked`), arayüz kilit kelimesini sorar.
 */

export type KodConn = { apiUrl: string; token: string };

export class KodError extends Error {
  constructor(
    message: string,
    /** HTTP durumu; 0 = ağ/zaman aşımı, -1 = çağıran iptal etti. */
    readonly status: number,
  ) {
    super(message);
    this.name = 'KodError';
  }
}

export const isLocked = (error: unknown) => error instanceof KodError && error.status === 423;
export const isCancelled = (error: unknown) => error instanceof KodError && error.status === -1;

/** Kullanıcıya görünen hata metinleri; sunucu `error` alanı gönderirse o kullanılır. */
export type KodMessages = {
  status: (status: number) => string;
  timeout: string;
  offline: string;
  cancelled: string;
};

export const DEFAULT_KOD_MESSAGES: KodMessages = {
  status: (status) => `Sunucu ${status} döndü.`,
  timeout: 'Kod sunucusu yanıt vermedi.',
  offline: 'Kod sunucusuna ulaşılamadı.',
  cancelled: 'İptal edildi.',
};

export type KodOptions = {
  /** Test ya da özel ortam (ör. Electron vekili) için; yoksa küresel `fetch` (çağrı anında okunur). */
  fetch?: typeof fetch;
  messages?: Partial<KodMessages>;
};

export type KodInit = { method?: string; body?: unknown; signal?: AbortSignal };

export type KodRequest = <T>(conn: KodConn, path: string, init?: KodInit, timeoutMs?: number) => Promise<T>;

export const kodUrl = (conn: KodConn, path: string) => `${conn.apiUrl.trim().replace(/\/+$/, '')}${path}`;

export function createKodRequest(options: KodOptions = {}): KodRequest {
  const messages = { ...DEFAULT_KOD_MESSAGES, ...options.messages };
  return async <T>(conn: KodConn, path: string, init: KodInit = {}, timeoutMs = 20_000): Promise<T> => {
    const doFetch = options.fetch ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    // dışarıdan iptal (canlı akış yeniden kurulurken): ayrı hata, ağ hatası sayılmaz
    let cancelled = false;
    const onCancel = () => {
      cancelled = true;
      controller.abort();
    };
    if (init.signal?.aborted) onCancel();
    init.signal?.addEventListener('abort', onCancel);
    const hasBody = init.body !== undefined;
    const token = conn.token.trim();
    try {
      const response = await doFetch(kodUrl(conn, path), {
        method: init.method ?? (hasBody ? 'POST' : 'GET'),
        signal: controller.signal,
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(hasBody ? { 'content-type': 'application/json' } : {}),
        },
        ...(hasBody ? { body: JSON.stringify(init.body) } : {}),
      });
      const text = await response.text();
      let body: unknown = {};
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        // vekil/ağ geçidi HTML döndüyse: hata durumunda durum metni, başarıda boş gövde değil hata
        if (response.ok) throw new KodError(messages.status(response.status), response.status);
      }
      if (!response.ok) {
        const error = (body as { error?: unknown } | null)?.error;
        throw new KodError(typeof error === 'string' ? error : messages.status(response.status), response.status);
      }
      return body as T;
    } catch (error) {
      if (error instanceof KodError) throw error;
      if (cancelled) throw new KodError(messages.cancelled, -1);
      if (error instanceof Error && error.name === 'AbortError') throw new KodError(messages.timeout, 0);
      throw new KodError(messages.offline, 0);
    } finally {
      clearTimeout(timer);
      init.signal?.removeEventListener('abort', onCancel);
    }
  };
}
