import type { LifeMeal, LifePoint, LifeTargets } from './api/life';

/** Sağlık hesapları (saf): yakım parçaları, öğün toplamı, açık ve hafta özeti. Metin üretmez. */

/** 1 kg yağ ≈ 7.700 kcal; adım başına ~0,0386 kcal (sunucuyla aynı katsayı). */
export const KCAL_PER_KG = 7700;
export const KCAL_PER_STEP = 0.0386;
/** Güvenli üst sınır: açık bunu geçmemeli. */
export const DEFICIT_CEILING = 1000;
const FALLBACK_RESTING = 1650;

export type BurnParts = { resting: number; move: number; sport: number; total: number };

/** Yakım = bazal + hareket (adım) + spor (antrenman kalorisi). Bazal bilinmiyorsa genel ortalama. */
export function burnParts(point: LifePoint | null): BurnParts | null {
  if (!point || point.burnKcal == null) return null;
  const resting = Math.min(point.restingKcal ?? FALLBACK_RESTING, point.burnKcal);
  const above = Math.max(0, point.burnKcal - resting);
  const workout = point.exercises.reduce((sum, item) => sum + (item.kcal ?? 0), 0);
  const sport = Math.min(Math.round(workout), above);
  return { resting, move: above - sport, sport, total: point.burnKcal };
}

export type MealSlot = 'sabah' | 'ogle' | 'ara' | 'aksam' | 'diger';
export type MealPart = { key: MealSlot; kcal: number };

const MEAL_ORDER: { key: MealSlot; test: RegExp }[] = [
  { key: 'sabah', test: /sabah|kahvalt|breakfast/i },
  { key: 'ogle', test: /öğle|ogle|öğlen|oglen|lunch/i },
  { key: 'ara', test: /ara|snack/i },
  { key: 'aksam', test: /akşam|aksam|dinner/i },
];
const SLOT_ORDER: MealSlot[] = ['sabah', 'ogle', 'ara', 'aksam', 'diger'];

/** Öğün kalemlerini öğüne göre toplar (sabah → öğle → ara → akşam → diğer). Etiket çağıranda. */
export function mealParts(meals: LifeMeal[] | undefined): MealPart[] {
  if (!meals?.length) return [];
  const totals = new Map<MealSlot, number>();
  for (const item of meals) {
    if (item.kcal == null) continue;
    const slot = MEAL_ORDER.find((meal) => meal.test.test(item.meal ?? ''))?.key ?? 'diger';
    totals.set(slot, (totals.get(slot) ?? 0) + item.kcal);
  }
  return SLOT_ORDER.filter((key) => totals.has(key)).map((key) => ({ key, kcal: Math.round(totals.get(key)!) }));
}

/** Açık (pozitif = yakılan > alınan). Alım ya da yakım yoksa null. */
export function deficitOf(point: LifePoint | null | undefined) {
  if (!point || point.intakeKcal == null || point.burnKcal == null) return null;
  return point.burnKcal - point.intakeKcal;
}

/** Hedef aralıkta mı: en az hedef açık, en çok güvenli tavan. */
export function deficitHit(deficit: number | null, targets: LifeTargets) {
  return deficit != null && deficit >= Math.abs(targets.deficitMax) && deficit <= DEFICIT_CEILING;
}

export type DeficitState = 'waiting' | 'tooLarge' | 'onTarget' | 'below' | 'surplus';

/** Günün açık durumu ve hedefe kalan (kcal + yaklaşık adım). Metni çağıran yazar. */
export function deficitState(deficit: number | null, targets: LifeTargets) {
  const goal = Math.abs(targets.deficitMax);
  if (deficit == null) return { state: 'waiting' as DeficitState, kcal: 0, steps: 0 };
  if (deficit > DEFICIT_CEILING) return { state: 'tooLarge' as DeficitState, kcal: deficit - DEFICIT_CEILING, steps: 0 };
  if (deficit >= goal) return { state: 'onTarget' as DeficitState, kcal: deficit, steps: 0 };
  const left = deficit >= 0 ? goal - deficit : -deficit;
  return {
    state: (deficit >= 0 ? 'below' : 'surplus') as DeficitState,
    kcal: left,
    steps: Math.round(left / KCAL_PER_STEP / 100) * 100,
  };
}

