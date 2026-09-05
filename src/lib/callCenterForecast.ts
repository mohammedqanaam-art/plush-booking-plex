import type { CallCenterRoutingKind } from "./employeeWorkspaceTypes";

export type CallCenterReportRoutingScope = {
  kind: CallCenterRoutingKind;
  identifier: string;
  provenance: "avaya-report";
};

export type CallCenterForecastEmployee = {
  answeredCalls: number;
  missedCalls: number;
  avgRingingSeconds: number;
  loggedInDurationSeconds: number;
  dndDurationSeconds: number;
  disconnectedDurationSeconds?: number;
  reconnectionCount?: number;
  hasInbound?: boolean;
  hasDnd?: boolean;
  hasTimecard?: boolean;
};

export type CallCenterForecastReport = {
  reportId?: string;
  from: string;
  to: string;
  syncedAt: string;
  employees: CallCenterForecastEmployee[];
  /**
   * Present only when the source report itself is scoped to one Avaya Queue or
   * Skill. Employee assignment is deliberately never used as a substitute.
   */
  routingScope?: CallCenterReportRoutingScope;
};

export type CallCenterDailyMetric = {
  date: string;
  answered: number;
  missedProxy: number;
  offered: number;
  missedProxyRate: number;
  loggedHours: number;
  callsPerLoggedHour: number;
  dndHours: number;
  dndShare: number;
  averageRingingSeconds: number;
  disconnectedMinutes: number;
  reconnections: number;
  sourceCoverage: number;
};

export type CallCenterForecastPoint = {
  date: string;
  predictedOffered: number;
  lowerOffered: number;
  upperOffered: number;
  predictedMissedProxyRate: number;
};

export type CallCenterForecastDriver = {
  id: "volume" | "coverage" | "dnd" | "ringing" | "connectivity" | "data-quality" | "no-signal";
  direction: "up" | "down" | "uncertain";
  severity: "info" | "warning" | "critical";
  title: string;
  explanation: string;
  evidence: string;
};

export type CallCenterForecastResult = {
  status: "ready" | "insufficient";
  confidence: "low" | "medium" | "high";
  sampleDays: number;
  requiredDays: number;
  excludedReports: number;
  generatedAt: string;
  latest: CallCenterDailyMetric | null;
  observed: CallCenterDailyMetric[];
  forecast: CallCenterForecastPoint[];
  drivers: CallCenterForecastDriver[];
  definitions: {
    offered: string;
    missedProxy: string;
    prediction: string;
  };
};

const DAY_MS = 86_400_000;
const REQUIRED_DAYS = 7;
const round = (value: number, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((Number.isFinite(value) ? value : 0) * factor) / factor;
};
const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const deviation = (values: number[]) => {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
};
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
const isoDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));

const linearSlope = (values: number[]) => {
  if (values.length < 2) return 0;
  const xMean = (values.length - 1) / 2;
  const yMean = mean(values);
  let numerator = 0;
  let denominator = 0;
  values.forEach((value, index) => {
    numerator += (index - xMean) * (value - yMean);
    denominator += (index - xMean) ** 2;
  });
  return denominator ? numerator / denominator : 0;
};

