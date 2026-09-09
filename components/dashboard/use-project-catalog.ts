'use client';

// Fetches the REAL saved-project catalog (cloud + this browser) and hydrates
// each document into a dashboard row. No placeholder rows are ever created.

import { useCallback, useEffect, useState } from 'react';
import { isDemoAuth, subscribeToAuth } from '../../lib/auth';
import type { SupabaseUser } from '../../lib/supabase';
import {
  listCloudProjects,
  listLocalProjects,
  loadProjectByRef,
  type StoredProjectRef,
} from '../../lib/project-storage';
import { toCatalogRecord, type CatalogRecord } from '../../lib/project-catalog';

export interface ProjectCatalogState {
  records: CatalogRecord[];
  loading: boolean;
  error: string | null;
  warnings: string[];
  user: SupabaseUser | null;
  demoMode: boolean;
  refresh: () => void;
}

export function useProjectCatalog(): ProjectCatalogState {
  const demoMode = isDemoAuth();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [records, setRecords] = useState<CatalogRecord[]>([]);
  const [loading, setLoading] = useState(demoMode);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);

  const refresh = useCallback(() => {
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    let active = true;

    async function hydrate(activeUser: SupabaseUser | null) {
      setLoading(true);
      setError(null);
      const nextWarnings: string[] = [];

      try {
        const localRefs = listLocalProjects();
        const cloudRefs =
          !demoMode && activeUser ? await listCloudProjects(activeUser) : [];

        // Cloud rows first (remote authority), then this-browser copies.
        const orderedRefs: StoredProjectRef[] = [...cloudRefs, ...localRefs];

        const hydrated = await Promise.all(
          orderedRefs.map(async (ref) => {
            const result = await loadProjectByRef(ref, activeUser);
            if (!result.ok || !result.doc) {
              if (ref.kind === 'cloud') {
                nextWarnings.push(`"${ref.name}" could not be read from the cloud.`);
              }
              return null;
            }
            return toCatalogRecord(result.doc, ref);
          })
        );

        if (!active) return;
        const rows = hydrated.filter((row): row is NonNullable<typeof row> => row !== null);
        rows.sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
        setRecords(rows);
        setWarnings(nextWarnings);
      } catch (caught) {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : 'Could not load the project catalog.');
      } finally {
        if (active) setLoading(false);
      }
    }

    if (demoMode) {
      void hydrate(null);
      return undefined;
    }

    return subscribeToAuth((next) => {
      setUser(next);
      void hydrate(next);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoMode, revision]);

  return { records, loading, error, warnings, user, demoMode, refresh };
}
