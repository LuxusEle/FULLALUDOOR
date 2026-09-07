import { z } from 'zod';
import type { OpeningItem, ProjectMetadata } from './types';
import { TYPOLOGY_IDS } from './types';
import { requireSupabase } from './supabase';
import type { SupabaseUser } from './supabase';
import { ensureDeviceIdentity } from './device-access';

export const STORED_PROJECT_VERSION = 1;
const LOCAL_STORAGE_KEY = 'fullaludoor.stored-projects.v1';

export const finishSchema = z.enum(['natural', 'black', 'bronze', 'white']);
export const glassSchema = z.enum(['6mm-clear', '8mm-tinted', '10.38mm-laminated', '12mm-toughened', '24mm-dgu']);

const projectMetadataSchema = z.object({
  id: z.string().min(1),
  projectName: z.string().min(1),
  clientName: z.string(),
  projectNumber: z.string(),
  date: z.string(),
  currency: z.string(),
  taxRatePercent: z.number(),
  contractorName: z.string(),
});

const openingItemSchema = z.object({
  id: z.string().min(1),
  tag: z.string().min(1),
  name: z.string().min(1),
  system: z.enum(TYPOLOGY_IDS),
  width: z.number(),
  height: z.number(),
  quantity: z.number().min(1),
  finish: finishSchema,
  glass: glassSchema,
  location: z.string(),
  notes: z.string().optional(),
  hingeSide: z.enum(['left', 'right']).optional(),
  openingAngle: z.number().optional(),
});

const storedProjectSchema = z.object({
  version: z.literal(STORED_PROJECT_VERSION),
  savedAt: z.string(),
  project: projectMetadataSchema,
  openings: z.array(openingItemSchema),
});

export type StoredProject = z.infer<typeof storedProjectSchema>;

export interface StoredProjectRef {
  id: string;
  name: string;
  savedAt: string;
  kind: 'cloud' | 'local';
}

export interface SaveResult {
  ok: boolean;
  message: string;
  ref: StoredProjectRef | null;
}

export interface LoadResult {
  ok: boolean;
  message: string;
  doc: StoredProject | null;
}

function storageError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function serializeConfiguration(project: ProjectMetadata, openings: OpeningItem[]): string {
  return JSON.stringify({
    version: STORED_PROJECT_VERSION,
    savedAt: new Date().toISOString(),
    project,
    openings,
  });
}

function parseConfiguration(value: unknown): StoredProject | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed = storedProjectSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const FRIENDLY_RPC_MESSAGES: Array<[RegExp, string]> = [
  [/relation "door_projects" does not exist|relation "organizations" does not exist|42P01/i, 'Database schema is not provisioned. Run supabase/schema.sql in the Supabase SQL editor first.'],
  [/Could not find the function|PGRST202|function .* does not exist/i, 'Device approval is not provisioned. Run supabase/schema.sql in the Supabase SQL editor first.'],
  [/DEVICE_NOT_APPROVED/i, 'This device has not been approved. Ask an administrator to approve it.'],
  [/DEVICE_TOKEN_REQUIRED/i, 'This browser has no device identity. Sign out and sign in again.'],
  [/ACCOUNT_DISABLED/i, 'Your account has been disabled. Contact an administrator.'],
  [/UNAUTHENTICATED/i, 'Your session expired. Sign in again.'],
  [/MAX_APPROVED_DEVICES_REACHED/i, 'The maximum number of approved devices for this account has been reached.'],
  [/PROJECT_NOT_FOUND/i, 'The project could not be found on the server.'],
];

function resolveErrorMessage(error: unknown): string {
  const message = storageError(error, 'Cloud save failed.');
  for (const [pattern, friendly] of FRIENDLY_RPC_MESSAGES) {
    if (pattern.test(message)) return friendly;
  }
  return message;
}

function deviceToken(): string {
  return ensureDeviceIdentity().token;
}

function readLocalStore(): Array<{ ref: StoredProjectRef; doc: StoredProject }> {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      const checked = z
        .object({
          ref: z.object({
            id: z.string(),
            name: z.string(),
            savedAt: z.string(),
            kind: z.literal('local'),
          }),
          doc: storedProjectSchema,
        })
        .safeParse(entry);
      return checked.success ? [checked.data] : [];
    });
  } catch {
    return [];
  }
}

function writeLocalStore(entries: Array<{ ref: StoredProjectRef; doc: StoredProject }>): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(entries));
}

