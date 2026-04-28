/**
 * Conversation persistence: each chat about a medical report is stored as a
 * `Conversation` in AsyncStorage. We keep two kinds of records:
 *
 *   - `conversations:index` — a list of {id, title, updatedAt, ...} entries,
 *     sorted newest-first, used to render the landing screen quickly without
 *     having to deserialize every full conversation.
 *   - `conversation:<id>`   — the full Conversation JSON (image URI, OCR text,
 *     summary, full message history).
 *
 * Splitting the index from the bodies keeps the list view fast even after the
 * user accumulates many long chats.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ReportSummary } from '@/lib/gemini';

const INDEX_KEY = 'conversations:index';
const CONVERSATION_PREFIX = 'conversation:';

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  reportImageUri?: string;
  reportText: string;
  summary: ReportSummary;
  messages: ChatMessage[];
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  preview?: string;
}

function conversationKey(id: string): string {
  return `${CONVERSATION_PREFIX}${id}`;
}

function makeId(): string {
  // Sufficient uniqueness for a single-user device app; not a security boundary.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Build a short, human-readable title from the summary or fall back to a date. */
export function deriveTitle(summary: ReportSummary, createdAt: number): string {
  const overview = summary.overview?.trim();
  if (overview) {
    const firstSentence = overview.split(/(?<=[.!?])\s/)[0] ?? overview;
    if (firstSentence.length <= 60) return firstSentence;
    return `${firstSentence.slice(0, 57).trimEnd()}…`;
  }
  const firstResult = summary.keyResults[0]?.test;
  if (firstResult) return `${firstResult} report`;
  return `Report from ${new Date(createdAt).toLocaleDateString()}`;
}

async function readIndex(): Promise<ConversationSummary[]> {
  const raw = await AsyncStorage.getItem(INDEX_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e: any): e is ConversationSummary =>
        e &&
        typeof e.id === 'string' &&
        typeof e.title === 'string' &&
        typeof e.createdAt === 'number' &&
        typeof e.updatedAt === 'number'
    );
  } catch {
    return [];
  }
}

async function writeIndex(entries: ConversationSummary[]): Promise<void> {
  const sorted = [...entries].sort((a, b) => b.updatedAt - a.updatedAt);
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(sorted));
}

function toIndexEntry(c: Conversation): ConversationSummary {
  const lastMessage = c.messages[c.messages.length - 1];
  return {
    id: c.id,
    title: c.title,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    messageCount: c.messages.length,
    preview: lastMessage?.content.slice(0, 100) ?? c.summary.overview?.slice(0, 100),
  };
}

export async function listConversations(): Promise<ConversationSummary[]> {
  return readIndex();
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const raw = await AsyncStorage.getItem(conversationKey(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Conversation;
  } catch {
    return null;
  }
}

export interface CreateConversationArgs {
  reportText: string;
  reportImageUri?: string;
  summary: ReportSummary;
}

export async function createConversation(
  args: CreateConversationArgs
): Promise<Conversation> {
  const now = Date.now();
  const conversation: Conversation = {
    id: makeId(),
    title: deriveTitle(args.summary, now),
    createdAt: now,
    updatedAt: now,
    reportImageUri: args.reportImageUri,
    reportText: args.reportText,
    summary: args.summary,
    messages: [],
  };

  await AsyncStorage.setItem(
    conversationKey(conversation.id),
    JSON.stringify(conversation)
  );
  const index = await readIndex();
  await writeIndex([toIndexEntry(conversation), ...index]);

  return conversation;
}

export async function appendMessage(
  id: string,
  message: Omit<ChatMessage, 'id' | 'createdAt'> & { id?: string; createdAt?: number }
): Promise<Conversation | null> {
  const conv = await getConversation(id);
  if (!conv) return null;

  const full: ChatMessage = {
    id: message.id ?? makeId(),
    role: message.role,
    content: message.content,
    createdAt: message.createdAt ?? Date.now(),
  };

  conv.messages.push(full);
  conv.updatedAt = full.createdAt;

  await AsyncStorage.setItem(conversationKey(id), JSON.stringify(conv));
  const index = await readIndex();
  const next = index.filter((e) => e.id !== id);
  next.unshift(toIndexEntry(conv));
  await writeIndex(next);

  return conv;
}

export async function renameConversation(id: string, title: string): Promise<void> {
  const conv = await getConversation(id);
  if (!conv) return;
  const trimmed = title.trim();
  if (!trimmed) return;
  conv.title = trimmed;
  conv.updatedAt = Date.now();
  await AsyncStorage.setItem(conversationKey(id), JSON.stringify(conv));
  const index = await readIndex();
  const next = index.map((e) =>
    e.id === id ? { ...e, title: trimmed, updatedAt: conv.updatedAt } : e
  );
  await writeIndex(next);
}

export async function deleteConversation(id: string): Promise<void> {
  await AsyncStorage.removeItem(conversationKey(id));
  const index = await readIndex();
  await writeIndex(index.filter((e) => e.id !== id));
}

export async function clearAllConversations(): Promise<void> {
  const index = await readIndex();
  await Promise.all(
    index.map((e) => AsyncStorage.removeItem(conversationKey(e.id)))
  );
  await AsyncStorage.removeItem(INDEX_KEY);
}
