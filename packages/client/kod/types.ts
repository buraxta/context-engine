/**
 * kod-runner (`/v1`) yanıt ve istek tipleri. Telefon ve masaüstü aynı tipleri kullanır.
 * "Eski runner'da yok" denen alanlar isteğe bağlıdır: yeni istemci eski sunucuyla da çalışır.
 */


export type LockInfo = { locked: boolean; unlockedAt: number | null; autoLockAt: number | null };
export type ReviewStatus = {
  configured: boolean;
  watching: string[];
  /** Bu hesapların PR'ı incelenmez; eski runner'da yok. */
  skipAuthors?: string[];
  model: string;
  everyMinutes: number;
  lastPollAt: string | null;
  lastError: string | null;
};

export type Health = LockInfo & {
  ok: boolean;
  active: Run | null;
  actives?: Run[];
  maxConcurrent?: number;
  reloadPending?: boolean;
  review?: ReviewStatus;
  /** Bekleyen zamanlı mesaj sayısı; eski runner'da yok. */
  schedules?: number;
  /** Açık (bekleyen/süren) şef görevi sayısı; eski runner'da yok. */
  sef?: number;
  /** Açık otopilot görevi sayısı; eski runner'da yok. */
  otopilot?: number;
};

/** Otomatik PR incelemesi (kasadan bağımsız anahtarlarla, salt okuma). `report` yalnız tekil uçta. */
export type Review = {
  key: string;
  projectId: string;
  projectName: string;
  repo: string;
  number: number;
  title: string;
  author: string;
  url: string;
  sha: string;
  runId: string;
  status: Run['status'];
  verdict: string | null;
  /** 'cursor' | 'claude' | 'claude2'; eski kayıtlarda yok (Cursor). */
  engine?: string;
  model: string;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  error?: string | null;
  decision?: 'merged' | 'changes';
  decidedAt?: string;
  summary?: string;
  report?: string;
  phase?: string | null;
  steps?: RunStep[];
  /** Rapor hakkında sorulan ek sorular (en yeni sonda). */
  thread?: ReviewQuestion[];
  /** Listede: soru sayısı. */
  questions?: number;
};

export type ReviewQuestion = {
  id: string;
  runId: string;
  question: string;
  answer: string;
  status: Run['status'];
  phase?: string | null;
  error?: string | null;
  askedAt: string;
  answeredAt: string | null;
  /** Sunucudaki dosya yolları. Baloncuktaki önizleme ekranda yerel adreste kalır. */
  images?: string[];
};

/** Kalan haklar (`GET /v1/usage`). Claude kilitliyken `stale` (son bilinen) ya da `locked` (hiç okunmadı). */
export type UsageWindow = { percent: number | null; resetsAt: string | null; status?: string | null };
export type ClaudeUsage = {
  fiveHour?: UsageWindow;
  sevenDay?: UsageWindow;
  status?: string | null;
  at?: string;
  error?: string | null;
  stale?: boolean;
  locked?: boolean;
};
export type KodUsage = {
  cursor: {
    plan: string | null;
    spentCents: number;
    limitCents: number;
    remainingCents: number;
    percent: number | null;
    autoPercent: number | null;
    apiPercent: number | null;
    periodStart: string | null;
    periodEnd: string | null;
    at?: string;
    error: string | null;
  } | null;
  claude: ClaudeUsage | null;
  /** İkinci Claude hesabı; eski runner'da yok. */
  claude2?: ClaudeUsage | null;
  checkedAt: string | null;
};

export type Project = {
  id: string;
  name: string;
  group: string;
  repo: string;
  base: string;
  noPr: boolean;
  cloned: boolean;
  workspace?: boolean;
  /** Varsa telefondan EAS update yayınlanabilir (yalnız temiz `base` klonundan). */
  eas?: { channel: string; platform: string };
  /** Varsa "Merge'le ve canlıya al": merge sonrası sunucu `canliya-ver --origin` çalıştırır (Kod › Canlı hedefi). */
  deploy?: { id: string; name: string };
  /** Şef görevinde işçi turlarından sonra runner'ın çalıştırdığı kontrol (ör. `tsc --noEmit`). */
  check?: string | null;
};

