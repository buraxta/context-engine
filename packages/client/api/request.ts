/**
 * Ortak HTTP katmanı. Adres, jeton ve kullanıcıya görünen hata metinleri çağıran uygulamadan gelir —
 * bu paket hiçbir sunucu adresi ya da ürün metni içermez.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** Sunucunun makine kodu (ör. 'quota': deneme hakkı doldu). */
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Ağ/sunucu hatasında gösterilecek metinler. Sunucu `error` alanı gönderirse o kullanılır. */
export type ApiMessages = {
  status: (status: number) => string;
  timeout: string;
  offline: string;
};

export const DEFAULT_MESSAGES: ApiMessages = {
  status: (status) => `Sunucu ${status} döndü.`,
  timeout: 'Sunucu yanıt vermedi.',
  offline: 'Sunucuya ulaşılamadı.',
};

export type ApiConfig = {
  /** Sunucu kökü; sonundaki `/` atılır. İşlev verilirse her istekte okunur (oturum değişince güncel kalır). */
  baseUrl: string | (() => string);
  /** Oturum jetonu; boşsa `authorization` başlığı gönderilmez. */
  token: string | null | (() => string | null);
  messages?: Partial<ApiMessages>;
  /** Varsayılan zaman aşımı (ms). */
  timeoutMs?: number;
  /** Test ya da özel ortam için; yoksa küresel `fetch`. */
  fetch?: typeof fetch;
};

export type Body = Record<string, unknown>;

export type RequestOptions = {
  method?: string;
  body?: unknown;
  timeoutMs?: number;
  /** Bu istekte jeton gönderilmez (giriş, kayıt). */
  anonymous?: boolean;
};

export type Requester = {
  (path: string, options?: RequestOptions): Promise<Body>;
  url: (path: string) => string;
  token: () => string | null;
};

export function trimBase(url: string) {
  return url.trim().replace(/\/+$/, '');
}

function read<T>(value: T | (() => T)): T {
  return typeof value === 'function' ? (value as () => T)() : value;
}

export function createRequester(config: ApiConfig): Requester {
  const messages = { ...DEFAULT_MESSAGES, ...config.messages };
  const defaultTimeout = config.timeoutMs ?? 15_000;
  const url = (path: string) => `${trimBase(read(config.baseUrl))}${path}`;
  const token = () => read(config.token) || null;

  const request = async (path: string, options: RequestOptions = {}) => {
    const doFetch = config.fetch ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? defaultTimeout);
    const auth = options.anonymous ? null : token();
    const hasBody = options.body !== undefined;
    try {
      const response = await doFetch(url(path), {
        method: options.method ?? (hasBody ? 'POST' : 'GET'),
        signal: controller.signal,
        headers: {
          ...(auth ? { authorization: `Bearer ${auth}` } : {}),
          ...(hasBody ? { 'content-type': 'application/json' } : {}),
        },
        ...(hasBody ? { body: JSON.stringify(options.body) } : {}),
      });
      const text = await response.text();
      const body = text ? (JSON.parse(text) as Body) : {};
      if (!response.ok) {
        const message = typeof body.error === 'string' ? body.error : messages.status(response.status);
        throw new ApiError(message, response.status, typeof body.code === 'string' ? body.code : undefined);
      }
      return body;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof Error && error.name === 'AbortError') throw new ApiError(messages.timeout);
      throw new ApiError(messages.offline);
    } finally {
      clearTimeout(timer);
    }
  };

  return Object.assign(request, { url, token });
}

// Gelen JSON'u daraltan küçük yardımcılar: sunucu eski ya da eksik alan gönderirse güvenli varsayılan.

export function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

export function asStrings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
