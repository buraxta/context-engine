# Backend sözleşmesi — `/v1/todos*` ve `/v1/turns*`

Context'in iki backend'i (kişisel bot `context-server` ve çok kullanıcılı `context-cloud`) aynı mobil uygulamayı (`context-mobile`) besler. Bu dosya, mobil uygulamanın beklediği ortak uç sözleşmesini tutar — bir uç burada listeliyken bir backend'de yoksa, o backend'i kullanan varyant kırılır.

Her iki backend'de bir duman testi vardır (`context-server`: ilgili `test/*.js`, `context-cloud`: `test/contract.test.js`) — uçların var olduğunu ve beklenen status code'u doğrular. Sürüklenme (drift) olursa bu testler kırılır.

## `/v1/todos*`

| Metod | Path | Açıklama | context-server | context-cloud |
|---|---|---|---|---|
| GET | `/v1/todos` | Panoları ve kartları döner | ✓ | ✓ |
| POST | `/v1/todos` | Yeni kart | ✓ | ✓ |
| GET | `/v1/todos/completed` | Son 7 günde tamamlananlar | ✓ | ✓ |
| POST | `/v1/todos/boards` | Yeni pano | ✓ | ✓ |
| POST | `/v1/todos/boards/:id/rename` | Pano adı değiştir | ✓ | ✓ |
| POST | `/v1/todos/boards/:id/close` | Pano kapat (son açık pano kapanmaz) | ✓ | ✓ |
| GET | `/v1/todos/:id/image` | Kart görseli | ✓ | ✓ |
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

### `steer` mekanizması

`steer`, bir turun araç döngüsü sürerken kullanıcıdan gelen ek metni modele enjekte eder (`steer.js#steerMessage`). Backend'in `runAgent`/`runTurn` katmanında her model çağrısından önce `pullSteer()` çağrılır; varsa mesaj `messages` dizisine eklenir ve döngü bir adım daha sürer. `queued`/`running` dışındaki bir tura `steer` isteği 409 döner.