const aggregateReport = (report: CallCenterForecastReport): CallCenterDailyMetric => {
  const employees = Array.isArray(report.employees) ? report.employees : [];
  let answered = 0;
  let missedProxy = 0;
  let loggedSeconds = 0;
  let dndSeconds = 0;
  let ringWeight = 0;
  let ringSeconds = 0;
  let disconnectedSeconds = 0;
  let reconnections = 0;
  let complete = 0;
  employees.forEach((employee) => {
    const employeeAnswered = Math.max(0, Number(employee.answeredCalls || 0));
    const employeeMissed = Math.max(0, Number(employee.missedCalls || 0));
    const offered = employeeAnswered + employeeMissed;
    answered += employeeAnswered;
    missedProxy += employeeMissed;
    loggedSeconds += Math.max(0, Number(employee.loggedInDurationSeconds || 0));
    dndSeconds += Math.max(0, Number(employee.dndDurationSeconds || 0));
    ringSeconds += Math.max(0, Number(employee.avgRingingSeconds || 0)) * offered;
    ringWeight += offered;
    disconnectedSeconds += Math.max(0, Number(employee.disconnectedDurationSeconds || 0));
    reconnections += Math.max(0, Number(employee.reconnectionCount || 0));
    if (employee.hasInbound !== false && employee.hasDnd !== false && employee.hasTimecard !== false) complete += 1;
  });
  const offered = answered + missedProxy;
  const loggedHours = loggedSeconds / 3_600;
  return {
    date: report.from,
    answered: Math.round(answered),
    missedProxy: Math.round(missedProxy),
    offered: Math.round(offered),
    missedProxyRate: round(offered ? missedProxy / offered : 0, 4),
    loggedHours: round(loggedHours),
    callsPerLoggedHour: round(loggedHours ? offered / loggedHours : 0),
    dndHours: round(dndSeconds / 3_600),
    dndShare: round(loggedSeconds ? dndSeconds / loggedSeconds : 0, 4),
    averageRingingSeconds: round(ringWeight ? ringSeconds / ringWeight : 0),
    disconnectedMinutes: round(disconnectedSeconds / 60),
    reconnections: Math.round(reconnections),
    sourceCoverage: round(employees.length ? complete / employees.length : 0, 4),
  };
};

const percentChange = (current: number, baseline: number) => baseline > 0 ? (current - baseline) / baseline : 0;
const percentLabel = (value: number) => `${Math.abs(value * 100).toFixed(1)}%`;

