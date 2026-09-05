export type EmployeeTaskStatus = "todo" | "doing" | "done";
export type EmployeeTaskPriority = "low" | "medium" | "high" | "urgent";

export type EmployeeTask = {
  id: string;
  projectId?: string | null;
  title: string;
  description: string;
  assignee: string;
  status: EmployeeTaskStatus;
  priority: EmployeeTaskPriority;
  dueAt: string | null;
  source: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type EmployeeShift = {
  id: string;
  projectId?: string | null;
  employeeName: string;
  date: string;
  startTime: string;
  endTime: string;
  role: string;
  notes: string;
  status: "planned" | "confirmed" | "completed";
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type EmployeeQualityNote = {
  id: string;
  employeeName: string;
  category: string;
  score: number | null;
  note: string;
  callReviewId: string | null;
  createdBy: string;
  createdByUserId: string;
  subjectUserId?: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type EmployeeCallReview = {
  id: string;
  employeeName: string;
  supervisorNotes: string;
  complianceReview: string;
  experienceReview: string;
  transcriptionModel: string | null;
  analysisModel: string;
  authorizationPolicyVersion: string;
  authorizedAt: string;
  createdBy: string;
  createdByUserId: string;
  subjectUserId?: string;
  createdAt: string;
};

export type MarketingEngagement = {
  id: string;
  clientName: string;
  projectName: string;
  serviceType: string;
  contractReference: string;
  contractStatus: "draft" | "agreed" | "active" | "completed";
  status: "lead" | "proposal" | "contracted" | "executing" | "completed";
  value: number | null;
  currency: string;
  startDate: string;
  endDate: string;
  objective: string;
  plan: string;
  deliverables: string;
  createdBy: string;
  createdByUserId: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type CallCenterIndustry = "general" | "restaurant" | "technology" | "banking" | "government";

export type CallCenterRoutingKind = "queue" | "skill";

export type CallCenterForecastMapping = {
  routingKind: CallCenterRoutingKind;
  identifiers: string[];
};

export type CallCenterProject = {
  id: string;
  name: string;
  clientName: string;
  industry: CallCenterIndustry;
  channels: Array<"voice" | "email" | "chat" | "whatsapp">;
  serviceLevelSeconds: number;
  targetAnswerRate: number;
  operatingHours: string;
  status: "design" | "pilot" | "active" | "paused";
  /** Stable account identifiers used for authorization. Absent only on legacy records. */
  assignedUserIds?: string[];
  /** Display usernames retained for the UI and legacy-record compatibility only. */
  assignedEmployees?: string[];
  enabledToolIds?: string[];
  /** Exact Queue or Skill identifiers used only for source-backed Avaya forecast filtering. */
  avayaForecastMapping?: CallCenterForecastMapping;
  notes: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type EmployeeWorkspaceSnapshot = {
  tasks: EmployeeTask[];
  shifts: EmployeeShift[];
  qualityNotes: EmployeeQualityNote[];
  callReviews: EmployeeCallReview[];
  marketingEngagements: MarketingEngagement[];
  callCenterProjects: CallCenterProject[];
  generatedAt: string;
};

export type EmployeeWorkspaceResource = "tasks" | "shifts" | "qualityNotes" | "callReviews" | "marketingEngagements" | "callCenterProjects";
