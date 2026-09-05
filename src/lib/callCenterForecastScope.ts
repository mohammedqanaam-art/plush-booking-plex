import type {
  CallCenterForecastMapping,
  CallCenterProject,
  CallCenterRoutingKind,
} from "./employeeWorkspaceTypes";
import type {
  CallCenterForecastReport,
  CallCenterReportRoutingScope,
} from "./callCenterForecast";

export type CallCenterForecastScopeRequest =
  | { kind: "overall" }
  | { kind: "project"; projectId: string }
  | { kind: CallCenterRoutingKind; projectId: string; identifier: string };

export type CallCenterForecastScopeStatus =
  | "overall"
  | "matched"
  | "project-unmapped"
  | "selection-required"
  | "no-matched-data"
  | "invalid";

export type CallCenterForecastScopeOption = {
  key: string;
  kind: "overall" | "project" | CallCenterRoutingKind;
  label: string;
  projectId?: string;
  routingIdentifier?: string;
};
export type CallCenterForecastScopeMetadata = {
  request: CallCenterForecastScopeRequest;
  status: CallCenterForecastScopeStatus;
  label: string;
  matchedReports: number;
  availableReports: number;
  message: string;
  options: CallCenterForecastScopeOption[];
};

export type CallCenterForecastScopeResolution = {
  reports: CallCenterForecastReport[];
  metadata: CallCenterForecastScopeMetadata;
};

const ROUTING_IDENTIFIER = /^[a-z0-9][a-z0-9._:@/-]{0,79}$/;

/**
 * Avaya routing identifiers are machine identifiers, not display labels. The
 * canonical form is intentionally narrow so matching is deterministic and the
 * value is safe to echo in the authenticated admin UI.
 */
export const normalizeAvayaRoutingIdentifier = (value: unknown) => {
  const identifier = String(value ?? "").normalize("NFKC").trim().toLocaleLowerCase("en");
  return ROUTING_IDENTIFIER.test(identifier) ? identifier : "";
};

export const normalizeCallCenterForecastMapping = (
  value: CallCenterForecastMapping | null | undefined,
): CallCenterForecastMapping | null => {
  if (!value || (value.routingKind !== "queue" && value.routingKind !== "skill")) return null;
  const identifiers = [...new Set((Array.isArray(value.identifiers) ? value.identifiers : [])
    .map(normalizeAvayaRoutingIdentifier)
    .filter(Boolean))]
    .slice(0, 32);
  return identifiers.length ? { routingKind: value.routingKind, identifiers } : null;
};

const validatedReportRoutingScope = (
  value: CallCenterReportRoutingScope | null | undefined,
): Pick<CallCenterReportRoutingScope, "kind" | "identifier"> | null => {
  if (!value || value.provenance !== "avaya-report") return null;
  if (value.kind !== "queue" && value.kind !== "skill") return null;
  const identifier = normalizeAvayaRoutingIdentifier(value.identifier);
  return identifier ? { kind: value.kind, identifier } : null;
};

const scopeOptions = (projects: CallCenterProject[]): CallCenterForecastScopeOption[] => [
  { key: "overall", kind: "overall", label: "الإجمالي — التقرير غير المقسّم" },
  ...projects.flatMap((project): CallCenterForecastScopeOption[] => {
    const mapping = normalizeCallCenterForecastMapping(project.avayaForecastMapping);
    const projectOption: CallCenterForecastScopeOption = {
      key: `project:${project.id}`,
      kind: "project",
      label: mapping
        ? `المشروع: ${project.name}`
        : `المشروع: ${project.name} — بلا ربط Avaya`,
      projectId: project.id,
    };
    if (!mapping) return [projectOption];
    const routingLabel = mapping.routingKind === "queue" ? "Queue" : "Skill";
    return [
      projectOption,
      ...mapping.identifiers.map((identifier): CallCenterForecastScopeOption => ({
        key: `${mapping.routingKind}:${project.id}:${encodeURIComponent(identifier)}`,
        kind: mapping.routingKind,
        label: `${project.name} · ${routingLabel} ${identifier}`,
        projectId: project.id,
        routingIdentifier: identifier,
      })),
    ];
  }),
];

const metadata = (
  request: CallCenterForecastScopeRequest,
  status: CallCenterForecastScopeStatus,
  label: string,
  reports: CallCenterForecastReport[],
  allReports: CallCenterForecastReport[],
  projects: CallCenterProject[],
  message: string,
): CallCenterForecastScopeResolution => ({
  reports,
  metadata: {
    request,
    status,
    label,
    matchedReports: reports.length,
    availableReports: allReports.length,
    message,
    options: scopeOptions(projects),
  },
});

export const resolveCallCenterForecastScope = (
  reports: CallCenterForecastReport[],
  projects: CallCenterProject[],
  request: CallCenterForecastScopeRequest,
): CallCenterForecastScopeResolution => {
  if (request.kind === "overall") {
    // Once routed feeds exist, mixing them into an already aggregated report
    // would double count calls. Only genuinely unscoped reports belong here.
    const unscoped = reports.filter((report) => report.routingScope === undefined || report.routingScope === null);
    return metadata(
      request,
      "overall",
      "الإجمالي — التقرير غير المقسّم",
      unscoped,
      reports,
      projects,
      "يعرض تقارير Avaya الإجمالية غير الموسومة فقط؛ ولا يخلط تقارير Queue أو Skill معها.",
    );
  }

  const project = projects.find((candidate) => candidate.id === request.projectId);
  if (!project) {
    return metadata(request, "invalid", "نطاق غير صالح", [], reports, projects, "المشروع المطلوب غير موجود.");
  }

  const mapping = normalizeCallCenterForecastMapping(project.avayaForecastMapping);
  if (!mapping) {
    return metadata(
      request,
      "project-unmapped",
      project.name,
      [],
      reports,
      projects,
      "لا توجد هوية Queue أو Skill معتمدة لهذا المشروع؛ لم تُنسب إليه أي بيانات.",
    );
  }

  let identifier = "";
  if (request.kind === "project") {
    if (mapping.identifiers.length !== 1) {
      return metadata(
        request,
        "selection-required",
        project.name,
        [],
        reports,
        projects,
        "للمشروع أكثر من هوية توجيه؛ اختر Queue أو Skill محددًا لتجنب جمع نطاقات قد تتداخل.",
      );
    }
    [identifier] = mapping.identifiers;
  } else {
    identifier = normalizeAvayaRoutingIdentifier(request.identifier);
    if (request.kind !== mapping.routingKind || !identifier || !mapping.identifiers.includes(identifier)) {
      return metadata(
        request,
        "invalid",
        project.name,
        [],
        reports,
        projects,
        "هوية التوجيه المطلوبة ليست ضمن الربط المعتمد لهذا المشروع.",
      );
    }
  }

  const matched = reports.filter((report) => {
    const reportScope = validatedReportRoutingScope(report.routingScope);
    return reportScope?.kind === mapping.routingKind && reportScope.identifier === identifier;
  });
  const routingLabel = mapping.routingKind === "queue" ? "Queue" : "Skill";
  const label = `${project.name} · ${routingLabel} ${identifier}`;
  return metadata(
    request,
    matched.length ? "matched" : "no-matched-data",
    label,
    matched,
    reports,
    projects,
    matched.length
      ? `استُخدمت فقط التقارير الموسومة من مصدر Avaya بهوية ${routingLabel} المطابقة.`
      : `لا توجد تقارير Avaya موسومة بهوية ${routingLabel} المطابقة؛ لم تُستخدم التقارير الإجمالية كبديل.`,
  );
};
