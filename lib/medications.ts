/**
 * Tracked-medications storage. Stored as a single AsyncStorage key with the
 * full array — the list is bounded (a single user only takes so many things
 * at once) so we don't bother with the index/body split used for conversations.
 *
 * A tracked medication is the AI-suggested `Medication` plus a `doses` log
 * (timestamps of each dose the user has recorded). The "next dose" countdown
 * and "doses remaining" counter are derived in the UI from these fields —
 * we don't precompute them here so they stay correct as time passes.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Medication } from '@/lib/gemini';

const STORAGE_KEY = 'medications';

export interface DoseEntry {
  takenAt: number;
}

export interface TrackedMedication extends Medication {
  id: string;
  /** ID of the conversation this medication came from (for back-navigation). */
  conversationId?: string;
  createdAt: number;
  doses: DoseEntry[];
  archived?: boolean;
}

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function readAll(): Promise<TrackedMedication[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m: any): m is TrackedMedication =>
        m && typeof m.id === 'string' && typeof m.name === 'string'
    );
  } catch {
    return [];
  }
}

async function writeAll(meds: TrackedMedication[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(meds));
}

export async function listMedications(): Promise<TrackedMedication[]> {
  const all = await readAll();
  // Active first, then archived; within each group newest first.
  return [...all].sort((a, b) => {
    if (!!a.archived !== !!b.archived) return a.archived ? 1 : -1;
    return b.createdAt - a.createdAt;
  });
}

export interface AddMedicationArgs {
  medication: Medication;
  conversationId?: string;
}

export async function addMedication({
  medication,
  conversationId,
}: AddMedicationArgs): Promise<TrackedMedication> {
  const all = await readAll();
  const tracked: TrackedMedication = {
    ...medication,
    id: makeId(),
    conversationId,
    createdAt: Date.now(),
    doses: [],
  };
  await writeAll([tracked, ...all]);
  return tracked;
}

export async function recordDose(
  id: string,
  takenAt: number = Date.now()
): Promise<TrackedMedication | null> {
  const all = await readAll();
  const idx = all.findIndex((m) => m.id === id);
  if (idx === -1) return null;
  const updated: TrackedMedication = {
    ...all[idx],
    doses: [...all[idx].doses, { takenAt }],
  };
  all[idx] = updated;
  await writeAll(all);
  return updated;
}

export async function undoLastDose(id: string): Promise<TrackedMedication | null> {
  const all = await readAll();
  const idx = all.findIndex((m) => m.id === id);
  if (idx === -1 || all[idx].doses.length === 0) return null;
  const updated: TrackedMedication = {
    ...all[idx],
    doses: all[idx].doses.slice(0, -1),
  };
  all[idx] = updated;
  await writeAll(all);
  return updated;
}

export async function archiveMedication(id: string, archived = true): Promise<void> {
  const all = await readAll();
  const idx = all.findIndex((m) => m.id === id);
  if (idx === -1) return;
  all[idx] = { ...all[idx], archived };
  await writeAll(all);
}

export async function deleteMedication(id: string): Promise<void> {
  const all = await readAll();
  await writeAll(all.filter((m) => m.id !== id));
}

/* ---------------- Derived helpers (pure, used by UI) ---------------- */

export function dosesRemaining(med: TrackedMedication): number | null {
  if (typeof med.totalDoses !== 'number') return null;
  return Math.max(0, med.totalDoses - med.doses.length);
}

export function nextDoseAt(med: TrackedMedication): number | null {
  if (typeof med.intervalHours !== 'number' || med.doses.length === 0) return null;
  const last = med.doses[med.doses.length - 1].takenAt;
  return last + med.intervalHours * 3_600_000;
}

export function isCourseComplete(med: TrackedMedication): boolean {
  const remaining = dosesRemaining(med);
  return remaining !== null && remaining <= 0;
}

/** Format ms remaining as "2h 15m" / "5m" / "now" / "30s". */
export function formatRelativeTime(ms: number): string {
  if (ms <= 0) return 'now';
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${totalSec}s`;
}
