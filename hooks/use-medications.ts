import { useCallback, useEffect, useState } from 'react';

import {
  addMedication as addMedicationStorage,
  archiveMedication as archiveStorage,
  deleteMedication as deleteStorage,
  listMedications,
  recordDose as recordDoseStorage,
  undoLastDose as undoLastDoseStorage,
  type TrackedMedication,
} from '@/lib/medications';
import type { Medication } from '@/lib/gemini';

export interface UseMedications {
  medications: TrackedMedication[];
  isLoading: boolean;
  reload: () => Promise<void>;
  add: (medication: Medication, conversationId?: string) => Promise<TrackedMedication>;
  recordDose: (id: string) => Promise<void>;
  undoDose: (id: string) => Promise<void>;
  archive: (id: string, archived?: boolean) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function useMedications(): UseMedications {
  const [medications, setMedications] = useState<TrackedMedication[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    setIsLoading(true);
    try {
      setMedications(await listMedications());
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const add = useCallback(
    async (medication: Medication, conversationId?: string) => {
      const tracked = await addMedicationStorage({ medication, conversationId });
      setMedications((prev) => [tracked, ...prev]);
      return tracked;
    },
    []
  );

  const recordDose = useCallback(async (id: string) => {
    const updated = await recordDoseStorage(id);
    if (updated) {
      setMedications((prev) => prev.map((m) => (m.id === id ? updated : m)));
    }
  }, []);

  const undoDose = useCallback(async (id: string) => {
    const updated = await undoLastDoseStorage(id);
    if (updated) {
      setMedications((prev) => prev.map((m) => (m.id === id ? updated : m)));
    }
  }, []);

  const archive = useCallback(async (id: string, archived = true) => {
    await archiveStorage(id, archived);
    setMedications((prev) =>
      prev.map((m) => (m.id === id ? { ...m, archived } : m))
    );
  }, []);

  const remove = useCallback(async (id: string) => {
    await deleteStorage(id);
    setMedications((prev) => prev.filter((m) => m.id !== id));
  }, []);

  return { medications, isLoading, reload, add, recordDose, undoDose, archive, remove };
}