const inferDrivers = (observed: CallCenterDailyMetric[]): CallCenterForecastDriver[] => {
  if (observed.length < 2) return [{
    id: "no-signal", direction: "uncertain", severity: "info",
    title: "لا توجد مقارنة تاريخية كافية",
    explanation: "يلزم أكثر من يوم لتفسير حركة مؤشر المكالمات الفائتة.",
    evidence: `الأيام المتاحة: ${observed.length}`,
  }];
  const latest = observed[observed.length - 1];
  const comparison = observed.slice(Math.max(0, observed.length - 15), -1);
  const baseline = {
    missedRate: mean(comparison.map((day) => day.missedProxyRate)),
    workload: mean(comparison.map((day) => day.callsPerLoggedHour)),
    loggedHours: mean(comparison.map((day) => day.loggedHours)),
    dndShare: mean(comparison.map((day) => day.dndShare)),
    ringing: mean(comparison.map((day) => day.averageRingingSeconds)),
    disconnected: mean(comparison.map((day) => day.disconnectedMinutes)),
    reconnections: mean(comparison.map((day) => day.reconnections)),
  };
  const drivers: CallCenterForecastDriver[] = [];
  const missedMovement = latest.missedProxyRate - baseline.missedRate;
  const workloadMovement = percentChange(latest.callsPerLoggedHour, baseline.workload);
  if (Math.abs(workloadMovement) >= 0.12) drivers.push({
    id: "volume", direction: workloadMovement > 0 ? "up" : "down", severity: workloadMovement > 0 && missedMovement > 0.02 ? "critical" : "warning",
    title: workloadMovement > 0 ? "ضغط مكالمات أعلى لكل ساعة عمل" : "ضغط مكالمات أقل لكل ساعة عمل",
    explanation: workloadMovement > 0
      ? "ارتفع عدد المكالمات المعروضة مقارنة بساعات تسجيل الموظفين، وهو عامل محتمل لارتفاع الفائت."
      : "انخفض ضغط المكالمات نسبة إلى ساعات التغطية، وهو عامل يساعد على تقليل الفائت.",
    evidence: `${latest.callsPerLoggedHour.toFixed(1)} مقابل ${baseline.workload.toFixed(1)} مكالمة لكل ساعة، تغير ${percentLabel(workloadMovement)}`,
  });
  const coverageMovement = percentChange(latest.loggedHours, baseline.loggedHours);
  if (coverageMovement <= -0.1) drivers.push({
    id: "coverage", direction: "up", severity: missedMovement > 0.02 ? "critical" : "warning",
    title: "انخفاض ساعات التغطية",
    explanation: "ساعات تسجيل الدخول أقل من خط الأساس، وقد يرفع ذلك زمن الانتظار والمكالمات الفائتة.",
    evidence: `${latest.loggedHours.toFixed(1)} مقابل ${baseline.loggedHours.toFixed(1)} ساعة، انخفاض ${percentLabel(coverageMovement)}`,
  });
  const dndMovement = latest.dndShare - baseline.dndShare;
  if (dndMovement >= 0.02 && latest.dndShare >= baseline.dndShare * 1.2) drivers.push({
    id: "dnd", direction: "up", severity: dndMovement >= 0.05 ? "critical" : "warning",
    title: "ارتفاع وقت عدم الإزعاج",
    explanation: "ارتفعت حصة DND من وقت تسجيل الدخول؛ تحقق من أسباب الحالات وفترات الاستراحة والتوجيه.",
    evidence: `${(latest.dndShare * 100).toFixed(1)}% مقابل ${(baseline.dndShare * 100).toFixed(1)}% من وقت الدخول`,
  });
  const ringMovement = percentChange(latest.averageRingingSeconds, baseline.ringing);
  if (latest.averageRingingSeconds - baseline.ringing >= 2 && ringMovement >= 0.15) drivers.push({
    id: "ringing", direction: "up", severity: latest.averageRingingSeconds >= 12 ? "critical" : "warning",
    title: "زمن رنين أطول",
    explanation: "زمن الرنين الأطول يتزامن عادة مع تأخر الالتقاط أو ضعف التغطية، لكنه لا يثبت السبب وحده.",
    evidence: `${latest.averageRingingSeconds.toFixed(1)} مقابل ${baseline.ringing.toFixed(1)} ثانية`,
  });
  const disconnectionMovement = percentChange(latest.disconnectedMinutes, baseline.disconnected);
  const reconnectMovement = percentChange(latest.reconnections, baseline.reconnections);
  const disconnectedSignal = latest.disconnectedMinutes > baseline.disconnected + 10
    && (baseline.disconnected <= 0 || disconnectionMovement >= 0.25);
  const reconnectSignal = latest.reconnections > baseline.reconnections + 2
    && (baseline.reconnections <= 0 || reconnectMovement >= 0.25);
  if (disconnectedSignal || reconnectSignal) drivers.push({
    id: "connectivity", direction: "up", severity: "warning",
    title: "إشارة إلى عدم استقرار الاتصال",
    explanation: "ازدادت فواصل الجلسات أو إعادة الاتصال؛ راجع الشبكة والجهاز وسجلات Avaya قبل نسب الأثر إلى الموظف.",
    evidence: `${latest.disconnectedMinutes.toFixed(1)} دقيقة فصل و${latest.reconnections} إعادة اتصال`,
  });
  if (latest.sourceCoverage < 0.95) drivers.push({
    id: "data-quality", direction: "uncertain", severity: latest.sourceCoverage < 0.75 ? "critical" : "warning",
    title: "تغطية بيانات غير مكتملة",
    explanation: "بعض الموظفين لا يملكون المصادر الثلاثة؛ التوقع والتفسير أقل موثوقية حتى اكتمال البيانات.",
    evidence: `اكتمال المصادر ${(latest.sourceCoverage * 100).toFixed(1)}%`,
  });
  if (!drivers.length) drivers.push({
    id: "no-signal", direction: Math.abs(missedMovement) < 0.01 ? "uncertain" : missedMovement > 0 ? "up" : "down", severity: "info",
    title: "لا توجد إشارة تشغيلية حاسمة",
    explanation: "لم تتجاوز مؤشرات الضغط والتغطية وDND والرنين والاتصال حدود التنبيه. الأسباب المعروضة احتمالات وليست إثباتًا سببيًا.",
    evidence: `مؤشر الفائت ${(latest.missedProxyRate * 100).toFixed(1)}% مقابل ${(baseline.missedRate * 100).toFixed(1)}%`,
  });
  return drivers.slice(0, 6);
};

