# Backend sözleşmesi — mobil uygulamanın kullandığı `/v1/*` uçları

Context'in iki backend'i (kişisel bot `context-server` ve çok kullanıcılı `context-cloud`) aynı mobil uygulamayı (`context-mobile`, ileride `inklore-app`) besler. İstemci tarafı `packages/client/api/*` (`mobile-core` aynısını yeniden dışa verir; `createApiClient`). Bu dosya, mobil uygulamanın beklediği ortak uç sözleşmesini tutar — bir uç burada listeliyken bir backend'de yoksa, o backend'i kullanan varyant kırılır.

Her iki backend'de bir duman testi vardır (`context-server`: ilgili `test/*.js`, `context-cloud`: `test/contract.test.js`) — uçların var olduğunu ve beklenen status code'u doğrular. Sürüklenme (drift) olursa bu testler kırılır.

## `/v1/todos*`

| Metod | Path | Açıklama | context-server | context-cloud |
|---|---|---|---|---|
| GET | `/v1/todos` | Panoları ve kartları döner | ✓ | ✓ |
| POST | `/v1/todos` | Yeni kart; cloud'da `when` + `repeat` ile zamanlı açılır, `{id, due, toast, boards}` döner | ✓ | ✓ (`when`/`repeat` F1) |
| GET | `/v1/todos/completed` | Son 7 günde tamamlananlar | ✓ | ✓ |
| POST | `/v1/todos/boards` | Yeni pano | ✓ | ✓ |
| POST | `/v1/todos/boards/:id/rename` | Pano adı değiştir | ✓ | ✓ |
| POST | `/v1/todos/boards/:id/close` | Pano kapat (son açık pano kapanmaz) | ✓ | ✓ |
| GET | `/v1/todos/:id/image` | Kart görseli | ✓ | ✓ |
| DELETE | `/v1/todos/:id` | Kalıcı sil (son bitenlerde görünmez, görseli de gider); `{title, boards}` | — | ✓ (F1) |
| POST | `/v1/todos/:id/move` | Sütun değiştir (`key`) | ✓ | ✓ |
| POST | `/v1/todos/:id/edit` | Başlık/açıklama düzenle | ✓ | ✓ |
| POST | `/v1/todos/:id/snooze` | Vade ertele (`when`) | ✓ | ✓ |
| POST | `/v1/todos/:id/unschedule` | Vadeyi kaldır | ✓ | ✓ (U1.4'te eklendi) |
| POST | `/v1/todos/:id/complete` | Tamamla | ✓ | ✓ |
| POST | `/v1/todos/:id/reopen` | Tamamlananı geri aç | ✓ | ✓ |

## `/v1/turns*`

| Metod | Path | Açıklama | context-server | context-cloud |
|---|---|---|---|---|
| POST | `/v1/turns` | Yeni tur başlatır, `{id}` döner (202) | ✓ | ✓ |
| GET | `/v1/turns/:id` | Tur durumu/cevabı (`queued`\|`running`\|`done`\|`error`) | ✓ | ✓ |
| POST | `/v1/turns/:id/steer` | Tur sürerken ek metin/görsel enjekte eder; tur bittiyse 409 | ✓ | ✓ (U1.4'te eklendi) |
| POST | `/v1/turns/:id/seen` | İstemci cevabı gösterdi, push bastırılsın | ✓ | ✓ (U1.4'te eklendi) |
| POST | `/v1/voice-turn` | Ses (base64) → yazıya çevirip tur başlatır, `{id, text}` (202) | ✓ | ✓ |
| POST | `/v1/transcribe` | Ses → metin, tur açmaz | ✓ | ✓ |
| POST | `/v1/media` | Tura eklenecek görsel, `{id}` döner | ✓ | ✓ |
| DELETE | `/v1/history` | Sunucu tarafı sohbet hafızasını temizler | ✓ | ✓ |

## `/v1/life*` (sağlık)

Cloud'da Sağlık modülü kapalıysa hepsi 404. Hatalı tarih/ay 400.

| Metod | Path | Açıklama | context-server | context-cloud |
|---|---|---|---|---|
| GET | `/v1/life?date=YYYY-MM-DD` | Günün ölçüm, öğün, antrenman ve özeti | ✓ | ✓ (+ `goal`; özette `waterMl`, `sleepSource`) |
| GET | `/v1/life/month?month=YYYY-MM` | Ayın gün noktaları ve hedefler | ✓ | ✓ (+ `goal`; noktada `waterMl`) |
| GET | `/v1/life/media/:name` | Öğün/ölçüm görseli | ✓ | ✓ |
| POST | `/v1/life/sync` | Telefonun adım/yakım/antrenman/uyku günü yazılır | — (kişiselde sunucu içe aktarır) | ✓ |
| GET/PUT | `/v1/life/profile` | Bazal için boy, cinsiyet, doğum yılı; `missing`, `restingKcal` | — | ✓ |
| GET/PUT | `/v1/life/targets` | Hedefler: `auto` + gerekçe `basis`, kişinin `manual`'i (null = otomatik) | — | ✓ |
| POST | `/v1/life/meal` | Öğün: `{date, meal: kahvalti\|ogle\|aksam\|ara, text, kcal, proteinG?, amount?}` → `{intakeKcal}`; Beslenme tablosuna | — | ✓ |
| POST | `/v1/life/meal/remove` | `{date, meal, name?}` (ad yoksa öğünün hepsi) → `{intakeKcal, removed}`; yoksa 404 | — | ✓ |
| POST | `/v1/life/sport` | Elle spor: `{date, type, label?, minutes, intensity: hafif\|orta\|zor\|cok_zor, km?, avgHr?, kcal?, phoneCarried?}` → `{kcal, method, kgAssumed, fromSteps, burnKcal}`; kaloriyi sunucu hesaplar | — | ✓ |
| POST | `/v1/life/sport/remove` | `{date, label}`, yalnız elle girilen → `{burnKcal}`; yoksa 404 | — | ✓ |
| GET | `/v1/life/water?date=` | `{date, waterMl}` | — | ✓ |
| POST | `/v1/life/water` | `{date, ml, mode: add\|set}` (add'de eksi = geri al) → `{waterMl}` | — | ✓ |
| POST | `/v1/life/weight` | `{date, kg, waistCm?}`; aynı gün satırı güncellenir → `{replaced}` | — | ✓ |
| POST | `/v1/life/sleep` | `{date (kalkış günü), bed, wake, minutes?}` → `{sleepMin}`; `uyku_kaynak: elle`, telefon ezmez | — | ✓ |

Elle kayıt uçlarında ileri tarih 400. Özetteki `exercises[]` elle girilenlerde `type: "MANUAL"` ve ek alanlar taşır: `manual`, `sport`, `intensity`, `detail`, `fromSteps` (saat `time` boş olabilir).

## `/v1/memory*`

| Metod | Path | Açıklama | context-server | context-cloud |
|---|---|---|---|---|
| GET | `/v1/memory` | Hafıza dosyaları `{files}` | ✓ | ✓ |
| POST | `/v1/memory` | Satır ekle/düzelt/sil (`dosya`, `islem`, `satir`, `eski`, `bolum`) | ✓ | ✓ |
| GET | `/v1/memory/stats?days=7` | Son günlerde hafızaya yazılanlar | ✓ | ✓ |
| GET | `/v1/memory/recent?limit=20` | Son öğrendiklerim `{items: [{key, label, text, at}]}` (1–100, yeniden eskiye) | — | ✓ (F1) |
| PATCH | `/v1/memory/:dosya` | Tek maddeyi düzelt (`eski`, `satir`); `{ok, changed, file}` | — | ✓ (F1) |
| DELETE | `/v1/memory/:dosya?eski=…` | Tek maddeyi sil; `{ok, changed, file}` | — | ✓ (F1) |

`:dosya` = `profil` · `sozluk` · `yerler` · `kurallar` · `alanlar` (başkası 404). `eski` maddenin tam metni ya da benzersiz parçası: birebir eşleşen tek madde öncelikli; bulunamaz ya da birden çok maddeye uyarsa 400. "Son öğrendiklerim" ayrı kayıt tutmaz, vault git geçmişindeki eklenen satırlardan okunur; sonradan silinen/değişen madde listede çıkmaz.

## `/v1/todos` tekrar kuralları

`repeat`: `daily` · `weekdays` · `weekly` · `monthly` · `yearly` (Türkçe karşılıkları da: "her gün", "hafta içi" …). `when` olmadan tekrar 400. Tekrarlı kartta `repeat` alanı pano listesinde gelir; `unschedule` tekrarı da kaldırır.

## Bildirim

| Metod | Path | Açıklama | context-server | context-cloud |
|---|---|---|---|---|
| POST | `/v1/push/register` | Expo jetonu (`token`, `platform`; kişiselde `channels`). Aynı jeton başka hesaptaysa oradan düşer | ✓ | ✓ |

## Hesap, tanışma ve modüller

Kişisel sunucu tek kullanıcılı ve cihaz eşleşmesiyle çalışır (`/v1/devices*`); bu uçlar yalnız cloud'dadır. `GET /v1/health` ikisinde de vardır (jetonla; cloud'da jetonsuz da açık).

| Metod | Path | Açıklama | context-server | context-cloud |
|---|---|---|---|---|
| GET | `/v1/health` | Sunucu ayakta mı | ✓ | ✓ |
| GET | `/v1/config` | Herkese açık ayar (`openSignup`) | — | ✓ |
| POST | `/v1/auth/register` | Davetle (ya da açık kayıtla) kayıt; `{token, user, recoveryCode}` | — | ✓ |
| POST | `/v1/auth/login` | Giriş | — | ✓ |
| POST | `/v1/auth/recover` | Kurtarma kodu + yeni şifre | — | ✓ |
| POST | `/v1/auth/logout` | Bu oturumu kapatır | — | ✓ |
| GET | `/v1/me` | Kullanıcı, modüller, kurulum, kota | — | ✓ |
| PATCH | `/v1/me` | Ad, saat dilimi, model, sohbet kaydı | — | ✓ |
| DELETE | `/v1/me` | Hesabı siler (şifreyle) | — | ✓ |
| POST | `/v1/me/password` | Şifre değiştir | — | ✓ |
| POST | `/v1/me/recovery` | Yeni kurtarma kodu | — | ✓ |
| POST | `/v1/me/email/send` | Doğrulama kodu gönder | — | ✓ |
| POST | `/v1/me/email/verify` | Kodu doğrula | — | ✓ |
| GET | `/v1/me/sessions` | Oturumlar | — | ✓ |
| DELETE | `/v1/me/sessions` | Diğer oturumları kapat | — | ✓ |
| DELETE | `/v1/me/sessions/:id` | Bir oturumu kapat | — | ✓ |
| GET | `/v1/me/data` | Veri özeti (not/dosya, yapılacaklar, anahtarlar, servisler, oturumlar) | — | ✓ |
| POST | `/v1/me/export` | Zip hazırlar, `{url, expiresInSec, bytes}` döner | — | ✓ |
| GET | `/v1/export/:id` | Zip'i indirir; jetonsuz, tek kullanımlık, kısa ömürlü | — | ✓ |
| GET | `/v1/modules` | Modüller | ✓ (düz `{anahtar: true}`) | ✓ (`{catalog, enabled}`) |
| PUT | `/v1/modules` | Modül aç/kapat (`module`, `enabled`) | — | ✓ |
| GET | `/v1/modules/:module/setup` | Modül tanışma kartları | — | ✓ |
| POST | `/v1/modules/:module/setup` | Tanışma cevapları (`answers` ya da `skip`) | — | ✓ |
| POST | `/v1/modules/:module/suggestion` | Öneriye "Şimdi değil" (`action: dismiss`) | — | ✓ |
| POST | `/v1/onboarding` | `action: takip_sorulari` ya da `tamamla` | — | ✓ |

İstemci modül durumunu `GET /v1/me` içindeki `modules`'tan okur; `GET /v1/modules`'un iki backend'de biçimi farklıdır.

### Gizlilik: verimi indir, hesabı sil

- **İndir:** `POST /v1/me/export` → dönen göreli `url` istemcide tam adrese çevrilir (`account.exportData()`), tarayıcı/paylaşım ile açılır; ikinci kez açılmaz.
- **Sil:** `DELETE /v1/me` gövdesi `{password}`; şifre yanlışsa 401. Kullanıcı satırları (CASCADE) ve şifreli klasör silinir, tüm oturumlar düşer. Geri dönüşü yok.
- **Oturumlar:** `GET /v1/me/sessions` → `{sessions: [{id, device, createdAt, lastSeen, current}]}`; `DELETE` ile tek ya da diğer hepsi kapanır.
- **Şifre:** `POST /v1/me/password` gövdesi `{current, next}`.

### `steer` mekanizması

`steer`, bir turun araç döngüsü sürerken kullanıcıdan gelen ek metni modele enjekte eder (`steer.js#steerMessage`). Backend'in `runAgent`/`runTurn` katmanında her model çağrısından önce `pullSteer()` çağrılır; varsa mesaj `messages` dizisine eklenir ve döngü bir adım daha sürer. `queued`/`running` dışındaki bir tura `steer` isteği 409 döner.

## İstemci eşlemesi (`createApiClient`)

| Uç | Fonksiyon |
|---|---|
| `DELETE /v1/todos/:id` | `todos.deleteTodo(id)` |
| `POST /v1/todos` (`when`, `repeat`) | `todos.createTodo(input)` → `{id, due, toast, boards}` · `todos.create(input)` → panolar |
| `GET /v1/memory/recent` | `memory.recent(limit)` |
| `PATCH` / `DELETE /v1/memory/:dosya` | `memory.patchItem(key, eski, satir)` · `memory.deleteItem(key, eski)` |
| `POST /v1/me/export` | `account.exportData()` (= `prepareExport`) |
| `GET /v1/me/data` | `account.dataOverview()` |
| `DELETE /v1/me` | `account.deleteAccount(password)` |
| `POST /v1/me/password` | `account.changePassword(current, next)` |
| `/v1/me/sessions*` | `account.sessions()` · `account.endSession(id)` · `account.endOtherSessions()` |
| `POST /v1/push/register` | `account.registerPush(token, {platform, channels})` |