/** Kod › Canlı kartı (kod-runner `deploy.json`): sunucudaki bir compose klasörü. */
export type DeployTarget = {
  id: string;
  name: string;
  server: string;
  /** tuşla alınabilen servisler (veritabanı yok) */
  services: string[];
  projects: string[];
  /** imajı üreten Actions eşlemesi var (`deployBuilds`); eski sunucuda alan yok */
  builds?: boolean;
  recent: {
    id: string;
    action: 'al' | 'geri' | 'origin';
    services: string[];
    status: 'done' | 'error' | 'stopped';
    summary: string;
    createdAt: string;
    endedAt: string | null;
  }[];
  active: { id: string; status: 'queued' | 'running'; prompt: string; step: string | null }[];
};

export type DeployStatus = {
  id: string;
  at: string;
  services: { service: string; image: string; status: string; up: boolean; managed: boolean }[];
};

/** Servisin imajını basan son Actions koşusu (canlı dalda, push). */
export type DeployBuild = {
  service: string;
  repo: string;
  workflow: string;
  job: string | null;
  status: 'none' | 'queued' | 'in_progress' | 'completed';
  /** success | failure | cancelled | skipped (iş eşlemesinde servis bu commit'te değişmedi) … */
  conclusion?: string | null;
  runId?: number;
  url?: string;
  sha?: string;
  message?: string;
  startedAt?: string;
  updatedAt?: string;
  progress?: { done: number; total: number } | null;
  /** son koşu sürüyor/olmadıysa hazır olan son başarılı imaj */
  lastOk?: { sha: string; at: string } | null;
};

export type DeployBuilds = { id: string; at: string; services: DeployBuild[] };

export type DeployLogs = { id: string; service: string; at: string; text: string };

/** kod-runner'ın gönderdiği bildirim kaydı (`push-log.json`); `detail` yalnız kayıtta, ör. işin tam hatası. */
export type PushNotice = {
  id: string;
  at: string;
  title: string;
  subtitle: string | null;
  body: string;
  detail?: string | null;
  color: string | null;
  data: Record<string, unknown>;
  devices: number;
};

export type Session = {
  sessionId: string;
  engine: string;
  title: string;
  updatedAt: string;
  projects?: string[];
  branch?: string | null;
  /** son işin bıraktığı değişen dosya sayısı */
  changedFiles?: number | null;
  lastPrompt?: string;
  lastStatus?: 'running' | 'done' | 'error' | 'stopped' | null;
  /** sohbetin açtığı PR'lar (yeniden eskiye) */
  prs?: RunPr[];
  /** ana listede kalsın (eski sohbet de) */
  pinned?: boolean;
  /** konu değişince eski başlıklar (yeniden eskiye) */
  topics?: string[];
};

/** Sohbetlerde metin araması: eşleşen sohbet + en yeni eşleşen turdan kısa alıntı (yalnız başlıkta geçtiyse null). */
export type SessionHit = Session & {
  projectId: string;
  match: { runId: string; where: 'prompt' | 'answer'; at: string | null; text: string } | null;
};

/** İş bitince sunucunun açtığı / güncellediği PR. */
export type RunPr = {
  projectId: string;
  number: number;
  url: string;
  branch: string;
  title: string;
  existed?: boolean;
  at?: string;
};

/** Ana sayfa: tüm projelerin sohbetleri + çalışanlar + açık PR'lar (kilitliyken PR'lar son bilinen). */
export type OverviewPr = {
  number: number;
  title: string;
  author: string;
  isDraft: boolean;
  headRefName: string;
  updatedAt: string;
  reviewDecision: string;
};
export type Overview = {
  locked: boolean;
  sessions: (Session & { projectId: string })[];
  actives: Pick<Run, 'id' | 'projectId' | 'sessionId' | 'prompt' | 'status' | 'phase' | 'createdAt'>[];
  prs: Record<string, OverviewPr[]> | null;
  prErrors: Record<string, string>;
  prsAt: string | null;
};