const nextIsoDate = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

export function buildCallCenterForecast(
  reports: CallCenterForecastReport[],
  now = new Date(),
): CallCenterForecastResult {
  const daily = new Map<string, CallCenterForecastReport>();
  reports.forEach((report) => {
    if (!isoDay(report.from) || report.from !== report.to) return;
    const existing = daily.get(report.from);
    if (!existing || String(report.syncedAt).localeCompare(String(existing.syncedAt)) > 0) daily.set(report.from, report);
  });
  const observed = [...daily.values()]
    .sort((left, right) => left.from.localeCompare(right.from))
    .slice(-90)
    .map(aggregateReport);
  const common = {
    sampleDays: observed.length,
    requiredDays: REQUIRED_DAYS,
    excludedReports: Math.max(0, reports.length - daily.size),
    generatedAt: now.toISOString(),
    latest: observed.at(-1) || null,
    observed,
    drivers: inferDrivers(observed),
    definitions: {
      offered: "المعروض = المكالمات المجابة + المكالمات الفائتة في تقرير User Inbound.",
      missedProxy: "الفائت مؤشر تقريبي للدروب وليس Queue Abandonment رسميًا؛ يلزم Queue/ECHI/Analytics feed لقياس التخلي الحقيقي.",
      prediction: "توقع تشغيلي يدمج متوسط آخر 28 يومًا، نمط يوم الأسبوع، واتجاهًا محدودًا مع نطاق عدم يقين؛ ليس ضمانًا.",
    },
  };
  if (observed.length < REQUIRED_DAYS) return {
    ...common, status: "insufficient", confidence: "low", forecast: [],
  };

  const baseline = observed.slice(-28);
  const offeredValues = baseline.map((day) => day.offered);
  const missedRates = baseline.map((day) => day.missedProxyRate);
  const offeredMean = mean(offeredValues);
  const offeredSlope = clamp(linearSlope(offeredValues), -offeredMean * 0.03, offeredMean * 0.03);
  const missedSlope = clamp(linearSlope(missedRates), -0.005, 0.005);
  const spread = deviation(offeredValues);
  const latestDate = observed.at(-1)!.date;
  const forecast = Array.from({ length: 7 }, (_, index): CallCenterForecastPoint => {
    const date = nextIsoDate(latestDate, index + 1);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const weekdayDays = baseline.filter((day) => new Date(`${day.date}T00:00:00Z`).getUTCDay() === weekday);
    const weekdayOffered = weekdayDays.length >= 2 ? mean(weekdayDays.map((day) => day.offered)) : offeredMean;
    const weekdayRate = weekdayDays.length >= 2 ? mean(weekdayDays.map((day) => day.missedProxyRate)) : mean(missedRates);
    const predictedOffered = Math.max(0, Math.round(weekdayOffered + offeredSlope * (index + 1)));
    const uncertainty = Math.max(predictedOffered * 0.2, spread * 1.28, 1);
    return {
      date,
      predictedOffered,
      lowerOffered: Math.max(0, Math.round(predictedOffered - uncertainty)),
      upperOffered: Math.round(predictedOffered + uncertainty),
      predictedMissedProxyRate: round(clamp(weekdayRate + missedSlope * (index + 1), 0, 1), 4),
    };
  });
  return {
    ...common,
    status: "ready",
    confidence: observed.length >= 42 ? "high" : observed.length >= 21 ? "medium" : "low",
    forecast,
  };
}
