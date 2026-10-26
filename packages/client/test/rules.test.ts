import { describe, expect, it } from 'vitest';
import type { PresenceRow } from '../api/sync';
import {
  CHAT_DRAFT_KEY, draftAction, freshOthers, kodDraftKey, mergeSeen, mergeSet, newestSeen, parseDraft, unwrapShared,
  upsertPresence, wrapShared,
} from '../sync/rules';

describe('ortak durum sarmalı', () => {
  it('yazan kurulumla sarar ve geri açar', () => {
    expect(unwrapShared(wrapShared({ a: 1 }, 'mac'))).toEqual({ v: { a: 1 }, from: 'mac' });
  });

  it('eksik ya da bozuk değeri reddeder', () => {
    expect(unwrapShared(null)).toBeNull();
    expect(unwrapShared({ v: 1 })).toBeNull();
    expect(unwrapShared({ v: 1, from: 3 })).toBeNull();
  });
});

describe('taslak', () => {
  it('parseDraft yalnız metin + kaynak kabul eder', () => {
    expect(parseDraft({ text: 'merhaba', from: 'tel' })).toEqual({ text: 'merhaba', from: 'tel' });
    expect(parseDraft({ text: 1, from: 'tel' })).toBeNull();
    expect(parseDraft('metin')).toBeNull();
  });

  it('kod taslak anahtarı oturuma bağlı, güvensiz karakterler temizlenir', () => {
    expect(CHAT_DRAFT_KEY).toBe('draft.chat');
    expect(kodDraftKey(null)).toBe('draft.kod.new');
    expect(kodDraftKey('ab c?d')).toBe('draft.kod.ab_c_d');
    expect(kodDraftKey('x'.repeat(300))).toHaveLength('draft.kod.'.length + 100);
  });

  it('draftAction: aynıysa dokunmaz, yerel boşsa koyar, doluysa önerir', () => {
    expect(draftAction('a', 'a')).toBe('none');
    expect(draftAction('yeni', '  ')).toBe('replace');
    expect(draftAction('yeni', 'benim')).toBe('offer');
    expect(draftAction('', 'benim')).toBe('none');
  });

  it('draftAction: kilit kelimesi alanına hiç yazmaz', () => {
    expect(draftAction('yeni', '', true)).toBe('offer');
    expect(draftAction('', '', true)).toBe('none');
  });
});

describe('görüldü birleşmesi', () => {
  it('anahtar başına en yenisi kazanır, eski cihaz geri alamaz', () => {
    const local = { a: '2026-10-02', b: '2026-10-01' };
    expect(mergeSeen(local, { a: '2026-10-01', b: '2026-10-05', c: '2026-10-03' })).toEqual({
      a: '2026-10-02', b: '2026-10-05', c: '2026-10-03',
    });
  });

  it('değişmediyse aynı nesneyi döner, yerel nesneyi bozmaz', () => {
    const local = { a: 5 };
    expect(mergeSeen(local, { a: 3 })).toBe(local);
    const next = mergeSeen(local, { a: 7 });
    expect(next).not.toBe(local);
    expect(local).toEqual({ a: 5 });
  });

  it('newestSeen yalnız en yeni kayıtları tutar', () => {
    expect(newestSeen({ a: 1, b: 3, c: 2 }, 2)).toEqual({ b: 3, c: 2 });
  });
});

describe('küme birleşmesi', () => {
  it('birleşim; yeni öğe yoksa aynı dizi', () => {
    const local = ['1', '2'];
    expect(mergeSet(local, ['2', '1'])).toBe(local);
    expect(mergeSet(local, ['3', '2'])).toEqual(['1', '2', '3']);
  });
});

describe('varlık', () => {
  const row = (deviceId: string, activeAt: string, active = true): PresenceRow => ({
    deviceId, name: deviceId, kind: 'desktop', screen: 'kod', ref: '/kod', active, activeAt,
  });
  const now = Date.parse('2026-10-26T12:00:00Z');

  it('freshOthers: yalnız taze ve başında olunanlar, en yenisi başta', () => {
    const rows = [
      row('eski', '2026-10-26T11:50:00Z'),
      row('pasif', '2026-10-26T11:59:30Z', false),
      row('a', '2026-10-26T11:59:00Z'),
      row('b', '2026-10-26T11:59:50Z'),
    ];
    expect(freshOthers(rows, now).map((r) => r.deviceId)).toEqual(['b', 'a']);
  });

  it('upsertPresence aynı cihazın eskisini düşürür', () => {
    const rows = [row('a', '2026-10-26T11:00:00Z'), row('b', '2026-10-26T11:00:00Z')];
    const next = upsertPresence(rows, row('a', '2026-10-26T12:00:00Z'));
    expect(next.map((r) => [r.deviceId, r.activeAt])).toEqual([
      ['a', '2026-10-26T12:00:00Z'], ['b', '2026-10-26T11:00:00Z'],
    ]);
  });
});