export type ProjectStatus = {
  id: string;
  cloned: boolean;
  branch?: string | null;
  upstream?: string | null;
  tracking?: string | null;
  /** sohbetin kendi worktree'si mi (false: ana klon) */
  tree?: boolean;
  files?: { st: string; path: string }[];
  commits?: { h: string; s: string; t: string }[];
  sessions?: Session[];
};

/** `detail`: kısaltılmamış komut/yol (ve hata metni); süreler ISO. */
export type RunStep = {
  id: string;
  label: string;
  status: 'running' | 'done' | 'error';
  detail?: string;
  startedAt?: string;
  endedAt?: string | null;
};

export type AskQuestion = {
  question: string;
  header?: string;
  multi?: boolean;
  options: { label: string; description?: string }[];
};

export type Run = {
  id: string;
  projectId: string;
  engine: string;
  /** İstenen model; boşsa Auto. */
  model?: string | null;
  /** CLI'nin bildirdiği model; istenenden farklıysa ekranda bu yazılır. */
  modelUsed?: string | null;
  mode?: 'agent' | 'plan' | 'ask';
  /** `eas`: ajan değil yayın aracı çalıştı. */
  kind?: 'eas' | 'review' | 'deploy';
  /** kind deploy: Kod › Canlı hedefi */
  deploy?: { target: string; name: string; action: 'al' | 'geri' | 'origin'; services: string[] };
  prompt: string;
  images?: string[];
  sessionId: string | null;
  status: 'queued' | 'running' | 'done' | 'error' | 'stopped';
  phase: string | null;
  answer: string;
  /** Cevaptaki her metin bloğunun başlangıcı: sonuncusu asıl cevap, öncekiler ara not. Eski sunucuda yok. */
  textAt?: number[];
  /** Akan metin (motor parça parça yazıyor); tam blok gelince `answer`a geçer. Eski sunucuda yok. */
  draft?: string;
  /** Her değişiklikte artar (`/v1/live`). */
  rev?: number;
  /** Hazırlık ve ilk çıktı süreleri (ms, iş başından). */
  timing?: { prepMs?: number; firstMs?: number } | null;
  thinking: string;
  steps: RunStep[];
  error: string | null;
  changedFiles: number | null;
  touchedProjects?: string[];
  branch?: string | null;
  /** iş bitince otomatik açılan / güncellenen PR'lar */
  prs?: RunPr[];
  prError?: string | null;
  queuePosition?: number;
  /** iş sürerken yazılan mesaj çalışan ajana iletildi; ajan alınca iş bu kayıtta sürer */
  steerOf?: string | null;
  /** araya gelen mesajla iş o kayda devredildi (cevabın devamı orada) */
  handedTo?: string | null;
  stopping?: boolean;
  /** ajan bir sunucuya SSH erişimi istedi (`kod-yetki`); telefondan kilit kelimesiyle onaylanır */
  pendingGrant?: { id: string; host: string; reason: string; requestedAt: string } | null;
  /** ajan soru aracıyla bitirdi: cevaptaki [at, end) metni düğmeli kart olur */
  ask?: { at: number; end: number; questions: AskQuestion[] } | null;
  /** plan aracıyla bitirdi (plan modu): [at, end) plan metni, altında "Uygula" */
  plan?: { at: number; end: number } | null;
  /** bu sohbete onaylı sunucular (kilit kapanana kadar) */
  grantedHosts?: string[];
  /** Kod › Zamanlı'dan saati gelince gönderildi */
  scheduled?: { id: string; at: string } | null;
  /** Şef görevinin turu (Kod › Şef) */
  sef?: { id: string; role: 'chief' | 'worker'; n?: number } | null;
  createdAt: string;
  startedAt?: string | null;
  lastEventAt?: string | null;
  endedAt: string | null;
};

