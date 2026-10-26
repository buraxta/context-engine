import { createKodRequest, type KodConn, type KodOptions } from './request';
import type {
  DeployBuilds, DeployLogs, DeployStatus, DeployTarget, DeskItem, DeskPatch, DeskState, Health, KodUsage, LiveReply, LockInfo,
  MacSessions, MacTranscript, NewOtopilot, NewSchedule, NewSef, Otopilot, OtopilotList, OtopilotPhaseAction, Overview, PrDetail,
  PrItem, Project, ProjectStatus, PushNotice, Review, Run, RunSummary, Schedule, SefTask, Session, SessionHit,
} from './types';

const sessionQuery = (sessionId?: string | null) => (sessionId ? `?session=${encodeURIComponent(sessionId)}` : '');

/**
 * kod-runner uçları. Her çağrı bağlantıyı ilk parametre alır (sunucu/jeton değişse de istemci aynı kalır):
 *
 *   const kod = createKodApi({ messages: { offline: 'Tailscale açık mı?' } });
 *   const health = await kod.health({ apiUrl, token });
 */
export function createKodApi(options: KodOptions = {}) {
  const request = createKodRequest(options);
  return {
    request,
    health: (c: KodConn) => request<Health>(c, '/v1/health', {}, 30000),
    usage: (c: KodConn, force = false) => request<KodUsage>(c, `/v1/usage${force ? '?force=1' : ''}`, {}, 45000),
    unlock: (c: KodConn, passphrase: string) => request<LockInfo>(c, '/v1/unlock', { body: { passphrase } }, 30000),
    lock: (c: KodConn) => request<LockInfo>(c, '/v1/lock', { method: 'POST' }),
    /** `kod-runner-reload` ile aynı: iş boşalınca kendiliğinden yeniden başlar (kasa yeniden kilitlenir). */
    reload: (c: KodConn) => request<{ reloadPending: boolean }>(c, '/v1/reload', { body: { confirm: true } }),
    projects: (c: KodConn) => request<Project[]>(c, '/v1/projects'),
    overview: (c: KodConn, force = false) => request<Overview>(c, `/v1/overview${force ? '?force=1' : ''}`, {}, 60000),
    /** sessionId: o sohbetin worktree'si (dal, değişiklik); yoksa ana klon. */
    project: (c: KodConn, id: string, sessionId?: string | null) =>
      request<ProjectStatus>(c, `/v1/projects/${id}${sessionQuery(sessionId)}`, {}, 60000),
    sessions: (c: KodConn, id: string) => request<Session[]>(c, `/v1/projects/${id}/sessions`),
    /** Başlık, eski konular ve turların talimat + cevap metninde arar (Türkçe harf / büyük-küçük fark etmez). */
    searchSessions: (c: KodConn, q: string, signal?: AbortSignal) =>
      request<SessionHit[]>(c, `/v1/sessions/search?q=${encodeURIComponent(q)}`, { signal }),
    deleteSession: (c: KodConn, id: string, sessionId: string) =>
      request<{ deleted: boolean; sessionId: string }>(c, `/v1/projects/${id}/sessions/${sessionId}`, { method: 'DELETE' }),
    /** Görünen ad ve sabitleme. Ad sonraki işlerde de kalır. */
    updateSession: (c: KodConn, id: string, sessionId: string, patch: { title?: string; pinned?: boolean }) =>
      request<Session>(c, `/v1/projects/${id}/sessions/${sessionId}`, { body: patch }),
    sync: (c: KodConn, id: string) => request<ProjectStatus>(c, `/v1/projects/${id}/sync`, { method: 'POST' }, 600000),
    diff: (c: KodConn, id: string, sessionId?: string | null) =>
      request<{ diff: string }>(c, `/v1/projects/${id}/diff${sessionQuery(sessionId)}`, {}, 60000),
    runs: (c: KodConn, id: string, sessionId?: string | null) => request<RunSummary[]>(c, `/v1/projects/${id}/runs${sessionQuery(sessionId)}`),
    openPr: (c: KodConn, id: string, title: string, body: string, sessionId?: string | null) =>
      request<{ branch: string; number: number; url: string; existed?: boolean }>(
        c, `/v1/projects/${id}/pr`, { body: { title, body, sessionId: sessionId ?? undefined } }, 300000),
    prs: (c: KodConn, id: string) => request<PrItem[]>(c, `/v1/projects/${id}/prs`, {}, 60000),
    pr: (c: KodConn, id: string, n: number) => request<PrDetail>(c, `/v1/projects/${id}/prs/${n}`, {}, 60000),
    /** publish: projede EAS varsa merge'den hemen sonra yayın işi başlar (`easRun`). */
    merge: (c: KodConn, id: string, n: number, publish = false) =>
      request<{ merged: boolean; easRun?: Run | null; deployRun?: Run | null }>(c, `/v1/projects/${id}/prs/${n}/merge`, { body: { confirm: true, publish } }, 300000),
    approveMerge: (c: KodConn, id: string, n: number, body?: string, publish = false) =>
      request<{ merged: boolean; approved: boolean; easRun?: Run | null; deployRun?: Run | null }>(
        c, `/v1/projects/${id}/prs/${n}/approve-merge`, { body: { confirm: true, body, publish } }, 300000),
    requestChanges: (c: KodConn, id: string, n: number, body: string) =>
      request<{ requested: boolean }>(c, `/v1/projects/${id}/prs/${n}/request-changes`, { body: { body } }, 60000),
    startRun: (
      c: KodConn,
      body: {
        projectId: string;
        prompt: string;
        sessionId?: string | null;
        engine?: string;
        model?: string | null;
        mode?: 'agent' | 'plan' | 'ask';
        /** `upload` ile dönen sunucu yolları (en çok 4). */
        images?: string[];
        /** Süren iş: yeni mesaj sıraya girer, o bitince aynı oturumda sürer (oturum kimliği henüz gelmemiş olsa da). */
        afterRunId?: string;
      },
    ) => request<Run>(c, '/v1/runs', { body }, 60000),
    upload: (c: KodConn, base64: string, type = 'image/jpeg') =>
      request<{ path: string; size: number }>(c, '/v1/uploads', { body: { base64, type } }, 120000),
    deploys: (c: KodConn) => request<DeployTarget[]>(c, '/v1/deploy'),
    deployStatus: (c: KodConn, id: string) => request<DeployStatus>(c, `/v1/deploy/${id}/status`, {}, 40000),
    deployBuilds: (c: KodConn, id: string) => request<DeployBuilds>(c, `/v1/deploy/${id}/builds`, {}, 40000),
    deployLogs: (c: KodConn, id: string, service: string) =>
      request<DeployLogs>(c, `/v1/deploy/${id}/logs/${encodeURIComponent(service)}`, {}, 40000),
    /** services `['*']` = kartın tüm servisleri; geri = deploy öncesi imaja dön */
    deploy: (c: KodConn, id: string, services: string[], action: 'al' | 'geri' = 'al') =>
      request<Run>(c, `/v1/deploy/${id}`, { body: { services, action } }, 30000),
    easUpdate: (c: KodConn, id: string) => request<Run>(c, `/v1/projects/${id}/eas-update`, { body: { confirm: true } }, 60000),
    run: (c: KodConn, id: string) => request<Run>(c, `/v1/runs/${id}`),
    /**
     * Canlı akış: `want` = izlenen işler (id, bilinen rev, telefondaki cevap boyu). Değişiklik olunca ya da
     * `wait` sn sonunda döner. Eski sunucu 404.
     */
    live: (c: KodConn, want: { id: string; rev?: number; len: number }[], a: string, wait: number, signal?: AbortSignal) =>
      request<LiveReply>(
        c,
        `/v1/live?runs=${want.map((w) => `${w.id}:${w.rev ?? ''}:${w.len}`).join(',')}&a=${encodeURIComponent(a)}&wait=${wait}`,
        { signal },
        (wait + 12) * 1000,
      ),
    pushHistory: (c: KodConn, before?: string) =>
      request<{ items: PushNotice[]; more: boolean }>(c, `/v1/push/history?limit=50${before ? `&before=${encodeURIComponent(before)}` : ''}`),
    schedules: (c: KodConn) => request<{ pending: Schedule[]; recent: Schedule[] }>(c, '/v1/schedules'),
    /** Kasa kilitliyken de kurulur; gönderim saatinde kasa açık olmalı. */
    addSchedule: (c: KodConn, body: NewSchedule) => request<Schedule>(c, '/v1/schedules', { body }),
    cancelSchedule: (c: KodConn, id: string) => request<Schedule>(c, `/v1/schedules/${id}`, { method: 'DELETE' }),
    /** Saatini beklemeden gönder (kilit ister). */
    sendSchedule: (c: KodConn, id: string) => request<Schedule>(c, `/v1/schedules/${id}/send`, { method: 'POST' }, 60000),
    macSessions: (c: KodConn) => request<MacSessions>(c, '/v1/mac/sessions'),
    /** Mac'ten katalog ve kopyaları hemen çeker (Mac uykudaysa eski liste döner). */
    macSync: (c: KodConn) => request<MacSessions>(c, '/v1/mac/sync', { method: 'POST' }, 90000),
    macTranscript: (c: KodConn, id: string, after: number, wait: number, signal?: AbortSignal) =>
      request<MacTranscript>(c, `/v1/mac/sessions/${id}/transcript?after=${after}&wait=${wait}`, { signal }, (wait + 15) * 1000),
    /** Telefona al: Genel sohbette kayıt açılır; sonra normal sohbet gibi yazılır (Mac açıksa iş Mac'te koşar). */
    macAdopt: (c: KodConn, id: string) =>
      request<{ projectId: string; sessionId: string; engine: string }>(c, `/v1/mac/sessions/${id}/adopt`, { method: 'POST' }),
    sefs: (c: KodConn) => request<{ open: SefTask[]; recent: SefTask[] }>(c, '/v1/sef'),
    sef: (c: KodConn, id: string) => request<SefTask>(c, `/v1/sef/${id}`),
    /** `at` yoksa hemen başlar (kilit ister); varsa zamanlı (kilitliyken de kurulur). */
    addSef: (c: KodConn, body: NewSef) => request<SefTask>(c, '/v1/sef', { body }, 60000),
    stopSef: (c: KodConn, id: string) => request<SefTask>(c, `/v1/sef/${id}/stop`, { method: 'POST' }),
    /** Süren iş bitince şefe toparlama turu. */
    wrapSef: (c: KodConn, id: string) => request<SefTask>(c, `/v1/sef/${id}/wrap`, { method: 'POST' }, 60000),
    resumeSef: (c: KodConn, id: string, prompt?: string) =>
      request<SefTask>(c, `/v1/sef/${id}/resume`, { body: prompt ? { prompt } : {}, method: 'POST' }, 60000),
    reviews: (c: KodConn) => request<Review[]>(c, '/v1/reviews'),
    review: (c: KodConn, id: string, n: number) => request<Review>(c, `/v1/projects/${id}/prs/${n}/review`),
    /** agent yoksa sunucu varsayılanı (Cursor). Claude yalnız Kod kilidi açıkken (423). */
    requestReview: (c: KodConn, id: string, n: number, agent?: { engine?: string; model?: string }) =>
      request<Review>(c, `/v1/projects/${id}/prs/${n}/review`, agent ? { body: agent } : { method: 'POST' }, 120000),
    /** Rapor hakkında ek soru. `images`: `upload` yolları (en çok 4); yalnız görsel de gider. */
    askReview: (c: KodConn, id: string, n: number, question: string, images?: string[]) =>
      request<Review>(c, `/v1/projects/${id}/prs/${n}/review/ask`, {
        body: images?.length ? { question, images } : { question },
      }),
    registerPush: (c: KodConn, token: string, channels?: Record<string, { id: string; sound: string }> | null) =>
      request<{ registered: boolean }>(c, '/v1/push/register', { body: { token, channels: channels ?? undefined } }),
    /** Sunucu erişimi isteğine cevap. Onay kilit kelimesi ister (ajan KOD_TOKEN'i okuyabilir, kelimeyi bilemez). */
    answerGrant: (c: KodConn, runId: string, grantId: string, allow: boolean, passphrase?: string) =>
      request<{ ok: boolean; allow: boolean }>(c, `/v1/runs/${runId}/grants/${grantId}`, { body: { allow, passphrase } }, 60000),
    stop: (c: KodConn, id: string) =>
      request<{ stopped: boolean; status?: string }>(c, `/v1/runs/${id}/stop`, { method: 'POST' }),
    /** Masa senkronu: açık sekmeler (`live` yanıtındaki `deskRev` değişince yeniden okunur). */
    desk: (c: KodConn) => request<DeskState>(c, '/v1/desk'),
    /** Eski runner (değişiklik bilmez): tüm liste. */
    setDesk: (c: KodConn, sessions: DeskItem[]) => request<DeskState>(c, '/v1/desk', { body: { sessions } }),
    patchDesk: (c: KodConn, patch: DeskPatch) => request<DeskState>(c, '/v1/desk', { body: patch }),
    otopilots: (c: KodConn) => request<OtopilotList>(c, '/v1/otopilot'),
    otopilot: (c: KodConn, id: string) => request<Otopilot>(c, `/v1/otopilot/${id}`),
    /** Plan turuyla başlar (kilit ister). */
    addOtopilot: (c: KodConn, body: NewOtopilot) => request<Otopilot>(c, '/v1/otopilot', { body }, 60000),
    /** `now`: süren tur da kesilir; yoksa tur bitince durur. Görev açık kalır. */
    pauseOtopilot: (c: KodConn, id: string, now = false) => request<Otopilot>(c, `/v1/otopilot/${id}/pause`, { body: { now } }, 60000),
    resumeOtopilot: (c: KodConn, id: string) => request<Otopilot>(c, `/v1/otopilot/${id}/resume`, { method: 'POST' }, 60000),
    stopOtopilot: (c: KodConn, id: string) => request<Otopilot>(c, `/v1/otopilot/${id}/stop`, { method: 'POST' }, 60000),
    /** Cevap karar defterine girer; `dismiss`: yok say. */
    answerOtopilot: (c: KodConn, id: string, questionId: string, answer: string, dismiss = false) =>
      request<Otopilot>(c, `/v1/otopilot/${id}/answer`, { body: dismiss ? { questionId, dismiss } : { questionId, answer } }, 60000),
    /** Test maddesi: geçti / sorun var (sorunluysa düzeltme fazı eklenir). */
    markOtopilotTest: (c: KodConn, id: string, testId: string, ok: boolean, note?: string) =>
      request<Otopilot>(c, `/v1/otopilot/${id}/test`, { body: { testId, ok, note } }, 60000),
    otopilotPhase: (c: KodConn, id: string, phaseId: string, action: OtopilotPhaseAction) =>
      request<Otopilot>(c, `/v1/otopilot/${id}/phase/${encodeURIComponent(phaseId)}/${action}`, { method: 'POST' }, 60000),
  };
}

export type KodApi = ReturnType<typeof createKodApi>;
