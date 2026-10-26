# context-engine

Context ürününün açık kaynak çekirdeği — open-core modelin açık yarısı.

Ticari/barındırma katmanı (admin paneli, ödeme/abonelik, kota mantığı, deploy sırları) bu repoda değil; `context-mobile` ve `context-cloud` (private) içinde kalır ve bu paketleri bağımlılık olarak kullanır.

## Paketler

- `packages/client/` — platformsuz sunucu istemcisi (telefon ve masaüstü ortak; React Native'e/DOM'a bağlı değil):
  - `api/` — `createApiClient({ baseUrl, token })`: turlar, yapılacaklar, sağlık, hafıza, hesap/tanışma/modüller, senkron (`sync`: ana sohbet dizisi, `/v1/live`, ortak durum, varlık). Adres, jeton ve hata metinleri uygulamadan gelir.
  - `sync/live.ts` — canlı kanal döngüsü `createLiveSync` (yetiş + uzun istek, duraklat/sürdür, eski sunucuda kendiliğinden kapanır).
  - `sync/rules.ts` — senkron kuralları: taslak anahtarı/birleşmesi, görüldü (ileri gider), kümeler (birleşim), varlık tazeliği.
- `packages/mobile-core/` — mobil uygulamaların UI'sız çekirdeği (istemciyi de yeniden dışa verir):
  - `turn-runner.ts` — tur akışı: yeni tur, yoklama, süren tura ek metin (steer); yan etkiler çağıranda.
  - `todos.ts` — pano/kart saf yardımcıları, Bugün ve zamanlı kart seçimi.
  - `health.ts` — yakım parçaları, öğün toplamı, açık ve hafta özeti.
  - `registry.ts` (modül görünürlüğü), `i18n.ts` (kütüphanesiz çeviri).
- `packages/backend-core/` — Node.js sohbet motoru ve çekirdek API: `turns.js`, `llm.js`, `prompt.js`, `vault-tools.js`, `todos.js`, `memory.js`, `modules.js` (modül kataloğu).

## Lisans

Apache License 2.0 — bkz. [LICENSE](./LICENSE).

## Durum

Bu repo şu an **private**. Ürün ilk kapalı beta aşamasından (context-cloud planı U10.1) geçtikten sonra public yapılması planlanıyor. Detay: Context Cloud vault planı, `ContextCloud/00-Plan.md` › U1.5.
