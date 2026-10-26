import { asRecord, asString, asStrings, type Requester } from './request';

/** Asistan hafızası (`/v1/memory*`): asistan kendisi öğrenir; uygulama gösterir ve düzeltir. */

export type MemoryKey = 'profil' | 'sozluk' | 'yerler' | 'kurallar' | 'alanlar';
export type MemorySection = { title: string; items: string[] };
export type MemoryFile = { key: MemoryKey; label: string; path: string; sections: MemorySection[] };
export type MemoryEdit = { dosya: MemoryKey; islem: 'ekle' | 'guncelle' | 'sil'; satir?: string; eski?: string; bolum?: string };
/** Son öğrendiklerim: hafızaya son eklenen/düzeltilen madde (`at` ISO, yeniden eskiye). */
export type MemoryRecentItem = { key: MemoryKey; label: string; text: string; at: string };
export type TurnSummary = { turns: number; steps: number; seconds: number; tokens: number; limit: number; hard: number };
export type MemoryStats = TurnSummary & { days: number; domains: Record<string, TurnSummary> };

export const MEMORY_KEYS: MemoryKey[] = ['profil', 'sozluk', 'yerler', 'kurallar', 'alanlar'];

export function parseMemoryFile(raw: unknown): MemoryFile | null {
  const row = asRecord(raw);
  if (!row || !MEMORY_KEYS.includes(row.key as MemoryKey)) return null;
  const sections = Array.isArray(row.sections) ? row.sections : [];
  return {
    key: row.key as MemoryKey,
    label: asString(row.label, String(row.key)),
    path: asString(row.path),
    sections: sections.flatMap((section) => {
      const item = asRecord(section);
      return item ? [{ title: asString(item.title), items: asStrings(item.items) }] : [];
    }),
  };
}

/** Hayat alanı satırı: "Ad (tür) → Klasör/ — Açıklama · anahtar: k1, k2 · durum: aktif" (sunucu memory.js ile aynı biçim). */
export type AlanLine = { ad: string; tur: string | null; klasor: string; aciklama: string | null; anahtar: string[]; durum: string };

const ALAN_LINE_RE = /^(.+?)(?:\s*\((.+?)\))?\s*→\s*([^/]+?)\/?(?:\s*—\s*(.+?))?$/;

export function parseAlanLine(raw: string): AlanLine | null {
  let rest = raw;
  let durum = 'aktif';
  let anahtar: string[] = [];
  const durumMatch = /·\s*durum:\s*(.+?)\s*$/i.exec(rest);
  if (durumMatch) {
    durum = durumMatch[1].trim();
    rest = rest.slice(0, durumMatch.index).trim();
  }
  const anahtarMatch = /·\s*anahtar:\s*(.+?)\s*$/i.exec(rest);
  if (anahtarMatch) {
    anahtar = anahtarMatch[1].split(',').map((s) => s.trim()).filter(Boolean);
    rest = rest.slice(0, anahtarMatch.index).trim();
  }
  const m = ALAN_LINE_RE.exec(rest);
  if (!m) return null;
  return { ad: m[1].trim(), tur: m[2]?.trim() || null, klasor: m[3].trim(), aciklama: m[4]?.trim() || null, anahtar, durum };
}

export function createMemoryApi(request: Requester) {
  return {
    list: async () => {
      const body = await request('/v1/memory');
      const files = Array.isArray(body.files) ? body.files : [];
      return files.map(parseMemoryFile).filter((file): file is MemoryFile => Boolean(file));
    },
    /** Tek satır ekle/güncelle/sil; güncel dosyayı döner. */
    edit: async (edit: MemoryEdit) => parseMemoryFile((await request('/v1/memory', { body: edit, timeoutMs: 30_000 })).file),
    /** Son öğrendiklerim (en çok 100); sonradan silinen/değişen madde gelmez. */
    recent: async (limit = 20): Promise<MemoryRecentItem[]> => {
      const body = await request(`/v1/memory/recent?limit=${limit}`);
      const items = Array.isArray(body.items) ? body.items : [];
      return items.flatMap((raw) => {
        const row = asRecord(raw);
        if (!row || !MEMORY_KEYS.includes(row.key as MemoryKey) || typeof row.text !== 'string') return [];
        return [{ key: row.key as MemoryKey, label: asString(row.label, String(row.key)), text: row.text, at: asString(row.at) }];
      });
    },
    /** Maddeyi düzeltir; `eski` maddenin tam metni (ya da benzersiz parçası). Güncel dosyayı döner. */
    patchItem: async (key: MemoryKey, eski: string, satir: string) =>
      parseMemoryFile((await request(`/v1/memory/${key}`, { method: 'PATCH', body: { eski, satir }, timeoutMs: 30_000 })).file),
    /** Maddeyi siler; bulunamaz ya da birden çok maddeye uyarsa 400. Güncel dosyayı döner. */
    deleteItem: async (key: MemoryKey, eski: string) =>
      parseMemoryFile((await request(`/v1/memory/${key}?eski=${encodeURIComponent(eski)}`, { method: 'DELETE', timeoutMs: 30_000 })).file),
    /** Son `days` günün tur özeti; sunucu bilmezse null. */
    stats: async (days = 7): Promise<MemoryStats | null> => {
      try {
        const body = await request(`/v1/memory/stats?days=${days}`);
        return typeof body.turns === 'number' ? (body as unknown as MemoryStats) : null;
      } catch {
        return null;
      }
    },
  };
}

export type MemoryApi = ReturnType<typeof createMemoryApi>;
