import type { TodoBoard, TodoCard, TodoKey, TodoSection } from './api/todos';

/** Pano/kart saf yardımcıları: iyimser güncellemeler, sıralama, Bugün seçimi. Ekrana ve depoya bağlı değil. */

export type BoardCardHit = { card: TodoCard; board: TodoBoard; section: TodoSection };

export function emptySections(names: Record<TodoKey, string> = { acil: 'Acil', oncelikli: 'Öncelikli', normal: 'Acil Olmayan' }): TodoSection[] {
  return (['acil', 'oncelikli', 'normal'] as const).map((key) => ({ key, name: names[key], cards: [] }));
}

/** Not içindeki vault bağlantısı ("Obsidian: X.md" ya da "Detay: X.md"). */
export function vaultPath(note: string) {
  const match = /(?:Obsidian|Detay):\s*(\S+\.md)/i.exec(note);
  return match ? match[1] : null;
}

/** Notun kullanıcıya görünen kısmı: hatırlatma/tekrar/bağlantı satırları atılır. */
export function descriptionOf(note: string) {
  return note
    .replace(/^\s*Hatırlat:.*$/gim, '')
    .replace(/^\s*Tekrar:.*$/gim, '')
    .replace(/^\s*(?:Obsidian|Detay):\s*\S+\.md\s*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Düzenlenen açıklamayı nottaki bağlantı/hatırlatma/tekrar satırlarını koruyarak birleştirir. */
export function composeNote(note: string, description: string) {
  const link = vaultPath(note);
  const remind = /^\s*Hatırlat:.*$/im.exec(note)?.[0]?.trim();
  const repeat = /^\s*Tekrar:.*$/im.exec(note)?.[0]?.trim();
  return [description.trim(), link ? `Obsidian: ${link}` : '', remind ?? '', repeat ?? ''].filter(Boolean).join('\n\n');
}

/** Kullanıcının pano sırası; sırada olmayanlar sonda, `last` ile eşleşenler en sonda. */
export function arrangeBoards(list: TodoBoard[], order: string[], last: (board: TodoBoard) => boolean = () => false) {
  const tail = list.filter(last);
  const rest = list.filter((board) => !last(board));
  const rank = new Map(order.map((id, index) => [id, index]));
  const placed = rest.filter((board) => rank.has(board.id));
  const unplaced = rest.filter((board) => !rank.has(board.id));
  placed.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  return [...placed, ...unplaced, ...tail];
}

function mapCards(boards: TodoBoard[], fn: (card: TodoCard) => TodoCard) {
  return boards.map((board) => ({
    ...board,
    sections: board.sections.map((section) => ({ ...section, cards: section.cards.map(fn) })),
  }));
}

/** Kartı aynı panoda başka önceliğe taşır (başa). */
export function relocate(boards: TodoBoard[], id: string, key: TodoKey) {
  const hit = findCard(boards, id);
  if (!hit) return boards;
  return boards.map((board) => (
    board.id !== hit.board.id || board.name !== hit.board.name
      ? board
      : {
          ...board,
          sections: board.sections.map((section) => {
            const cards = section.cards.filter((item) => item.id !== id);
            return section.key === key ? { ...section, cards: [hit.card, ...cards] } : { ...section, cards };
          }),
        }
  ));
}

export function dropCard(boards: TodoBoard[], id: string) {
  return boards.map((board) => ({
    ...board,
    sections: board.sections.map((section) => ({ ...section, cards: section.cards.filter((card) => card.id !== id) })),
  }));
}

export function rewriteCard(boards: TodoBoard[], id: string, title: string, description: string) {
  return mapCards(boards, (card) => (card.id === id ? { ...card, title, note: composeNote(card.note, description) } : card));
}

/** Zamanı kaldırılan kart: başlıktaki tarih parantezi ve Hatırlat/Tekrar satırları gider (sunucuyla aynı). */
export function unscheduleCard(boards: TodoBoard[], id: string) {
  return mapCards(boards, (card) => (
    card.id === id
      ? {
          ...card,
          title: card.title.replace(/\s*\((?:\d{1,2}\s+\S{3}\s+\d{2}:\d{2}|\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\)\s*$/u, '').trim() || card.title,
          note: card.note.replace(/^\s*(Hatırlat|Tekrar):.*$/gim, '').replace(/\n{3,}/g, '\n\n').trim(),
          due: null,
        }
      : card
  ));
}

export function findCard(boards: TodoBoard[], id: string): BoardCardHit | null {
  for (const board of boards) {
    for (const section of board.sections) {
      const card = section.cards.find((item) => item.id === id);
      if (card) return { card, board, section };
    }
  }
  return null;
}

/** Başlıktaki "(9 Eki 09:00)" gibi vade eki — kartta saat ayrı gösterildiği için atılır. */
export function cleanTitle(title: string) {
  return title.replace(/\s*\((\d{1,2} \S+( \d{4})?)? ?\d{1,2}:\d{2}\)\s*$/, '').trim() || title;
}

// ---------------------------------------------------------------- Bugün ve zamanlı kartlar

export type FlatCard = TodoCard & { board: string; key: TodoKey };
export type TodayTask = FlatCard & { overdue: boolean };
export type TimedTask = FlatCard & { at: number; state: 'gecikti' | 'yakin' | 'sonra' };

/** "Yakın" penceresi: bu kadar içinde vadesi gelen kart katlanmadan görünür. */
export const NEAR_MS = 48 * 60 * 60 * 1000;

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function timeOf(due: string | null) {
  return due ? new Date(due).getTime() : NaN;
}

export function flattenBoards(boards: TodoBoard[]): FlatCard[] {
  return boards.flatMap((board) =>
    board.sections.flatMap((section) => section.cards.map((card) => ({ ...card, board: board.name, key: section.key }))),
  );
}

export function hasDue(card: TodoCard) {
  return !Number.isNaN(timeOf(card.due));
}

/** Bugün listesi = tüm panolardaki acil kartlar. Sıra: gecikmiş → vadesi yakın → vadesiz. */
export function todayTasks(boards: TodoBoard[], now = new Date()): TodayTask[] {
  const urgent = flattenBoards(boards).flatMap<TodayTask>((card) => {
    if (card.key !== 'acil') return [];
    const at = timeOf(card.due);
    const overdue = !Number.isNaN(at) && at < now.getTime() && dayKey(new Date(at)) !== dayKey(now);
    return [{ ...card, overdue }];
  });
  return urgent.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (a.due && b.due) return timeOf(a.due) - timeOf(b.due);
    return a.due ? -1 : b.due ? 1 : 0;
  });
}

/** Vadesi olan her kart, öncelikten bağımsız, saate göre. Durum: gecikti / yakin (48 sa) / sonra. */
export function timedTasks(boards: TodoBoard[], now = Date.now()): TimedTask[] {
  return flattenBoards(boards)
    .flatMap<TimedTask>((card) => {
      const at = timeOf(card.due);
      if (Number.isNaN(at)) return [];
      const state = at < now ? 'gecikti' : at - now <= NEAR_MS ? 'yakin' : 'sonra';
      return [{ ...card, at, state }];
    })
    .sort((a, b) => a.at - b.at);
}

/** Katlanmadan görünen kart: gecikmiş, 48 sa içi ya da acil. */
export function isPinned(task: TimedTask) {
  return task.state !== 'sonra' || task.key === 'acil';
}

/** Sıradaki hatırlatma: vadesi gelecekte olan en yakın kart. */
export function nextReminder(boards: TodoBoard[], now = new Date()): FlatCard | null {
  let best: FlatCard | null = null;
  for (const card of flattenBoards(boards)) {
    const at = timeOf(card.due);
    if (Number.isNaN(at) || at <= now.getTime()) continue;
    if (!best || at < timeOf(best.due)) best = card;
  }
  return best;
}

export type RelativeLabels = {
  now: string;
  minutes: (n: number) => string;
  hours: (h: number, m: number) => string;
  days: (n: number) => string;
  future: (amount: string) => string;
  past: (amount: string) => string;
};

export const RELATIVE_TR: RelativeLabels = {
  now: 'şimdi',
  minutes: (n) => `${n} dk`,
  hours: (h, m) => `${h} sa${m ? ` ${m} dk` : ''}`,
  days: (n) => `${n} gün`,
  future: (amount) => `${amount} sonra`,
  past: (amount) => `${amount} gecikti`,
};

/** "40 dk sonra", "3 sa sonra", "2 gün sonra"; geçmişte "15 dk gecikti". 6 saatten kısa sürelerde dakika da yazılır. */
export function relativeDue(at: number, now = Date.now(), labels: RelativeLabels = RELATIVE_TR) {
  const diff = at - now;
  const minutes = Math.round(Math.abs(diff) / 60_000);
  if (minutes < 1) return labels.now;
  const amount =
    minutes < 60 ? labels.minutes(minutes)
    : minutes < 24 * 60 ? labels.hours(Math.floor(minutes / 60), minutes < 6 * 60 ? minutes % 60 : 0)
    : labels.days(Math.round(minutes / (24 * 60)));
  return diff >= 0 ? labels.future(amount) : labels.past(amount);
}
