/**
 * Yetenek (capability) kaydı: hangi modüller hangi koşulda görünür.
 * Ürün-agnostik — somut modül listesi (hangi modüller var, başlıkları) çağıran
 * uygulamada tanımlanır, bu paket yalnız tip ve görünürlük kuralını sağlar.
 */
export type ModuleDef<Key extends string = string, CloudModule extends string = string> = {
  key: Key;
  tab: { name: string; title: string; icon: { active: string; idle: string } };
  core?: boolean;
  personalOnly?: boolean;
  cloudModule?: CloudModule;
};

/**
 * `core` olanlar kapatılamaz. `personalOnly` olanlar yalnız kişisel varyantta görünür.
 * `cloudModule` dolu olanlar cloud'da yalnız o modül sunucuda açıksa görünür;
 * kişisel varyantta cloud-gated modüller de her zaman açıktır.
 */
export function moduleVisible<T extends ModuleDef>(
  def: T,
  isCloud: boolean,
  cloudModules: Record<string, boolean> | undefined
): boolean {
  if (def.core) return true;
  if (def.personalOnly) return !isCloud;
  if (!isCloud) return true;
  if (def.cloudModule) return Boolean(cloudModules?.[def.cloudModule]);
  return true;
}

export function moduleByKey<T extends ModuleDef>(registry: readonly T[], key: T['key']): T {
  const def = registry.find((m) => m.key === key);
  if (!def) throw new Error(`modül bulunamadı: ${key}`);
  return def;
}
