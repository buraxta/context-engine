/** Testler için sahte `fetch`: çağrıları kaydeder, sıradaki cevabı işleyiciden alır. */

export type Call = { url: string; method: string; headers: Record<string, string>; body: unknown; signal?: AbortSignal };
export type Reply = { status?: number; body?: unknown; text?: string } | Error;
export type Handler = (call: Call) => Reply | Promise<Reply>;

export function fakeFetch(handler: Handler) {
  const calls: Call[] = [];
  const fn = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const call: Call = {
      url: String(input),
      method: init.method ?? 'GET',
      headers: { ...(init.headers as Record<string, string>) },
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      signal: init.signal ?? undefined,
    };
    calls.push(call);
    const reply = await handler(call);
    if (reply instanceof Error) throw reply;
    const status = reply.status ?? 200;
    const text = reply.text ?? (reply.body === undefined ? '' : JSON.stringify(reply.body));
    return { ok: status >= 200 && status < 300, status, text: async () => text } as Response;
  }) as typeof fetch;
  return Object.assign(fn, { calls });
}

/** `signal` iptal edilene kadar asılı kalan istek (uzun istek / zaman aşımı taklidi). */
export function hang(call: Call) {
  return new Promise<Reply>((_, reject) => {
    const abort = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    if (call.signal?.aborted) abort();
    call.signal?.addEventListener('abort', abort);
  });
}
