import type { PresenceRow } from '../api/sync';

/**
 * Senkron kuralları, iki uygulamada aynı (telefon + masaüstü). Sunucu ortak durumu anahtar başına "son yazan kazanır"
 * diye saklar; okundu/birleşti gibi yalnız ileri giden değerler istemcide birleştirilir ki eski cihaz geri almasın.
 */

/** Ortak durum değeri yazan kurulumla sarılır: kendi yankısını tanımak için. */
export type Shared<T = unknown> = { v: T; from: string };

export function wrapShared<T>(v: T, from: string): Shared<T> {
  return { v, from };
}

export function unwrapShared(value: unknown): Shared | null {
  if (!value || typeof value !== 'object' || !('from' in value) || !('v' in value)) return null;
  const { v, from } = value as Shared;
  return typeof from === 'string' ? { v, from } : null;
}

/** Taslak değeri: `{ text, from }`; boş taslak `null` (silinir). Kilit kelimesi hiç gönderilmez. */
export type SharedDraft = { text: string; from: string };

export function parseDraft(value: unknown): SharedDraft | null {
  if (!value || typeof value !== 'object') return null;
  const { text, from } = value as Partial<SharedDraft>;
  return typeof text === 'string' && typeof from === 'string' ? { text, from } : null;
}

export const CHAT_DRAFT_KEY = 'draft.chat';

/** Kod sohbeti taslağının anahtarı: oturum (iki cihazda aynı), yeni sohbet için `new`. */
export function kodDraftKey(sessionId: string | null | undefined) {
  return `draft.kod.${(sessionId || 'new').replace(/[^\w.:/-]/g, '_').slice(0, 100)}`;
}

/**
 * Gelen taslak yerel yazıya ne yapar: aynıysa hiçbir şey, yerel boşsa yerine koyar, doluysa "al" önerisi olur.
 * `secure`: yerel alan kilit kelimesi bekliyor — dokunulmaz.
 */
export function draftAction(incoming: string, local: string, secure = false): 'none' | 'replace' | 'offer' {
  if (incoming === local) return 'none';
  if (!local.trim() && !secure) return 'replace';
  return incoming.trim() ? 'offer' : 'none';
}

/** Görüldü: anahtar başına en yenisi (ISO ya da sayı). Değişmediyse aynı nesne döner. */
export function mergeSeen<T extends string | number>(local: Record<string, T>, remote: Record<string, T>) {
  let next = local;
  for (const [key, value] of Object.entries(remote)) {
    if (local[key] != null && local[key] >= value) continue;
    if (next === local) next = { ...local };
    next[key] = value;
  }
  return next;
}

/** Paylaşılacak görüldü: yalnız en yeni `limit` kayıt (değer 16 KB sınırını aşmasın). */
export function newestSeen<T extends string | number>(seen: Record<string, T>, limit = 80) {
  const rows = Object.entries(seen).sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0));
  return Object.fromEntries(rows.slice(0, limit)) as Record<string, T>;
}

/** Birleşti gibi kümeler: birleşim. Değişmediyse aynı dizi döner. */
export function mergeSet(local: string[], remote: string[]) {
  const have = new Set(local);
  const extra = remote.filter((item) => !have.has(item));
  return extra.length ? [...local, ...extra] : local;
}

/** Varlık: son `freshMs` içinde başında olunan cihaz sayılır. */
export const PRESENCE_FRESH_MS = 2 * 60_000;

/** Başında olunan öbür cihazlar, en yenisi başta. */
export function freshOthers(rows: PresenceRow[], now = Date.now(), freshMs = PRESENCE_FRESH_MS) {
  return rows
    .filter((row) => row.active && now - Date.parse(row.activeAt) <= freshMs)
    .sort((a, b) => (a.activeAt < b.activeAt ? 1 : -1));
}

/** Canlı gelen varlık satırını listeye işler (aynı cihazın eskisi düşer). */
export function upsertPresence(rows: PresenceRow[], row: PresenceRow) {
  return [row, ...rows.filter((item) => item.deviceId !== row.deviceId)];
}
