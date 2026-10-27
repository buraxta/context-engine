import { ApiError, asRecord, asString, type Requester } from './request';

/** Yapılacaklar: `/v1/todos*` (bkz. backend-core/contract.md). Değiştiren her uç güncel pano listesini döner. */

export type TodoKey = 'acil' | 'oncelikli' | 'normal';
export type TodoCard = {
  id: string;
  title: string;
  note: string;
  due: string | null;
  imageId: string | null;
  /** Tüm görsellerin id'leri (ilki `imageId`); eski sunucuda boş ya da yalnız kapak. */
  images?: string[];
  /** Tekrar kuralı ("günlük", "haftalık" …); yalnız tekrarlı kartta gelir. */
  repeat?: string | null;
  /** Yalnız istemcide: yüklenmeden önce gösterilen yerel görsel. */
  previewUri?: string | null;
};
export type TodoSection = { key: TodoKey; name: string; cards: TodoCard[] };
export type TodoBoard = { id: string; name: string; sections: TodoSection[] };
export type CompletedTodo = { id: string; title: string; board: string; key: TodoKey; completedAt: string };
/** Sunucu Türkçe kuralları da kabul eder ("her gün", "hafta içi" …). */
export type TodoRepeat = 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly';
export type NewTodo = {
  boardId: string;
  title: string;
  description: string;
  key: TodoKey;
  /** Tek JPEG (base64, eski alan). */
  image?: string;
  /** Birden çok görsel (base64); en fazla 12, her biri ≤1.5 MB. */
  images?: TodoImageInput[];
  /** Vade: serbest ifade ("yarın 9", "+30m", "YYYY-AA-GG SS:DD"); kart zamanlı açılır. */
  when?: string;
  /** Tekrar; `when` olmadan sunucu 400 döner. */
  repeat?: TodoRepeat | string;
};
export type TodoImageInput = { mime: 'image/jpeg' | 'image/png'; data: string };
/** Zamanlı oluşturmanın sonucu: yeni kartın id'si ve vadesi (eski sunucu yalnız panoları döner → id null). */
export type CreatedTodo = { id: string | null; due: string | null; toast: string | null; boards: TodoBoard[] };

export const TODO_KEYS: TodoKey[] = ['acil', 'oncelikli', 'normal'];
const TODO_TIMEOUT = 25_000;

export function parseTodoCard(value: unknown): TodoCard | null {
  const row = asRecord(value);
  if (!row || typeof row.id !== 'string' || typeof row.title !== 'string') return null;
  return {
    id: row.id,
    title: row.title,
    note: asString(row.note),
    due: typeof row.due === 'string' ? row.due : null,
    imageId: typeof row.imageId === 'string' && row.imageId ? row.imageId : null,
    images: Array.isArray(row.images)
      ? row.images.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : typeof row.imageId === 'string' && row.imageId ? [row.imageId] : [],
    ...(typeof row.repeat === 'string' && row.repeat ? { repeat: row.repeat } : {}),
  };
}

export function parseTodoBoards(body: Record<string, unknown>, missingMessage = 'Pano listesi gelmedi.'): TodoBoard[] {
  if (!Array.isArray(body.boards)) throw new ApiError(missingMessage);
  return body.boards.flatMap((board) => {
    const row = asRecord(board);
    if (!row || typeof row.name !== 'string' || !Array.isArray(row.sections)) return [];
    const sections = row.sections.flatMap((section) => {
      const item = asRecord(section);
      if (!item || typeof item.key !== 'string' || !TODO_KEYS.includes(item.key as TodoKey)) return [];
      if (typeof item.name !== 'string' || !Array.isArray(item.cards)) return [];
      return [{
        key: item.key as TodoKey,
        name: item.name,
        cards: item.cards.flatMap((card) => {
          const parsed = parseTodoCard(card);
          return parsed ? [parsed] : [];
        }),
      }];
    });
    return [{ id: asString(row.id), name: row.name, sections }];
  });
}

export function parseCompletedTodos(body: Record<string, unknown>): CompletedTodo[] {
  const rows = Array.isArray(body.items) ? body.items : [];
  return rows.flatMap((raw) => {
    const item = asRecord(raw);
    if (!item || typeof item.id !== 'string' || typeof item.title !== 'string') return [];
    return [{
      id: item.id,
      title: item.title,
      board: asString(item.board),
      key: TODO_KEYS.includes(item.key as TodoKey) ? (item.key as TodoKey) : 'oncelikli',
      completedAt: asString(item.completedAt),
    }];
  });
}