/** `/v1/live` içinde çalışan/sıradaki iş özeti (cevap metni yok). */
export type ActiveSummary = Pick<Run, 'id' | 'projectId' | 'sessionId' | 'prompt' | 'status' | 'phase' | 'engine' | 'createdAt'> & {
  kind?: Run['kind'] | null;
  model?: string | null;
  startedAt?: string | null;
  pendingGrant?: Run['pendingGrant'];
  follows?: string | null;
  /** O an süren adım. */
  step?: string | null;
  /** Zamanlı mesajın işi: telefon açık sekmeye kendisi ekler. */
  scheduled?: boolean;
};

/**
 * Zamanlı mesaj (kod-runner `schedules.json`). `sessionId` boşsa saatinde yeni sohbet açılır.
 * `armed`: kurarken onaylandı — saatinde kasa kendiliğinden açılır, iş bitince kilitlenir (runner yeniden
 * başlarsa onay düşer). Onaysızsa `waiting`: saat geldi ama kasa kilitli — kilit açılınca gider (12 saat içinde).
 */
export type Schedule = {
  id: string;
  at: string;
  projectId: string;
  sessionId: string | null;
  title: string;
  engine: string;
  model: string | null;
  mode: 'agent' | 'plan' | 'ask';
  prompt: string;
  status: 'pending' | 'waiting' | 'sent' | 'error' | 'cancelled' | 'expired';
  runId: string | null;
  error: string | null;
  createdAt: string;
  endedAt: string | null;
  armed?: boolean;
};

export type NewSchedule = {
  at: string;
  projectId: string;
  sessionId: string | null;
  engine: string;
  model?: string | null;
  mode?: 'agent' | 'plan' | 'ask';
  prompt: string;
  /** Kurarken onay (en çok 24 saat sonrası). Sunucu kelimeyi saklamaz. */
  passphrase?: string;
};

/**
 * Şef görevi (kod-runner `sef.json`, Kod › Şef). Şef ajan hedefi böler, izinli işçilere verir; işçiler bitince
 * runner kontrol komutunu çalıştırıp raporu şefe yeni tur olarak gönderir. İlk dolan durdurma koşulunda
 * "toparla" turu (`wrapping`) → `limit`. `kod-sef bitir` + kontrol geçti → `done`. Görev sonunda tek PR.
 */
export type SefAgent = { engine: string; model: string | null };
export type SefStop = {
  turns: number;
  hours: number;
  until: string | null;
  tokens: number | null;
  claudePercent: number | null;
  cursorCents: number | null;
};
export type SefTurn = {
  runId: string;
  role: 'chief' | 'worker';
  n?: number;
  engine: string;
  model: string | null;
  prompt: string;
  status: Run['status'];
  sessionId: string | null;
  tokens: number;
  at: string;
  wrap?: boolean;
  /** Yalnız ayrıntı ucunda: işin güncel hali */
  phase?: string | null;
  step?: string | null;
  answer?: string;
  error?: string | null;
};
export type SefTask = {
  id: string;
  goal: string;
  projectId: string;
  /** proje seçilmediyse runner hedeften çıkardı: neden */
  projectWhy?: string | null;
  chief: SefAgent;
  pool: (SefAgent & { max: number })[];
  stop: SefStop;
  check: string | null;
  status: 'pending' | 'running' | 'waiting' | 'wrapping' | 'done' | 'limit' | 'stopped' | 'failed';
  reason: string | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  /** zamanlı başlangıç */
  scheduleId: string | null;
  startAt: string | null;
  armed?: boolean;
  chiefSession: string | null;
  turns: SefTurn[];
  pending: string[];
  spent: { chiefTurns: number; workers: number; tokens: number; input?: number; output?: number; cacheRead?: number; cacheWrite?: number };
  lastCheck: { ok: boolean; code: number | string; cmd: string; at: string } | null;
  pr: { number: number; url: string } | null;
};
export type NewSef = {
  goal: string;
  /** boş/yoksa runner hedef metninden çıkarır */
  projectId?: string;
  chief: SefAgent;
  pool: (SefAgent & { max: number })[];
  stop: Partial<SefStop>;
  check?: string | null;
  /** verilirse zamanlı başlar */
  at?: string;
  /** zamanlıda kurarken onay (≤24 saat) */
  passphrase?: string;
};

