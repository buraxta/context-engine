import { describe, expect, it } from 'vitest';
import { kod } from '../index';
import { fakeFetch, hang, type Handler } from './fake-fetch';

const conn: kod.KodConn = { apiUrl: 'https://kod.test:8443//', token: ' gizli ' };

function setup(handler: Handler = () => ({ body: {} }), messages?: Partial<kod.KodMessages>) {
  const fetch = fakeFetch(handler);
  return { fetch, api: kod.createKodApi({ fetch, messages }) };
}

const last = (fetch: ReturnType<typeof fakeFetch>) => fetch.calls.at(-1)!;

describe('kod istemcisi: istek', () => {
  it('adres sonundaki / atılır, jeton Bearer başlığında', async () => {
    const { fetch, api } = setup(() => ({ body: { ok: true, locked: false } }));
    const health = await api.health(conn);
    expect(health.ok).toBe(true);
    expect(last(fetch)).toMatchObject({ url: 'https://kod.test:8443/v1/health', method: 'GET' });
    expect(last(fetch).headers).toEqual({ authorization: 'Bearer gizli' });
  });

  it('gövdeli istek POST + JSON; jeton boşsa başlık yok', async () => {
    const { fetch, api } = setup();
    await api.unlock({ apiUrl: 'https://kod.test', token: '' }, 'kelime');
    expect(last(fetch)).toMatchObject({ url: 'https://kod.test/v1/unlock', method: 'POST', body: { passphrase: 'kelime' } });
    expect(last(fetch).headers).toEqual({ 'content-type': 'application/json' });
  });

  it('gövdesiz POST ve DELETE yöntemi korunur', async () => {
    const { fetch, api } = setup();
    await api.lock(conn);
    expect(last(fetch)).toMatchObject({ method: 'POST', body: undefined });
    expect(last(fetch).headers['content-type']).toBeUndefined();
    await api.cancelSchedule(conn, 's1');
    expect(last(fetch)).toMatchObject({ url: 'https://kod.test:8443/v1/schedules/s1', method: 'DELETE' });
  });

  it('sunucunun hata metni ve durumu KodError olur; 423 kilit sayılır', async () => {
    const { api } = setup(() => ({ status: 423, body: { error: 'Kilitli' } }));
    const error = await api.projects(conn).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(kod.KodError);
    expect(error).toMatchObject({ message: 'Kilitli', status: 423 });
    expect(kod.isLocked(error)).toBe(true);
  });

  it('hata gövdesi JSON değilse durum metni; uygulama metni verilebilir', async () => {
    const { api } = setup(() => ({ status: 502, text: '<html>Bad gateway</html>' }), { status: (s) => `Hata ${s}` });
    await expect(api.projects(conn)).rejects.toMatchObject({ message: 'Hata 502', status: 502 });
  });

  it('ağ hatası 0 durumlu, uygulamanın metniyle', async () => {
    const { api } = setup(() => new TypeError('Network request failed'), { offline: 'Tailscale açık mı?' });
    await expect(api.health(conn)).rejects.toMatchObject({ message: 'Tailscale açık mı?', status: 0 });
  });

  it('zaman aşımı 0, çağıranın iptali -1 döner', async () => {
    const { api } = setup(hang);
    await expect(api.request(conn, '/v1/health', {}, 5)).rejects.toMatchObject({ message: 'Kod sunucusu yanıt vermedi.', status: 0 });
    const controller = new AbortController();
    const pending = api.searchSessions(conn, 'x', controller.signal).catch((e: unknown) => e);
    controller.abort();
    const error = await pending;
    expect(kod.isCancelled(error)).toBe(true);
  });

  it('fetch verilmezse küresel fetch çağrı anında okunur', async () => {
    const fetch = fakeFetch(() => ({ body: [] }));
    const api = kod.createKodApi();
    const original = globalThis.fetch;
    globalThis.fetch = fetch;
    try {
      await api.projects(conn);
    } finally {
      globalThis.fetch = original;
    }
    expect(fetch.calls).toHaveLength(1);
  });
});

