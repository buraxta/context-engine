// Platformsuz Context istemcisi: context-server uçları, tipler, canlı kanal ve senkron kuralları.
// Telefon (context-mobile) ve masaüstü (context-desktop) aynı paketi kullanır → sözleşme tek yerde.

export { createApiClient } from './api/client';
export type { ApiClient, ApiClientConfig } from './api/client';
export { ApiError, DEFAULT_MESSAGES, createRequester, trimBase } from './api/request';
export type { ApiConfig, ApiMessages, Requester, RequestOptions } from './api/request';
export * from './api/turns';
export * from './api/todos';
export * from './api/life';
export * from './api/memory';
export * from './api/account';
export * from './api/sync';

export { createLiveSync } from './sync/live';
export type { LiveHandlers, LiveOptions, LiveSync } from './sync/live';
export * from './sync/rules';

/** kod-runner (Kod ajanı) istemcisi: `kod.createKodApi()`, tipler `kod.Run`, `kod.Otopilot` … */
export * as kod from './kod/index';