export function encodeStoredProject(project: ProjectMetadata, openings: OpeningItem[]): StoredProject {
  const doc: StoredProject = {
    version: STORED_PROJECT_VERSION,
    savedAt: new Date().toISOString(),
    project,
    openings,
  };
  const parsed = storedProjectSchema.safeParse(doc);
  if (!parsed.success) {
    throw new Error(`Cannot encode project for storage: ${parsed.error.message}`);
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Local (demo mode) persistence
// ---------------------------------------------------------------------------

export function listLocalProjects(): StoredProjectRef[] {
  return readLocalStore().map((entry) => entry.ref);
}

export function loadLocalProject(id: string): StoredProject | null {
  const entry = readLocalStore().find((item) => item.ref.id === id);
  return entry?.doc ?? null;
}

export function deleteLocalProject(id: string): void {
  writeLocalStore(readLocalStore().filter((item) => item.ref.id !== id));
}

export function saveLocalProject(project: ProjectMetadata, openings: OpeningItem[]): SaveResult {
  const doc = encodeStoredProject(project, openings);
  const entries = readLocalStore();
  const index = entries.findIndex((item) => item.ref.id === doc.project.id);
  const ref: StoredProjectRef = {
    id: doc.project.id,
    name: doc.project.projectName,
    savedAt: doc.savedAt,
    kind: 'local',
  };
  if (index >= 0) {
    entries[index] = { ref, doc };
  } else {
    entries.push({ ref, doc });
  }
  writeLocalStore(entries);
  return { ok: true, message: 'Saved to this browser (demo mode).', ref };
}

// ---------------------------------------------------------------------------
// Cloud persistence (Supabase)
//
// All cloud operations go through SECURITY DEFINER RPCs that are enforced in
// PostgreSQL. Every RPC first requires the signed-in account to be active AND
// the presented browser device to have an admin-approved registration. A user
// cannot reach this data merely by knowing credentials on an unapproved
// device, and cannot bypass the check by editing client-side state.
// ---------------------------------------------------------------------------

export async function listCloudProjects(_user: SupabaseUser): Promise<StoredProjectRef[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('app_list_projects', {
    p_token: deviceToken(),
  });
  if (error) throw new Error(resolveErrorMessage(error));
  const rows = Array.isArray(data) ? data : [];
  return rows.flatMap((row: unknown) => {
    if (typeof row !== 'object' || row === null) return [];
    const record = row as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id : null;
    const name = typeof record.name === 'string' ? record.name : null;
    const updatedAt = typeof record.updated_at === 'string' ? record.updated_at : null;
    if (!id || !name || !updatedAt) return [];
    return [{ id, name, savedAt: updatedAt, kind: 'cloud' as const }];
  });
}

export async function loadCloudProject(rowId: string): Promise<StoredProject | null> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('app_load_project', {
    p_token: deviceToken(),
    p_project_id: rowId,
  });
  if (error) throw new Error(resolveErrorMessage(error));
  return parseConfiguration(data);
}

export async function saveCloudProject(
  _user: SupabaseUser,
  project: ProjectMetadata,
  openings: OpeningItem[],
  rowId?: string
): Promise<SaveResult> {
  const supabase = requireSupabase();
  try {
    const configuration = serializeConfiguration(project, openings);
    const { data, error } = await supabase.rpc('app_save_project', {
      p_token: deviceToken(),
      p_name: project.projectName,
      p_configuration: configuration,
      p_status: 'draft',
      p_row_id: rowId ?? null,
    });
    if (error) throw new Error(resolveErrorMessage(error));

    const record = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
    const savedId = typeof record.id === 'string' ? record.id : (rowId ?? project.id);
    const savedAt = typeof record.updated_at === 'string' ? record.updated_at : new Date().toISOString();
    return {
      ok: true,
      message: rowId ? 'Cloud project updated.' : 'Cloud project saved.',
      ref: { id: savedId, name: project.projectName, savedAt, kind: 'cloud' },
    };
  } catch (error) {
    return { ok: false, message: resolveErrorMessage(error), ref: null };
  }
}

export async function deleteCloudProject(rowId: string): Promise<SaveResult> {
  const supabase = requireSupabase();
  try {
    const { error } = await supabase.rpc('app_delete_project', {
      p_token: deviceToken(),
      p_project_id: rowId,
    });
    if (error) throw new Error(resolveErrorMessage(error));
    return { ok: true, message: 'Cloud project deleted.', ref: null };
  } catch (error) {
    return { ok: false, message: resolveErrorMessage(error), ref: null };
  }
}

// ---------------------------------------------------------------------------
// Unified load used by the UI regardless of demo/cloud mode
// ---------------------------------------------------------------------------

export async function loadProjectByRef(
  ref: StoredProjectRef,
  user: SupabaseUser | null
): Promise<LoadResult> {
  try {
    if (ref.kind === 'cloud') {
      if (!user) {
        return { ok: false, message: 'You must sign in to open cloud projects.', doc: null };
      }
      const doc = await loadCloudProject(ref.id);
      return doc
        ? { ok: true, message: 'Cloud project loaded.', doc }
        : { ok: false, message: 'Cloud project could not be read.', doc: null };
    }

    const doc = loadLocalProject(ref.id);
    return doc
      ? { ok: true, message: 'Local project loaded.', doc }
      : { ok: false, message: 'Local project could not be read.', doc: null };
  } catch (error) {
    return { ok: false, message: resolveErrorMessage(error), doc: null };
  }
}