describe('kod istemcisi: uç yolları', () => {
  const cases: [string, (api: kod.KodApi) => Promise<unknown>, string, string, unknown?][] = [
    ['proje (oturum)', (a) => a.project(conn, 'helm', 'a b'), 'GET', '/v1/projects/helm?session=a%20b'],
    ['proje (ana klon)', (a) => a.project(conn, 'helm'), 'GET', '/v1/projects/helm'],
    ['koşu başlat', (a) => a.startRun(conn, { projectId: 'helm', prompt: 'yap' }), 'POST', '/v1/runs', { projectId: 'helm', prompt: 'yap' }],
    ['koşular', (a) => a.runs(conn, 'helm', 's1'), 'GET', '/v1/projects/helm/runs?session=s1'],
    ['yükleme', (a) => a.upload(conn, 'QUJD'), 'POST', '/v1/uploads', { base64: 'QUJD', type: 'image/jpeg' }],
    ['canlıya al', (a) => a.deploy(conn, 'lab', ['*']), 'POST', '/v1/deploy/lab', { services: ['*'], action: 'al' }],
    ['deploy günlüğü', (a) => a.deployLogs(conn, 'lab', 'web/api'), 'GET', '/v1/deploy/lab/logs/web%2Fapi'],
    ['zamanlı', (a) => a.schedules(conn), 'GET', '/v1/schedules'],
    ['zamanlıyı gönder', (a) => a.sendSchedule(conn, 's1'), 'POST', '/v1/schedules/s1/send'],
    ['Mac oturumları', (a) => a.macSessions(conn), 'GET', '/v1/mac/sessions'],
    ['Mac yazışması', (a) => a.macTranscript(conn, 'm1', 7, 20), 'GET', '/v1/mac/sessions/m1/transcript?after=7&wait=20'],
    ['şef', (a) => a.addSef(conn, { goal: 'g', chief: { engine: 'claude', model: null }, pool: [], stop: {} }), 'POST', '/v1/sef',
      { goal: 'g', chief: { engine: 'claude', model: null }, pool: [], stop: {} }],
    ['şefi sürdür', (a) => a.resumeSef(conn, 'f1'), 'POST', '/v1/sef/f1/resume', {}],
    ['otopilotlar', (a) => a.otopilots(conn), 'GET', '/v1/otopilot'],
    ['otopilot başlat', (a) => a.addOtopilot(conn, { goal: 'masaüstü' }), 'POST', '/v1/otopilot', { goal: 'masaüstü' }],
    ['otopilot duraklat', (a) => a.pauseOtopilot(conn, 'o1', true), 'POST', '/v1/otopilot/o1/pause', { now: true }],
    ['otopilot cevap', (a) => a.answerOtopilot(conn, 'o1', 'q1', 'Tailwind'), 'POST', '/v1/otopilot/o1/answer', { questionId: 'q1', answer: 'Tailwind' }],
    ['otopilot yok say', (a) => a.answerOtopilot(conn, 'o1', 'q1', '', true), 'POST', '/v1/otopilot/o1/answer', { questionId: 'q1', dismiss: true }],
    ['otopilot test', (a) => a.markOtopilotTest(conn, 'o1', 't1', false, 'çöktü'), 'POST', '/v1/otopilot/o1/test', { testId: 't1', ok: false, note: 'çöktü' }],
    ['otopilot faz', (a) => a.otopilotPhase(conn, 'o1', 'F0.6', 'retry'), 'POST', '/v1/otopilot/o1/phase/F0.6/retry'],
    ['incelemeler', (a) => a.reviews(conn), 'GET', '/v1/reviews'],
    ['inceleme iste', (a) => a.requestReview(conn, 'helm', 12), 'POST', '/v1/projects/helm/prs/12/review'],
    ['incelemeye soru', (a) => a.askReview(conn, 'helm', 12, 'neden?'), 'POST', '/v1/projects/helm/prs/12/review/ask', { question: 'neden?' }],
    ['merge + yayın', (a) => a.merge(conn, 'helm', 12, true), 'POST', '/v1/projects/helm/prs/12/merge', { confirm: true, publish: true }],
    ['masa', (a) => a.desk(conn), 'GET', '/v1/desk'],
    ['masa değişikliği', (a) => a.patchDesk(conn, { close: ['s1'] }), 'POST', '/v1/desk', { close: ['s1'] }],
    ['bildirim kaydı', (a) => a.registerPush(conn, 'ExponentPushToken[x]'), 'POST', '/v1/push/register', { token: 'ExponentPushToken[x]' }],
    ['sunucu izni', (a) => a.answerGrant(conn, 'r1', 'g1', true, 'kelime'), 'POST', '/v1/runs/r1/grants/g1', { allow: true, passphrase: 'kelime' }],
  ];

  it.each(cases)('%s', async (_name, call, method, path, body) => {
    const { fetch, api } = setup();
    await call(api);
    expect(last(fetch).method).toBe(method);
    expect(last(fetch).url).toBe(`https://kod.test:8443${path}`);
    expect(last(fetch).body).toEqual(body);
  });

  it('canlı akış: izlenen işler sorguda, zaman aşımı beklemeden uzun', async () => {
    const { fetch, api } = setup(() => ({ body: { runs: {}, gone: [], a: 'h', actives: [], locked: false, otopilotRev: 3 } }));
    const reply = await api.live(conn, [{ id: 'r1', rev: 4, len: 120 }, { id: 'r2', len: 0 }], 'a/b', 25);
    expect(reply.otopilotRev).toBe(3);
    expect(last(fetch).url).toBe('https://kod.test:8443/v1/live?runs=r1:4:120,r2::0&a=a%2Fb&wait=25');
  });
});
