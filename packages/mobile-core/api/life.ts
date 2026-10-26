import { asNumber, asRecord, asString, asStrings, type Requester } from './request';

/** Sağlık (yaşam günlüğü): `GET /v1/life`, `GET /v1/life/month`, `POST /v1/life/sync`. */

export type LifeTable = { headers: string[]; rows: string[][] };
export type LifeGroup = { title: string | null; tables: LifeTable[]; lines: string[] };
export type LifeSection = { id: string; title: string; groups: LifeGroup[] };
export type LifeMeasurement = { date: string; weightKg: number | null; waistCm: number | null; note: string; estimated: boolean };

/** Antrenman (telefon/saat aktivite özeti). */
export type LifeExercise = {
  type: string;
  label: string;
  time: string | null;
  minutes: number | null;
  km: number | null;
  /** Hesaba giren kalori. */
  kcal: number | null;
  /** Saatin ham kalorisi; yalnız düzeltildiyse dolu. */
  watchKcal: number | null;
  steps: number | null;
  avgHr: number | null;
  maxHr: number | null;
};

/** Telefondan gelen alanlar; elle girilen günlerde null. */
type DeviceFields = {
  activeKcal: number | null;
  hrMin: number | null;
  hrAvg: number | null;
  /** Son eşitleme zamanı. */
  huaweiSync: string | null;
  exercises: LifeExercise[];
  /** Bazal (vücudun kendi yaktığı); sunucu son kilodan hesaplar. */
  restingKcal: number | null;
};

export type LifeSummary = DeviceFields & {
  intakeKcal: number | null;
  burnKcal: number | null;
  balanceKcal: number | null;
  proteinG: number | null;
  steps: number | null;
  trained: boolean | null;
};

export type LifePoint = LifeSummary & {
  date: string;
  /** Uyku (isteğe bağlı modül); eski sunucu göndermez. */
  sleepMin?: number | null;
  sleepBed?: string | null;
  sleepWake?: string | null;
};

export type LifeTargets = {
  intakeKcal: number;
  burnKcal: number;
  proteinG: number;
  steps: number;
  deficitMin: number;
  deficitMax: number;
  /** Bel hedefi (cm); eski sunucu göndermez. */
  waistCm?: number;
};

export type LifeMeal = { meal: string | null; name: string; amount: string; kcal: number | null; proteinG: number | null };

export type LifeDay = {
  date: string;
  label: string;
  exists: boolean;
  dates: string[];
  targets: LifeTargets;
  summary: LifeSummary | null;
  images: string[];
  sections: LifeSection[];
  measurements: LifeMeasurement[];
};

/** Kendini kalibre eden hesap: tartı eğilimi ile kayıtlı açık karşılaştırması; yalnız ölçüm. */
export type LifeCalibration = {
  status: 'collecting' | 'ready';
  weighIns: number;
  needWeighIns: number;
  spanDays: number;
  minSpanDays: number;
  expectedKg?: number;
  actualKg?: number;
  gapKcal?: number;
  intakeFactor?: number;
};

/** Sağlık tanışmasında seçilen hedef. Göndermeyen sunucuda null. */
export type LifeGoalKey = 'adim' | 'uyku' | 'kilo' | 'genel';
export type LifeGoal = { key: LifeGoalKey; label: string };

export type LifeMonth = {
  goal: LifeGoal | null;
  month: string;
  label: string;
  today: string;
  targets: LifeTargets;
  points: LifePoint[];
  recent: LifePoint[];
  week: LifePoint[];
  measurements: LifeMeasurement[];
  calibration: LifeCalibration | null;
};

/** Telefondan bir günün verisi (Health Connect / HealthKit). */
export type LifeSyncDay = {
  date: string;
  steps: number | null;
  activeKcal: number | null;
  heart: { min: number; avg: number; max: number } | null;
  activities: unknown[];
};

/** Sunucu hedef göndermezse kullanılan genel varsayılanlar. */
export const DEFAULT_TARGETS: LifeTargets = {
  intakeKcal: 1950,
  burnKcal: 2400,
  proteinG: 120,
  steps: 10000,
  deficitMin: -500,
  deficitMax: -400,
};

function parseGroups(value: unknown): LifeGroup[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = asRecord(item);
    if (!row) return [];
    const tables = Array.isArray(row.tables)
      ? row.tables.flatMap((table) => {
          const parsed = asRecord(table);
          if (!parsed) return [];
          const rows = Array.isArray(parsed.rows)
            ? parsed.rows.flatMap((line) => (Array.isArray(line) ? [line.map((cell) => String(cell ?? ''))] : []))
            : [];
          return [{ headers: asStrings(parsed.headers), rows }];
        })
      : [];
    return [{ title: typeof row.title === 'string' ? row.title : null, tables, lines: asStrings(row.lines) }];
  });
}

function parseSections(value: unknown): LifeSection[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = asRecord(item);
    if (!row || typeof row.id !== 'string' || typeof row.title !== 'string') return [];
    return [{ id: row.id, title: row.title, groups: parseGroups(row.groups) }];
  });
}

export function parseMeasurements(value: unknown): LifeMeasurement[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = asRecord(item);
    if (!row || typeof row.date !== 'string') return [];
    return [{
      date: row.date,
      weightKg: asNumber(row.weightKg),
      waistCm: asNumber(row.waistCm),
      note: asString(row.note),
      estimated: row.estimated === true,
    }];
  });
}