/** Canlı akışta iş: cevap ya tam (`answer`) ya eklemeli (`answerAt` + `answerAdd`). */
export type LiveRun = Omit<Run, 'answer'> & { answer?: string; answerAt?: number; answerAdd?: string; stepCount?: number };

/** `/v1/live` içinde süren otomatik PR incelemesi (rapor soruları yok). */
export type ActiveReview = {
  id: string;
  projectId: string;
  projectName: string;
  number: number;
  title: string;
  author: string;
  status: Run['status'];
  phase: string | null;
  step: string | null;
  engine: string;
  model: string | null;
  createdAt: string;
  startedAt: string | null;
};

export type LiveReply = {
  runs: Record<string, LiveRun>;
  gone: string[];
  a: string;
  actives: ActiveSummary[];
  /** Eski runner'da yok. */
  reviews?: ActiveReview[];
  locked: boolean;
  deskRev?: number;
  /** Sohbet adı/sabitlemesi değişti ya da silindi (başka cihaz); eski runner'da yok. */
  sessionsRev?: number;
  /** Otopilot kaydı değişti; eski runner'da yok. */
  otopilotRev?: number;
};

/** Masa senkronu: hangi sohbetin açık sekmesi var (hangi sekmenin seçili olduğu cihaza özel, burada yok). */
export type DeskItem = { projectId: string; sessionId: string };
export type DeskState = { rev: number; sessions: DeskItem[]; /** Elle kapatılanlar; eski runner'da yok. */ dismissed?: string[] };
/** Masa değişikliği: açılan sekmeler, kapanan oturumlar, elle kapatılanlar (birleşme kuralları telefonda `src/kod/desk.ts`). */
export type DeskPatch = { open?: DeskItem[]; close?: string[]; dismiss?: string[] };

export type RunSummary = Pick<Run, 'id' | 'projectId' | 'engine' | 'prompt' | 'status' | 'createdAt' | 'endedAt' | 'sessionId'>;

export type PrItem = {
  number: number;
  title: string;
  author: { login: string };
  headRefName: string;
  baseRefName: string;
  isDraft: boolean;
  updatedAt: string;
  url: string;
  reviewDecision: string;
  additions: number;
  deletions: number;
  changedFiles: number;
};

export type PrDetail = PrItem & {
  body: string;
  headRefOid?: string;
  state: string;
  mergeable: string;
  mergeStateStatus: string;
  commits: { oid: string; headline: string }[];
  statusCheckRollup?: { name?: string; context?: string; conclusion?: string; state?: string }[];
  diff: string;
};


/** Mac'te açılan Claude/Cursor oturumu (kod-runner `src/mac-kapi.js`, 2 dk'da bir eşitlenir). */
export type MacSession = {
  engine: string;
  id: string;
  title: string;
  cwd: string;
  branch: string | null;
  lastPrompt: string;
  lastAnswer: string;
  updatedAt: string;
  tokens: number | null;
  /** Mac'te terminalde şu an açık */
  open: boolean;
  /** Mac uyursa buradan sürmek için kopyası var */
  copied: boolean;
  /** Telefona alındıysa sohbeti; where: son tur nerede koştu */
  session: { projectId: string; sessionId: string; where: 'mac' | 'self' | null } | null;
};
export type MacLine = { seq: number; role: 'user' | 'assistant' | 'tool' | 'note'; text: string; at: string | null };
/** Canlı yazışma (long-poll). `reset`: sunucu yeniden başladı, liste baştan. */
export type MacTranscript = {
  engine: string;
  title: string;
  cwd: string;
  live: boolean;
  open: boolean;
  fromCopy: boolean;
  reachable: boolean;
  seq: number;
  reset: boolean;
  items: MacLine[];
};
export type MacSessions = { enabled: boolean; reachable: boolean; at: string | null; checkedAt: string | null; items: MacSession[] };

/**
 * Otopilot (kod-runner `otopilot.json`, Kod › Otopilot): fazlı işi "devam" beklemeden yürütür. Her faz ayrı oturumda
 * PR açar; runner kontrol komutunu çalıştırır, bağımsız denetçi `devam | duzelt | dur` kararı verir.
 */