export type PeriodSummary = { days: number; deficit: number; average: number; hit: number; fatKg: number };

/** Yalnız alım ve yakımı olan günler. */
export function periodSummary(points: LifePoint[], targets: LifeTargets): PeriodSummary | null {
  const deficits = points.map(deficitOf).filter((value): value is number => value != null);
  if (!deficits.length) return null;
  const deficit = deficits.reduce((sum, value) => sum + value, 0);
  return {
    days: deficits.length,
    deficit: Math.round(deficit),
    average: Math.round(deficit / deficits.length),
    hit: deficits.filter((value) => deficitHit(value, targets)).length,
    fatKg: deficit / KCAL_PER_KG,
  };
}

export type WeekRecap = {
  start: string;
  end: string;
  days: { date: string; deficit: number | null; hit: boolean; trained: boolean }[];
  logged: number;
  deficit: number;
  fatG: number;
  monthlyKg: number;
  hit: number;
  avgIntake: number | null;
  avgBurn: number | null;
  avgProtein: number | null;
  proteinHit: number;
  steps: number;
  avgSteps: number | null;
  bestSteps: { date: string; steps: number } | null;
  workouts: number;
  workoutMinutes: number;
  workoutKcal: number;
  longest: { date: string; label: string; minutes: number } | null;
};

function average(values: (number | null | undefined)[]) {
  const list = values.filter((value): value is number => typeof value === 'number');
  return list.length ? Math.round(list.reduce((sum, value) => sum + value, 0) / list.length) : null;
}

/** Verilen günlerin (ör. Pazartesi–Pazar) özeti. Alım + yakım yazılmamış gün açığa girmez. */
export function weekRecap(dates: string[], byDate: Map<string, LifePoint>, targets: LifeTargets): WeekRecap | null {
  const points = dates.map((date) => byDate.get(date) ?? null);
  const days = dates.map((date, index) => {
    const point = points[index];
    const deficit = deficitOf(point);
    return { date, deficit, hit: deficitHit(deficit, targets), trained: Boolean(point?.exercises.length || point?.trained) };
  });
  const logged = days.filter((day) => day.deficit != null);
  if (!logged.length) return null;
  const deficit = Math.round(logged.reduce((sum, day) => sum + (day.deficit ?? 0), 0));
  const withIntake = points.filter((point): point is LifePoint => deficitOf(point) != null);
  const stepRows = points.filter((point): point is LifePoint => point?.steps != null);
  const best = stepRows.reduce<LifePoint | null>((top, point) => (!top || (point.steps ?? 0) > (top.steps ?? 0) ? point : top), null);
  const workouts = points.flatMap((point) => (point?.exercises ?? []).map((item) => ({ ...item, date: point!.date })));
  const longest = workouts.reduce<(typeof workouts)[number] | null>((top, item) => (!top || (item.minutes ?? 0) > (top.minutes ?? 0) ? item : top), null);
  return {
    start: dates[0],
    end: dates[dates.length - 1],
    days,
    logged: logged.length,
    deficit,
    fatG: Math.round((deficit / KCAL_PER_KG) * 1000),
    monthlyKg: Math.round(((deficit / logged.length) * 30 / KCAL_PER_KG) * 10) / 10,
    hit: days.filter((day) => day.hit).length,
    avgIntake: average(withIntake.map((point) => point.intakeKcal)),
    avgBurn: average(withIntake.map((point) => point.burnKcal)),
    avgProtein: average(withIntake.map((point) => point.proteinG)),
    proteinHit: withIntake.filter((point) => (point.proteinG ?? 0) >= targets.proteinG).length,
    steps: stepRows.reduce((sum, point) => sum + (point.steps ?? 0), 0),
    avgSteps: average(stepRows.map((point) => point.steps)),
    bestSteps: best?.steps != null ? { date: best.date, steps: best.steps } : null,
    workouts: days.filter((day) => day.trained).length,
    workoutMinutes: workouts.reduce((sum, item) => sum + (item.minutes ?? 0), 0),
    workoutKcal: workouts.reduce((sum, item) => sum + (item.kcal ?? 0), 0),
    longest: longest?.minutes ? { date: longest.date, label: longest.label, minutes: longest.minutes } : null,
  };
}