export function createTodosApi(request: Requester) {
  const card = (id: string, action: string) => `/v1/todos/${encodeURIComponent(id)}/${action}`;
  const boards = async (path: string, body?: unknown, timeoutMs = TODO_TIMEOUT) =>
    parseTodoBoards(await request(path, { method: path === '/v1/todos' && body === undefined ? 'GET' : 'POST', body, timeoutMs }));

  const post = (input: NewTodo) => {
    const withImages = Boolean(input.image) || Boolean(input.images?.length);
    return request('/v1/todos', {
      body: {
        boardId: input.boardId,
        title: input.title,
        description: input.description,
        key: input.key,
        ...(input.image ? { image: { mime: 'image/jpeg', data: input.image } } : {}),
        ...(input.images?.length ? { images: input.images } : {}),
        ...(input.when ? { when: input.when } : {}),
        ...(input.repeat ? { repeat: input.repeat } : {}),
      },
      timeoutMs: withImages ? 60_000 + (input.images?.length ?? 0) * 15_000 : TODO_TIMEOUT,
    });
  };

  return {
    list: () => boards('/v1/todos'),
    create: async (input: NewTodo) => parseTodoBoards(await post(input)),
    /** `create` ile aynı istek; yeni kartın id'si ve çözülen vade de döner (oluştur + snooze tek adım). */
    createTodo: async (input: NewTodo): Promise<CreatedTodo> => {
      const body = await post(input);
      return {
        id: typeof body.id === 'string' ? body.id : null,
        due: typeof body.due === 'string' ? body.due : null,
        toast: typeof body.toast === 'string' ? body.toast : null,
        boards: parseTodoBoards(body),
      };
    },
    /** Kalıcı silme: "son bitenler"de görünmez, görseli de gider. */
    deleteTodo: async (id: string) => {
      const body = await request(`/v1/todos/${encodeURIComponent(id)}`, { method: 'DELETE', timeoutMs: TODO_TIMEOUT });
      return { title: asString(body.title), boards: parseTodoBoards(body) };
    },
    move: (id: string, key: TodoKey) => boards(card(id, 'move'), { key }),
    edit: (id: string, title: string, description: string) => boards(card(id, 'edit'), { title, description }),
    complete: (id: string) => boards(card(id, 'complete')),
    reopen: (id: string) => boards(card(id, 'reopen')),
    /** Zamanı kaldır: kart yerinde, vadesiz kalır. */
    unschedule: (id: string) => boards(card(id, 'unschedule')),
    /** `when`: serbest ifade ("yarın 9", "1 saat"); sunucu çözer. */
    snooze: async (id: string, when: string) => {
      const body = await request(card(id, 'snooze'), { body: { when }, timeoutMs: TODO_TIMEOUT });
      return {
        title: asString(body.title),
        due: asString(body.due),
        toast: typeof body.toast === 'string' ? body.toast : null,
        boards: Array.isArray(body.boards) ? parseTodoBoards(body) : null,
      };
    },
    /** Son 7 günde tamamlananlar (yeniden eskiye). */
    completed: async () => parseCompletedTodos(await request('/v1/todos/completed', { timeoutMs: TODO_TIMEOUT })),
    createBoard: (name: string) => boards('/v1/todos/boards', { name }),
    renameBoard: (id: string, name: string) => boards(`/v1/todos/boards/${encodeURIComponent(id)}/rename`, { name }),
    closeBoard: (id: string) => boards(`/v1/todos/boards/${encodeURIComponent(id)}/close`),
    /** Var olan karta görsel ekler (base64). */
    addImage: async (id: string, image: TodoImageInput) => {
      const body = await request(card(id, 'images'), { body: { image }, timeoutMs: 60_000 });
      return { imageId: asString(body.imageId), boards: parseTodoBoards(body) };
    },
    removeImage: async (id: string, imageId: string) =>
      parseTodoBoards(await request(`${card(id, 'images')}/${encodeURIComponent(imageId)}`, { method: 'DELETE', timeoutMs: TODO_TIMEOUT })),
    /** Kart görseli (`imageId` yoksa ilki); isteğe `authorization` başlığı eklenmeli. */
    imageUrl: (id: string, imageId?: string | null) =>
      request.url(imageId ? `${card(id, 'images')}/${encodeURIComponent(imageId)}` : card(id, 'image')),
  };
}

export type TodosApi = ReturnType<typeof createTodosApi>;
