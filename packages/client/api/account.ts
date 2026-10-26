import type { Requester } from './request';

/** Hesap, tanışma ve modül uçları (`/v1/auth*`, `/v1/me*`, `/v1/config`, `/v1/onboarding`, `/v1/modules*`). */

/** Sunucudaki modül anahtarları. `todos` eski sunucuda gelmez; yoksa açık sayılır. */
export type Modules = Record<string, boolean> & { todos?: boolean };
export type AccountUser = { id: string; email: string; name: string; timezone: string; model: string; chatLog: boolean };
export type Me = {
  user: AccountUser;
  modules: Modules;
  setup: Record<string, boolean>;
  keys: Record<string, { hint: string }>;
  defaultModel: string;
  encrypted: boolean;
  /** Kendi yapay zekâ anahtarı bu hesapta izinli mi. */
  byoAllowed?: boolean;
  /** Sohbet hazır mı (ürün anahtarı ya da kendi anahtarı). */
  aiReady?: boolean;
  plan?: string;
  /** Kullanım hakkı (USD). Kendi anahtarlı hesapta limitler null. */
  quota?: { dayUsed: number; dayLimit: number | null; monthUsed: number; monthLimit: number | null };
  emailVerified?: boolean;
  /** E-postası doğrulanmamış açık kayıt hesabı. */
  verifyRequired?: boolean;
};

/** Kayıt, kurtarma ve eski hesabın taşınması sonrası bir kez döner; sunucu saklamaz. */
export type AuthResult = { token: string; user: AccountUser; recoveryCode?: string };
export type Session = { id: string; device: string | null; createdAt: string; lastSeen: string; current: boolean };
export type DataOverview = {
  encrypted: boolean;
  vault: { notes: number; files: number; bytes: number };
  todos: { open: number; done: number };
  keys: Record<string, { hint: string }>;
  services: Record<string, boolean>;
  modules: Modules;
  chatLog: boolean;
  sessions: Session[];
};
export type ProfilePatch = { name?: string; timezone?: string; model?: string; chatLog?: boolean };

export type OnboardingQuestion = { key: string; soru: string };
export type OnboardingAnswer = { key: string; cevap: string };
export type OnboardingTone = 'kisa_samimi' | 'ayrintili_resmi';
export type OnboardingArea = { ad: string; tur: string; klasor: string };
export type OnboardingInput = {
  secimler: string[];
  serbest?: string;
  takip?: OnboardingAnswer[];
  ton?: OnboardingTone;
  saat?: string;
  timeZone?: string;
};

export type ModuleSetupOption = { value: string; label: string };
/** Sunucunun çizdirdiği kart: çoklu seçim, tek seçim ya da bilgi + eylem (sağlık izni). */
export type ModuleSetupCard = {
  key: string;
  type: 'multi' | 'single' | 'info';
  title: string;
  body?: string;
  options?: ModuleSetupOption[];
  selected?: string | string[];
  allowCustom?: boolean;
  action?: 'health_connect';
};
export type ModuleSetup = {
  module: string;
  enabled: boolean;
  /** Tanışma daha önce yapıldı (ya da atlandı): yeniden açarken sorulmaz. */
  done: boolean;
  cards: ModuleSetupCard[];
  answers: Record<string, unknown> | null;
};
export type ModuleSetupAnswers = Record<string, string | string[]>;

export function deviceTimeZone(fallback = 'UTC') {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || fallback;
  } catch {
    return fallback;
  }
}

