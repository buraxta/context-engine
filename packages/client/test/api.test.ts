import { describe, expect, it } from 'vitest';
import { createApiClient } from '../api/client';
import { fakeFetch, type Handler } from './fake-fetch';

const BOARDS = { boards: [{ id: 'b1', name: 'İş', sections: [{ key: 'acil', name: 'Acil', cards: [] }] }] };

function client(handler: Handler) {
  const fetch = fakeFetch(handler);
  return { api: createApiClient({ baseUrl: 'https://x.test/', token: 'tok', fetch }), calls: fetch.calls };
}

describe('yapılacaklar: silme ve zamanlı oluşturma', () => {
  it('deleteTodo DELETE atar, başlık ve panoları döner', async () => {
    const { api, calls } = client(() => ({ body: { title: 'Süt al', ...BOARDS } }));
    const out = await api.todos.deleteTodo('a/b');
    expect(calls[0]).toMatchObject({ url: 'https://x.test/v1/todos/a%2Fb', method: 'DELETE' });
    expect(out.title).toBe('Süt al');
    expect(out.boards[0].name).toBe('İş');
  });

  it('createTodo when/repeat gönderir; id ve vade döner, eski sunucuda id null', async () => {
    const { api, calls } = client(() => ({ body: { id: 't1', due: '2026-10-27T09:00:00+03:00', toast: 'Yarın 09:00', ...BOARDS } }));
    const input = { boardId: 'b1', title: 'Koş', description: '', key: 'acil' as const, when: 'yarın 9', repeat: 'daily' };
    expect(await api.todos.createTodo(input)).toMatchObject({ id: 't1', due: '2026-10-27T09:00:00+03:00', toast: 'Yarın 09:00' });
    expect(calls[0]).toMatchObject({ method: 'POST', body: { when: 'yarın 9', repeat: 'daily' } });

    const old = client(() => ({ body: BOARDS }));
    expect(await old.api.todos.createTodo(input)).toMatchObject({ id: null, due: null, toast: null });
    // Eski imza: yalnız panolar.
    expect(await old.api.todos.create(input)).toHaveLength(1);
  });

  it('kartta tekrar kuralı yalnız varsa gelir', async () => {
    const card = (extra: object) => ({ boards: [{ id: 'b', name: 'B', sections: [{ key: 'normal', name: 'N', cards: [{ id: 'c', title: 'T', ...extra }] }] }] });
    expect((await client(() => ({ body: card({ repeat: 'günlük' }) })).api.todos.list())[0].sections[0].cards[0].repeat).toBe('günlük');
    expect('repeat' in (await client(() => ({ body: card({ repeat: null }) })).api.todos.list())[0].sections[0].cards[0]).toBe(false);
  });
});

describe('hafıza: son öğrendiklerim, düzelt, sil', () => {
  const file = { key: 'kurallar', label: 'Kurallar', path: 'Hafiza/kurallar.md', sections: [{ title: '', items: ['Çay şekersiz'] }] };

  it('recent bilinmeyen dosyayı eler', async () => {
    const { api, calls } = client(() => ({
      body: { items: [{ key: 'sozluk', label: 'Sözlük', text: 'kase: kahvaltı', at: '2026-10-26T10:00:00Z' }, { key: 'gizli', text: 'x' }] },
    }));
    expect(await api.memory.recent(5)).toEqual([{ key: 'sozluk', label: 'Sözlük', text: 'kase: kahvaltı', at: '2026-10-26T10:00:00Z' }]);
    expect(calls[0].url).toBe('https://x.test/v1/memory/recent?limit=5');
  });

  it('patchItem ve deleteItem doğru uca gider, güncel dosyayı döner', async () => {
    const { api, calls } = client(() => ({ body: { ok: true, file } }));
    expect((await api.memory.patchItem('kurallar', 'Kahve şekersiz', 'Çay şekersiz'))?.sections[0].items).toEqual(['Çay şekersiz']);
    expect(calls[0]).toMatchObject({ url: 'https://x.test/v1/memory/kurallar', method: 'PATCH', body: { eski: 'Kahve şekersiz', satir: 'Çay şekersiz' } });
    await api.memory.deleteItem('sozluk', 'kase: kahvaltı');
    expect(calls[1]).toMatchObject({ url: 'https://x.test/v1/memory/sozluk?eski=kase%3A%20kahvalt%C4%B1', method: 'DELETE' });
  });
});

describe('hesap: veri indir, sil, bildirim, oturumlar', () => {
  it('exportData tam adres döner; prepareExport ile aynı', async () => {
    const { api, calls } = client(() => ({ body: { url: '/v1/export/abc', expiresInSec: 300, bytes: 10 } }));
    expect(await api.account.exportData()).toEqual({ url: 'https://x.test/v1/export/abc', expiresInSec: 300, bytes: 10 });
    expect(api.account.exportData).toBe(api.account.prepareExport);
    expect(calls[0]).toMatchObject({ method: 'POST', url: 'https://x.test/v1/me/export' });
  });

  it('registerPush jeton, platform ve kanalları gönderir', async () => {
    const { api, calls } = client(() => ({ body: { ok: true } }));
    await api.account.registerPush('ExponentPushToken[x]', { platform: 'ios' });
    await api.account.registerPush('ExponentPushToken[y]');
    expect(calls[0]).toMatchObject({ url: 'https://x.test/v1/push/register', method: 'POST', body: { token: 'ExponentPushToken[x]', platform: 'ios' } });
    expect(calls[1].body).toEqual({ token: 'ExponentPushToken[y]' });
  });

  it('deleteAccount, sessions, changePassword uçları', async () => {
    const { api, calls } = client(() => ({ body: { ok: true, sessions: [] } }));
    await api.account.deleteAccount('şifre');
    await api.account.sessions();
    await api.account.changePassword('a', 'b');
    expect(calls.map((c) => `${c.method} ${c.url.slice('https://x.test'.length)}`)).toEqual([
      'DELETE /v1/me', 'GET /v1/me/sessions', 'POST /v1/me/password',
    ]);
    expect(calls[0].body).toEqual({ password: 'şifre' });
  });
});
