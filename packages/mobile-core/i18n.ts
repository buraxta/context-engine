/**
 * Hafif, kütüphanesiz i18n motoru. Sözlük ve dil, çağıran uygulama tarafından verilir —
 * bu paket hiçbir ürüne özel metin içermez.
 */

type Dict = { [key: string]: string | Dict };

function resolve(dict: Dict, path: string): string | undefined {
  const value = path.split('.').reduce<Dict | string | undefined>((acc, key) => {
    if (acc && typeof acc === 'object') return acc[key];
    return undefined;
  }, dict);
  return typeof value === 'string' ? value : undefined;
}

export function createI18n(dicts: Record<string, Dict>, locale: string) {
  return function t(key: string, vars?: Record<string, string | number>): string {
    const found = resolve(dicts[locale], key);
    let str = found ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replace(new RegExp(`{{${k}}}`, 'g'), String(v));
      }
    }
    return str;
  };
}