export function createAccountApi(request: Requester) {
  const as = <T>(promise: Promise<Record<string, unknown>>) => promise as Promise<unknown> as Promise<T>;

  return {
    /** Herkese açık sunucu ayarları. Hata → açık kayıt kapalı sayılır. */
    config: async () => {
      try {
        const body = await request('/v1/config', { anonymous: true, timeoutMs: 8_000 });
        return { openSignup: body.openSignup === true };
      } catch {
        return { openSignup: false };
      }
    },
    register: (input: { email: string; password: string; name: string; invite?: string; timezone?: string }) =>
      as<AuthResult>(request('/v1/auth/register', { anonymous: true, body: { timezone: deviceTimeZone(), ...input } })),
    /** İlk girişte eski hesap şifreli klasöre taşınabilir; uzun sürebilir. */
    login: (email: string, password: string) =>
      as<AuthResult>(request('/v1/auth/login', { anonymous: true, body: { email, password }, timeoutMs: 120_000 })),
    /** Kurtarma kodu + yeni şifre; yeni kurtarma kodu döner, eskisi geçersiz olur. */
    recover: (input: { email: string; recoveryCode: string; newPassword: string }) =>
      as<AuthResult & { recoveryCode: string }>(request('/v1/auth/recover', { anonymous: true, body: input })),
    logout: () => as<{ ok: boolean }>(request('/v1/auth/logout', { method: 'POST' })),

    me: () => as<Me>(request('/v1/me')),
    updateProfile: (patch: ProfilePatch) => as<Me>(request('/v1/me', { method: 'PATCH', body: patch })),
    deleteAccount: (password: string) => as<{ ok: boolean }>(request('/v1/me', { method: 'DELETE', body: { password } })),
    changePassword: (current: string, next: string) =>
      as<{ ok: boolean }>(request('/v1/me/password', { body: { current, next } })),
    newRecoveryCode: (password: string) => as<{ recoveryCode: string }>(request('/v1/me/recovery', { body: { password } })),
    /** Doğrulama kodu e-postası (60 sn arayla, günde sınırlı). */
    sendEmailCode: () => as<{ ok: boolean }>(request('/v1/me/email/send', { body: {} })),
    verifyEmail: (code: string) => as<Me>(request('/v1/me/email/verify', { body: { code } })),
    sessions: () => as<{ sessions: Session[] }>(request('/v1/me/sessions')),
    endSession: (id: string) => as<{ ok: boolean }>(request(`/v1/me/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' })),
    endOtherSessions: () => as<{ ended: number }>(request('/v1/me/sessions', { method: 'DELETE' })),
    dataOverview: () => as<DataOverview>(request('/v1/me/data')),
    /** Zip'i hazırlar; dönen bağlantı jetonsuz, tek kullanımlık ve kısa ömürlü. */
    prepareExport: async () => {
      const out = await as<{ url: string; expiresInSec: number; bytes: number }>(
        request('/v1/me/export', { method: 'POST', timeoutMs: 120_000 }),
      );
      return { ...out, url: request.url(out.url) };
    },

    /** Seçimlere göre 0–2 takip sorusu; sunucu hep bir cevapla döner. */
    onboardingQuestions: (input: { secimler: string[]; serbest?: string }) =>
      as<{ sorular: OnboardingQuestion[] }>(request('/v1/onboarding', { body: { action: 'takip_sorulari', ...input } })),
    /** Tanışma cevapları: profil ve hayat alanları yazılır, oluşan alanlar döner. */
    completeOnboarding: (input: OnboardingInput) =>
      as<{ ok: boolean; alanlar: OnboardingArea[] }>(request('/v1/onboarding', { body: { action: 'tamamla', ...input } })),

    setModule: (module: string, enabled: boolean) =>
      as<{ enabled: Modules }>(request('/v1/modules', { method: 'PUT', body: { module, enabled } })),
    moduleSetup: (module: string) => as<ModuleSetup>(request(`/v1/modules/${encodeURIComponent(module)}/setup`)),
    /** Modülü açar; `skip` cevapsız açar. */
    completeModuleSetup: (module: string, input: { answers?: ModuleSetupAnswers; skip?: boolean }) =>
      as<{ ok: boolean; module: string; done: boolean; enabled: Modules; created: string[] }>(
        request(`/v1/modules/${encodeURIComponent(module)}/setup`, { body: input }),
      ),
    /** Modül önerisine "Şimdi değil": sunucu bir süre bu modülü önermez. */
    dismissModuleSuggestion: (module: string) =>
      as<{ ok: boolean; module: string; until: string }>(
        request(`/v1/modules/${encodeURIComponent(module)}/suggestion`, { body: { action: 'dismiss' } }),
      ),
  };
}

export type AccountApi = ReturnType<typeof createAccountApi>;
