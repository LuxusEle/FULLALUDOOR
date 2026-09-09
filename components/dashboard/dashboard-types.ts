export type DashboardGo = 'studio' | 'schedule' | 'cad' | 'nesting' | 'quote' | 'audit';

export type ActivityKind =
  | 'created'
  | 'opened'
  | 'unit-added'
  | 'updated'
  | 'saved'
  | 'exported'
  | 'reviewed'
  | 'system';

/** A real action the user performed during this workspace session. */
export interface SessionActivity {
  id: string;
  kind: ActivityKind;
  title: string;
  projectName: string | null;
  detail?: string;
  ts: number;
}

export interface DashboardIssue {
  id: string;
  severity: 'info' | 'review' | 'warning' | 'critical';
  tag?: string;
  title: string;
  detail: string;
  source: string;
}