export function parseExercises(value: unknown): LifeExercise[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = asRecord(item);
    if (!row) return [];
    return [{
      type: asString(row.type, 'WORKOUT'),
      label: asString(row.label, 'Antrenman'),
      time: typeof row.time === 'string' ? row.time : null,
      minutes: asNumber(row.minutes),
      km: asNumber(row.km),
      kcal: asNumber(row.kcal),
      watchKcal: asNumber(row.watchKcal),
      steps: asNumber(row.steps),
      avgHr: asNumber(row.avgHr),
      maxHr: asNumber(row.maxHr),
    }];
  });
}

export function parseSummary(value: unknown): LifeSummary | null {
  const row = asRecord(value);
  if (!row) return null;
  return {
    intakeKcal: asNumber(row.intakeKcal),
    burnKcal: asNumber(row.burnKcal),
    balanceKcal: asNumber(row.balanceKcal),
    proteinG: asNumber(row.proteinG),
    steps: asNumber(row.steps),
    trained: typeof row.trained === 'boolean' ? row.trained : null,
    activeKcal: asNumber(row.activeKcal),
    hrMin: asNumber(row.hrMin),
    hrAvg: asNumber(row.hrAvg),
    huaweiSync: typeof row.huaweiSync === 'string' && row.huaweiSync ? row.huaweiSync : null,
    exercises: parseExercises(row.exercises),
    restingKcal: asNumber(row.restingKcal),
  };
}

export function parsePoint(value: unknown): LifePoint | null {
  const row = asRecord(value);
  const summary = parseSummary(row);
  if (!row || !summary || typeof row.date !== 'string') return null;
  return {
    date: row.date,
    ...summary,
    ...('sleepMin' in row ? { sleepMin: asNumber(row.sleepMin) } : {}),
    ...('sleepBed' in row ? { sleepBed: typeof row.sleepBed === 'string' ? row.sleepBed : null } : {}),
    ...('sleepWake' in row ? { sleepWake: typeof row.sleepWake === 'string' ? row.sleepWake : null } : {}),
  };
}

function parsePoints(value: unknown) {
  return Array.isArray(value) ? value.flatMap((item) => {
    const point = parsePoint(item);
    return point ? [point] : [];
  }) : [];
}

export function parseTargets(value: unknown, fallback: LifeTargets = DEFAULT_TARGETS): LifeTargets {
  const row = asRecord(value);
  if (!row) return fallback;
  const waist = asNumber(row.waistCm);
  return {
    intakeKcal: asNumber(row.intakeKcal) ?? fallback.intakeKcal,
    burnKcal: asNumber(row.burnKcal) ?? fallback.burnKcal,
    proteinG: asNumber(row.proteinG) ?? fallback.proteinG,
    steps: asNumber(row.steps) ?? fallback.steps,
    deficitMin: asNumber(row.deficitMin) ?? fallback.deficitMin,
    deficitMax: asNumber(row.deficitMax) ?? fallback.deficitMax,
    ...(waist != null ? { waistCm: waist } : {}),
  };
}

function parseGoal(value: unknown): LifeGoal | null {
  const row = asRecord(value);
  if (!row || !['adim', 'uyku', 'kilo', 'genel'].includes(row.key as string)) return null;
  return { key: row.key as LifeGoalKey, label: asString(row.label) };
}

export function parseLifeDay(body: Record<string, unknown>, fallback?: LifeTargets): LifeDay {
  const exists = body.exists === true;
  return {
    date: asString(body.date),
    label: asString(body.label),
    exists,
    dates: asStrings(body.dates),
    targets: parseTargets(body.targets, fallback),
    summary: exists ? parseSummary(body.summary) : null,
    images: asStrings(body.images),
    sections: parseSections(body.sections),
    measurements: parseMeasurements(body.measurements),
  };
}

export function parseLifeMonth(body: Record<string, unknown>, fallback?: LifeTargets): LifeMonth {
  const calibration = asRecord(body.calibration);
  return {
    goal: parseGoal(body.goal),
    month: asString(body.month),
    label: asString(body.label),
    today: asString(body.today),
    targets: parseTargets(body.targets, fallback),
    points: parsePoints(body.points),
    recent: parsePoints(body.recent),
    week: parsePoints(body.week),
    measurements: parseMeasurements(body.measurements),
    calibration: calibration && typeof calibration.status === 'string' ? (calibration as LifeCalibration) : null,
  };
}

export function createLifeApi(request: Requester, fallbackTargets?: LifeTargets) {
  return {
    /** Bir gün (varsayılan bugün). `date`: YYYY-MM-DD. */
    day: async (date?: string) =>
      parseLifeDay(await request(`/v1/life${date ? `?date=${encodeURIComponent(date)}` : ''}`), fallbackTargets),
    /** Bir ay (varsayılan bu ay). `month`: YYYY-MM. */
    month: async (month?: string) =>
      parseLifeMonth(await request(`/v1/life/month${month ? `?month=${encodeURIComponent(month)}` : ''}`), fallbackTargets),
    /** Telefondan günlük veri. `changed`: sunucuda bir şey değişti mi. */
    sync: async (day: LifeSyncDay) => {
      const body = await request('/v1/life/sync', { body: day });
      return { changed: body.changed === true };
    },
    /** Gün görseli; isteğe `authorization` başlığı eklenmeli. */
    mediaUrl: (file: string) => request.url(`/v1/life/media/${encodeURIComponent(file)}`),
  };
}

export type LifeApi = ReturnType<typeof createLifeApi>;
