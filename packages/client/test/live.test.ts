import { describe, expect, it, vi } from 'vitest';
import { createRequester } from '../api/request';
import { createSyncApi, type LiveEvent, type ThreadMessage } from '../api/sync';
import { createLiveSync } from '../sync/live';
import { fakeFetch, hang, type Call, type Reply } from './fake-fetch';

const msg = (seq: number): ThreadMessage => ({ id: `m${seq}`, seq, role: 'user', text: `metin ${seq}`, at: '', status: 'done' });
const event = (seq: number): LiveEvent => ({ seq, type: 'message', message: msg(seq) });

/** Yol başına sıralı cevaplar; tükenince istek asılı kalır (sunucu bekliyor). */
function server(routes: Record<string, Reply[]>) {
  return fakeFetch((call: Call) => {
    const path = new URL(call.url).pathname;
    const queue = routes[path];
    return queue?.length ? queue.shift()! : hang(call);
  });
}

function setup(routes: Record<string, Reply[]>, handlers: Partial<Parameters<typeof createLiveSync>[1]> = {}) {
  const fetch = server(routes);
  const api = createSyncApi(createRequester({ baseUrl: 'https://ctx.test/', token: 'tok', fetch }));
  const messages: ThreadMessage[] = [];
  const events: LiveEvent[] = [];
  const sleep = vi.fn(async () => {});
  const live = createLiveSync(
    api,
    { onMessages: (m) => messages.push(...m), onEvents: (e) => events.push(...e), ...handlers },
    { firstPage: 50, wait: 1, sleep },
  );
  return { fetch, live, messages, events, sleep };
}

const paths = (calls: Call[]) => calls.map((c) => { const u = new URL(c.url); return `${u.pathname}${u.search}`; });

describe('createLiveSync', () => {
  it('ilk sayfayı okur, sonra son seq’ten canlı olayları izler', async () => {
    const { fetch, live, messages, events } = setup({
      '/v1/threads/main/messages': [{ body: { items: [msg(1), msg(2)], seq: 2, more: false } }],
      '/v1/live': [{ body: { seq: 4, events: [event(3), event(4)] } }],
    });
    live.start();
    await vi.waitFor(() => expect(live.seq).toBe(4));
    expect(messages.map((m) => m.seq)).toEqual([1, 2]);
    expect(events.map((e) => e.seq)).toEqual([3, 4]);
    expect(paths(fetch.calls).slice(0, 3)).toEqual([
      '/v1/threads/main/messages?limit=50', '/v1/live?since=2&wait=1', '/v1/live?since=4&wait=1',
    ]);
    expect(fetch.calls[0].headers.authorization).toBe('Bearer tok');
    live.stop();
  });

  it('reset gelince diziyi baştan okur', async () => {
    const { fetch, live, messages } = setup({
      '/v1/threads/main/messages': [
        { body: { items: [msg(1)], seq: 1, more: false } },
        { body: { items: [msg(1), msg(2)], seq: 2, more: false } },
      ],
      '/v1/live': [{ body: { seq: 0, events: [], reset: true } }],
    });
    live.start();
    await vi.waitFor(() => expect(live.seq).toBe(2));
    expect(messages.map((m) => m.seq)).toEqual([1, 1, 2]);
    expect(paths(fetch.calls)[2]).toBe('/v1/threads/main/messages?limit=50');
    live.stop();
  });

  it('pause sonrası resume kaldığı seq’ten sayfa sayfa yetişir', async () => {
    const { fetch, live, messages } = setup({
      '/v1/threads/main/messages': [
        { body: { items: [msg(1)], seq: 1, more: false } },
        { body: { items: [msg(2), msg(3)], seq: 5, more: true } },
        { body: { items: [msg(4)], seq: 5, more: false } },
      ],
    });
    live.start();
    await vi.waitFor(() => expect(live.seq).toBe(1));
    live.pause();
    expect(live.running).toBe(false);
    live.resume();
    await vi.waitFor(() => expect(live.seq).toBe(5));
    expect(live.running).toBe(true);
    expect(messages.map((m) => m.seq)).toEqual([1, 2, 3, 4]);
    expect(paths(fetch.calls)).toContain('/v1/threads/main/messages?after=1&limit=200');
    expect(paths(fetch.calls)).toContain('/v1/threads/main/messages?after=3&limit=200');
    live.stop();
  });

  it('eski sunucu (404) görülünce kapanır ve bir daha başlamaz', async () => {
    const onUnsupported = vi.fn();
    const { fetch, live } = setup({ '/v1/threads/main/messages': [{ status: 404, body: { error: 'yok' } }] }, { onUnsupported });
    live.start();
    await vi.waitFor(() => expect(onUnsupported).toHaveBeenCalledTimes(1));
    const count = fetch.calls.length;
    live.resume();
    await new Promise((r) => setTimeout(r, 10));
    expect(fetch.calls.length).toBe(count);
  });

  it('ağ hatasında artan aralıkla yeniden dener', async () => {
    const { live, sleep, messages } = setup({
      '/v1/threads/main/messages': [new Error('ağ'), new Error('ağ'), { body: { items: [msg(1)], seq: 1, more: false } }],
    });
    live.start();
    await vi.waitFor(() => expect(messages).toHaveLength(1));
    expect(sleep.mock.calls.map((c) => (c as unknown[])[0])).toEqual([2000, 4000]);
    live.stop();
  });

  it('prepare yetişmeden önce bir kez çalışır; hatası döngüyü durdurmaz', async () => {
    const order: string[] = [];
    const prepare = vi.fn(async () => {
      order.push('prepare');
      throw new Error('içe aktarma olmadı');
    });
    const { live, messages } = setup(
      { '/v1/threads/main/messages': [{ body: { items: [msg(1)], seq: 1, more: false } }] },
      { prepare, onMessages: (m) => { order.push('messages'); messages.push(...m); } },
    );
    live.start();
    await vi.waitFor(() => expect(messages).toHaveLength(1));
    expect(order).toEqual(['prepare', 'messages']);
    live.stop();
  });
});
