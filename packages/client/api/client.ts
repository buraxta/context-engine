import { createAccountApi } from './account';
import { createLifeApi, type LifeTargets } from './life';
import { createMemoryApi } from './memory';
import { createRequester, type ApiConfig } from './request';
import { createSyncApi } from './sync';
import { createTodosApi } from './todos';
import { createTurnsApi, type TurnsOptions } from './turns';

export type ApiClientConfig = ApiConfig & {
  turns?: TurnsOptions;
  /** Sunucu sağlık hedefi göndermezse. */
  lifeTargets?: LifeTargets;
};

/**
 * Sunucu istemcisi, alana göre gruplu. Adres/jeton/metinler dışarıdan gelir; React Native'e bağlı değildir.
 *
 *   const api = createApiClient({ baseUrl: URL, token: () => session.token });
 *   const id = await api.turns.send({ text: 'Merhaba' });
 *   await api.turns.wait(id, (job) => render(job));
 */
export function createApiClient(config: ApiClientConfig) {
  const request = createRequester(config);
  return {
    request,
    turns: createTurnsApi(request, config.turns),
    todos: createTodosApi(request),
    life: createLifeApi(request, config.lifeTargets),
    memory: createMemoryApi(request),
    account: createAccountApi(request),
    /** Cihazlar arası senkron: dizi, canlı kanal, ortak durum, varlık. */
    sync: createSyncApi(request),
    /** Sunucu ayakta mı ve jeton geçerli mi. */
    health: async () => (await request('/v1/health', { timeoutMs: 8_000 })).ok === true,
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
