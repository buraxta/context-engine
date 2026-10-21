/**
 * Modül kaydı. Uygulama sekmeleri ve sunucu uçları buna bakar.
 * `core` modüller kapatılamaz; diğerleri kullanıcının ayarıdır.
 */
export const MODULES = {
  chat: { core: true, label: 'Sohbet' },
  notes: { core: true, label: 'Notlar' },
  memory: { core: true, label: 'Hafıza' },
  inbox: { core: true, label: 'Akış' },
  todos: { core: true, label: 'Yapılacaklar' },
  guide: { core: true, label: 'Rehber' },
  // Temel ama kurulumu atlanabilir: açık gelir, bağlanana kadar "kurulmadı" görünür.
  bitwarden: { core: false, default: true, label: 'Şifreler (Bitwarden)' },
  github_sync: { core: false, default: false, label: 'GitHub ile Obsidian senkronu' },
  semantic_search: { core: false, default: false, label: 'Anlamsal arama' },
  health: { core: false, default: false, label: 'Sağlık' },
  trello: { core: false, default: false, label: 'Trello' },
};

export function isModule(name) {
  return Object.hasOwn(MODULES, name);
}

/** DB satırları + varsayılanlar → { modül: açık mı }. */
export function resolveModules(rows) {
  const saved = new Map(rows.map((row) => [row.module, Boolean(row.enabled)]));
  const out = {};
  for (const [name, meta] of Object.entries(MODULES)) {
    out[name] = meta.core ? true : (saved.get(name) ?? Boolean(meta.default));
  }
  return out;
}

export function listModules(db, userId) {
  const rows = db.prepare('SELECT module, enabled FROM modules WHERE user_id = ?').all(userId);
  return resolveModules(rows);
}

export function setModule(db, userId, name, enabled) {
  if (!isModule(name)) throw Object.assign(new Error('Böyle bir modül yok.'), { status: 404 });
  if (MODULES[name].core) throw Object.assign(new Error('Bu modül kapatılamaz.'), { status: 400 });
  db.prepare(`
    INSERT INTO modules (user_id, module, enabled) VALUES (?, ?, ?)
    ON CONFLICT (user_id, module) DO UPDATE SET enabled = excluded.enabled
  `).run(userId, name, enabled ? 1 : 0);
  return listModules(db, userId);
}

export function moduleCatalog() {
  return Object.entries(MODULES).map(([id, meta]) => ({ id, label: meta.label, core: meta.core }));
}