export type OtopilotStatus = 'planning' | 'running' | 'waiting' | 'paused' | 'done' | 'stopped' | 'failed';
export type OtopilotPhaseStatus = 'todo' | 'running' | 'review' | 'fix' | 'waiting' | 'merge' | 'done' | 'skipped' | 'failed';
export type OtopilotRole = 'plan' | 'phase' | 'review' | 'check';

export type OtopilotPhase = {
  id: string;
  title: string;
  detail: string;
  criteria: string[];
  deps: string[];
  projectId: string;
  status: OtopilotPhaseStatus;
  attempts: number;
  sessionId: string | null;
  runIds: string[];
  pr: { number: number; url: string; projectId?: string; merged: boolean; title?: string } | null;
  check: { ok: boolean; code: number | string; cmd: string; at: string; out: string } | null;
  review: { verdict: 'devam' | 'duzelt' | 'dur'; notes: string; at: string; runId: string; sessionId: string | null } | null;
  reason: string | null;
  startedAt: string | null;
  endedAt: string | null;
  /** Fazı yürüten ajan; eski kayıtlarda yok. */
  agent?: { engine: string; model: string | null };
  needsReview?: boolean;
};

export type OtopilotQuestion = {
  id: string;
  /** Boşsa plan turunun sorusu. */
  phaseId: string | null;
  text: string;
  detail?: string;
  options: string[];
  /** Cevap gelmeden faz (ya da plan) ilerlemez. */
  blocking: boolean;
  source: 'ajan' | 'denetçi';
  at: string;
  answer?: string;
  answeredAt?: string;
  dismissed?: boolean;
};

export type OtopilotTest = {
  id: string;
  phaseId: string | null;
  text: string;
  status: 'pending' | 'pass' | 'fail';
  at: string;
  note?: string | null;
  markedAt?: string;
  /** Sorunlu işaretlenince eklenen düzeltme fazı. */
  fixPhase?: string;
};

/** Süren tur. Ayrıntı ucunda canlı alanlar (adım, oturum) de gelir. */
export type OtopilotCurrent = {
  role: OtopilotRole;
  runId: string;
  phaseId: string | null;
  at: string;
  engine: string;
  model: string | null;
  status?: Run['status'];
  phase?: string | null;
  sessionId?: string | null;
  projectId?: string;
  step?: string | null;
  stepCount?: number;
  startedAt?: string | null;
};

/** Liste satırı. `pending`: cevapsız soru + bekleyen test + merge bekleyen faz. */
export type OtopilotSummary = {
  id: string;
  title: string;
  projectId: string | null;
  status: OtopilotStatus;
  reason: string | null;
  engine: string;
  model: string | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  phases: number;
  done: number;
  current: { phaseId: string | null; role: OtopilotRole } | null;
  pending: number;
};

export type OtopilotList = { open: OtopilotSummary[]; recent: OtopilotSummary[]; rev: number };

export type Otopilot = {
  id: string;
  title: string;
  goal: string;
  projectId: string | null;
  planNote: string | null;
  workspace: boolean;
  engine: string;
  model: string | null;
  hours: number;
  status: OtopilotStatus;
  reason: string | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  phases: OtopilotPhase[];
  questions: OtopilotQuestion[];
  tests: OtopilotTest[];
  log: { at: string; text: string }[];
  current: OtopilotCurrent | null;
  planSession: string | null;
  /** Kota limitinde kendiliğinden sürme saati. */
  resumeAt: string | null;
  rev: number;
};

export type NewOtopilot = {
  goal: string;
  title?: string;
  /** Boşsa plan turu hedeften seçer. */
  projectId?: string;
  /** Vault'taki plan notu (`Context/…md`). */
  planNote?: string;
  engine?: string;
  model?: string | null;
  /** Süre sınırı (saat). */
  hours?: number;
};

export type OtopilotPhaseAction = 'skip' | 'retry' | 'merged';
