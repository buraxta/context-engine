# context-engine

Context ürününün açık kaynak çekirdeği — open-core modelin açık yarısı.

Ticari/barındırma katmanı (admin paneli, ödeme/abonelik, kota mantığı, deploy sırları) bu repoda değil; `context-mobile` ve `context-cloud` (private) içinde kalır ve bu paketleri bağımlılık olarak kullanır.

## Paketler

- `packages/mobile-core/` — React Native/Expo çekirdek bileşenler: modül/yetenek sistemi (`registry.ts`), varyant mekanizması (`variant.ts`), i18n altyapısı (`src/i18n/`), sohbet/UI bileşenleri.
- `packages/backend-core/` — Node.js sohbet motoru ve çekirdek API: `turns.js`, `llm.js`, `prompt.js`, `vault-tools.js`, `todos.js`, `memory.js`, `modules.js` (modül kataloğu).

## Lisans

Apache License 2.0 — bkz. [LICENSE](./LICENSE).

## Durum

Bu repo şu an **private**. Ürün ilk kapalı beta aşamasından (context-cloud planı U10.1) geçtikten sonra public yapılması planlanıyor. Detay: Context Cloud vault planı, `ContextCloud/00-Plan.md` › U1.5.
