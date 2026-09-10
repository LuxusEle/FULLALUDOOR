'use client';

// Single persistence path for newly created projects, shared by the dashboard
// and the project list. Uses the existing storage layer only.

import type { SupabaseUser } from '../../lib/supabase';
import type { OpeningItem, ProjectMetadata } from '../../lib/types';
import { saveCloudProject, saveLocalProject, type StoredProjectRef } from '../../lib/project-storage';

export interface PersistResult {
  ok: boolean;
  ref: StoredProjectRef | null;
  message: string;
}

export async function persistNewProject(
  user: SupabaseUser | null,
  demoMode: boolean,
  project: ProjectMetadata,
  openings: OpeningItem[]
): Promise<PersistResult> {
  if (!demoMode && user) {
    const cloud = await saveCloudProject(user, project, openings);
    if (cloud.ok && cloud.ref) return { ok: true, ref: cloud.ref, message: cloud.message };
    const local = saveLocalProject(project, openings);
    return local.ok
      ? { ok: true, ref: local.ref, message: 'Cloud unavailable — saved in this browser.' }
      : { ok: false, ref: null, message: local.message };
  }
  const local = saveLocalProject(project, openings);
  return local.ok
    ? { ok: true, ref: local.ref, message: local.message }
    : { ok: false, ref: null, message: local.message };
}
