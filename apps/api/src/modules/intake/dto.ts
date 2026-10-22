import type { IntakeChannel, IssuePriority, TriageStatus } from "@prisma/client";

/** Body cua POST /intake/simulate (hop dong voi web - Agent C). */
export interface SimulateIntakeDto {
  workspaceId: string;
  channel: IntakeChannel | string;
  senderName?: string;
  title: string;
  content?: string;
  externalRef?: string;
}

/** Body cua POST /triage/:itemId/accept. */
export interface AcceptTriageDto {
  teamId: string;
  assigneeId?: string;
  priority?: IssuePriority | string;
}

/** Body cua POST /triage/:itemId/dismiss. */
export interface DismissTriageDto {
  reason?: string;
}

export const INTAKE_CHANNELS: readonly string[] = [
  "ZALO",
  "SLACK",
  "EMAIL",
  "GITHUB",
];

export const TRIAGE_STATUSES: readonly TriageStatus[] = [
  "NEW",
  "ACCEPTED",
  "DISMISSED",
  "MERGED",
];

export const ISSUE_PRIORITIES: readonly string[] = [
  "NONE",
  "LOW",
  "MEDIUM",
  "HIGH",
  "URGENT",
];
