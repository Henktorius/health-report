/**
 * Thin wrapper over the Google Gemini REST API for structured medical-report
 * summaries.
 *
 * Uses Gemini's structured-output mode (`responseMimeType: 'application/json'`
 * + `responseSchema`) so the model returns a strict JSON object instead of
 * free-form prose. The shape is parsed and normalized by `parseSummaryResponse`
 * below, which is exported separately so it can be unit-tested without making
 * a network call.
 *
 * Docs: https://ai.google.dev/gemini-api/docs/structured-output
 */

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

export type ResultStatus = 'normal' | 'high' | 'low' | 'borderline' | 'unknown';

const RESULT_STATUSES: readonly ResultStatus[] = [
  'normal',
  'high',
  'low',
  'borderline',
  'unknown',
];

export interface KeyResult {
  test: string;
  value: string;
  normalRange?: string;
  status: ResultStatus;
  meaning: string;
}

export interface Medication {
  name: string;
  dosage?: string;
  purpose?: string;
  notes?: string;
  /** Human-readable schedule, e.g. "every 8 hours" or "twice daily". */
  frequency?: string;
  /** Hours between doses, derived from the frequency (e.g. "every 8 hours" → 8). */
  intervalHours?: number;
  /** Total number of doses in the prescribed course, when a duration is specified. */
  totalDoses?: number;
  /** Length of the prescribed course in days, when explicitly stated. */
  durationDays?: number;
}

export interface Symptom {
  description: string;
  severity?: string;
}

export interface ReportSummary {
  overview: string;
  flags: string[];
  keyResults: KeyResult[];
  medications: Medication[];
  symptoms: Symptom[];
  questionsForDoctor: string[];
}

export interface GeminiSummaryResult {
  summary: ReportSummary;
  modelUsed: string;
}

export class GeminiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
  }
}

const SUMMARY_SYSTEM_INSTRUCTION = `You are a health-literacy assistant helping a patient understand their own medical report. The text was extracted from a photo by OCR, so it may contain typos, missing characters, or odd spacing — read past those issues.

You MUST return a JSON object that conforms to the provided schema. Follow these rules strictly:

- Use plain, casual, non-technical English. When a medical term is unavoidable, define it in the same sentence in everyday words.
- Be concise. Each "meaning", "notes", and "severity" string should be ONE short sentence. The "overview" must be 1–2 short sentences.
- Only include items that are actually present in the report. If the report contains no medications, return an empty "medications" array. Same for symptoms, key results, flags, and questions.
- Never invent values, ranges, dosages, or diagnoses that are not in the report. If something is unreadable due to OCR errors, omit it rather than guess.
- For each key result, set "status" by comparing the value to any normal range printed in the report: "high", "low", "borderline", or "normal". Use "unknown" when no range is given.
- "flags" lists at most 3 short phrases the patient should pay attention to (e.g. clearly out-of-range values, urgent terms). If nothing is flag-worthy, return an empty array.
- "questionsForDoctor" lists at most 3 short, specific questions the patient could realistically ask, grounded in what the report actually says.
- For each medication that has dosing instructions in the report, populate the "frequency" field with a short human-readable phrase ("every 8 hours", "twice daily", "once a day at bedtime"), and derive "intervalHours" as a number (every 8 hours → 8, twice daily → 12, once daily → 24, three times a day → 8). If a course duration is specified ("for 7 days"), set "durationDays" and compute "totalDoses" = durationDays × doses-per-day. Omit any of these fields when the report does not give enough information to fill them — never guess.
- Do not diagnose, do not recommend treatment, do not editorialize beyond plain explanation.`;

const MEDICATION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING' },
    dosage: { type: 'STRING' },
    frequency: { type: 'STRING' },
    intervalHours: { type: 'NUMBER' },
    totalDoses: { type: 'NUMBER' },
    durationDays: { type: 'NUMBER' },
    purpose: { type: 'STRING' },
    notes: { type: 'STRING' },
  },
  required: ['name'],
} as const;

function normalizeMedication(m: any): Medication | null {
  if (!m || typeof m !== 'object') return null;
  const name = typeof m.name === 'string' ? m.name.trim() : '';
  if (!name) return null;
  const numOrUndef = (v: any) =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;
  const strOrUndef = (v: any) =>
    typeof v === 'string' && v.trim() ? v.trim() : undefined;
  return {
    name,
    dosage: strOrUndef(m.dosage),
    purpose: strOrUndef(m.purpose),
    notes: strOrUndef(m.notes),
    frequency: strOrUndef(m.frequency),
    intervalHours: numOrUndef(m.intervalHours),
    totalDoses: numOrUndef(m.totalDoses),
    durationDays: numOrUndef(m.durationDays),
  };
}

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    overview: { type: 'STRING' },
    flags: {
      type: 'ARRAY',
      items: { type: 'STRING' },
    },
    keyResults: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          test: { type: 'STRING' },
          value: { type: 'STRING' },
          normalRange: { type: 'STRING' },
          status: {
            type: 'STRING',
            enum: ['normal', 'high', 'low', 'borderline', 'unknown'],
          },
          meaning: { type: 'STRING' },
        },
        required: ['test', 'value', 'status', 'meaning'],
      },
    },
    medications: {
      type: 'ARRAY',
      items: MEDICATION_SCHEMA,
    },
    symptoms: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          description: { type: 'STRING' },
          severity: { type: 'STRING' },
        },
        required: ['description'],
      },
    },
    questionsForDoctor: {
      type: 'ARRAY',
      items: { type: 'STRING' },
    },
  },
  required: [
    'overview',
    'flags',
    'keyResults',
    'medications',
    'symptoms',
    'questionsForDoctor',
  ],
} as const;

/**
 * Defensive parser: takes the raw `text` from Gemini's response and converts
 * it into a fully-validated `ReportSummary`. Tolerates the model wrapping the
 * JSON in a fenced code block (rare with `responseMimeType` set, but possible
 * with older models).
 */
export function parseSummaryResponse(rawText: string): ReportSummary {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new GeminiError('Gemini returned an empty response.');
  }

  let payload: any;
  try {
    payload = JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fenced) {
      try {
        payload = JSON.parse(fenced[1]);
      } catch {
        throw new GeminiError('Gemini response was not valid JSON.');
      }
    } else {
      throw new GeminiError('Gemini response was not valid JSON.');
    }
  }

  if (!payload || typeof payload !== 'object') {
    throw new GeminiError('Gemini response was not a JSON object.');
  }

  const overview = typeof payload.overview === 'string' ? payload.overview.trim() : '';

  const flags = Array.isArray(payload.flags)
    ? payload.flags.filter((f: unknown): f is string => typeof f === 'string' && f.trim().length > 0)
    : [];

  const keyResults: KeyResult[] = Array.isArray(payload.keyResults)
    ? payload.keyResults
        .filter((k: any) => k && typeof k === 'object')
        .map((k: any) => {
          const status = RESULT_STATUSES.includes(k.status) ? (k.status as ResultStatus) : 'unknown';
          return {
            test: typeof k.test === 'string' ? k.test.trim() : '',
            value: typeof k.value === 'string' ? k.value.trim() : '',
            normalRange:
              typeof k.normalRange === 'string' && k.normalRange.trim()
                ? k.normalRange.trim()
                : undefined,
            status,
            meaning: typeof k.meaning === 'string' ? k.meaning.trim() : '',
          };
        })
        .filter((k: KeyResult) => k.test || k.value)
    : [];

  const medications: Medication[] = Array.isArray(payload.medications)
    ? payload.medications
        .map(normalizeMedication)
        .filter((m: Medication | null): m is Medication => m !== null)
    : [];

  const symptoms: Symptom[] = Array.isArray(payload.symptoms)
    ? payload.symptoms
        .filter(
          (s: any) =>
            s && typeof s === 'object' && typeof s.description === 'string' && s.description.trim()
        )
        .map((s: any) => ({
          description: s.description.trim(),
          severity:
            typeof s.severity === 'string' && s.severity.trim() ? s.severity.trim() : undefined,
        }))
    : [];

  const questionsForDoctor = Array.isArray(payload.questionsForDoctor)
    ? payload.questionsForDoctor.filter(
        (q: unknown): q is string => typeof q === 'string' && q.trim().length > 0
      )
    : [];

  return { overview, flags, keyResults, medications, symptoms, questionsForDoctor };
}

export interface SummarizeArgs {
  apiKey: string;
  model: string;
  reportText: string;
  signal?: AbortSignal;
}

export async function summarizeReport({
  apiKey,
  model,
  reportText,
  signal,
}: SummarizeArgs): Promise<GeminiSummaryResult> {
  if (!apiKey.trim()) {
    throw new GeminiError('Missing Gemini API key.');
  }
  if (!reportText.trim()) {
    throw new GeminiError('No report text to summarize.');
  }

  const trimmedModel = model.trim() || DEFAULT_GEMINI_MODEL;
  const url = `${GEMINI_BASE_URL}/${encodeURIComponent(trimmedModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    systemInstruction: {
      parts: [{ text: SUMMARY_SYSTEM_INSTRUCTION }],
    },
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Here is the OCR-extracted text of my medical report. Summarize it as JSON per the schema:\n\n${reportText}`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.3,
      topP: 0.95,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err: any) {
    throw new GeminiError(
      err?.message ? `Network error: ${err.message}` : 'Network error reaching Gemini.'
    );
  }

  const rawText = await response.text();
  let json: any = null;
  try {
    json = rawText ? JSON.parse(rawText) : null;
  } catch {
    // fall through — handled below
  }

  if (!response.ok) {
    const apiMessage = json?.error?.message;
    throw new GeminiError(
      apiMessage ? `Gemini API: ${apiMessage}` : `Gemini request failed (${response.status}).`,
      response.status
    );
  }

  const candidate = json?.candidates?.[0];
  const finishReason: string | undefined = candidate?.finishReason;
  const parts: { text?: string }[] = candidate?.content?.parts ?? [];
  const text = parts.map((p) => p?.text ?? '').join('').trim();

  if (!text) {
    if (finishReason && finishReason !== 'STOP') {
      throw new GeminiError(`Gemini returned no text (finishReason: ${finishReason}).`);
    }
    throw new GeminiError('Gemini returned an empty response.');
  }

  const summary = parseSummaryResponse(text);
  return { summary, modelUsed: trimmedModel };
}

/* ------------------------------------------------------------------ *
 *  Multi-turn chat about an already-summarized report
 * ------------------------------------------------------------------ */

const CHAT_SYSTEM_INSTRUCTION = `You are a health-literacy assistant helping a patient understand their own medical report. They have already received an initial structured summary and are now asking follow-up questions.

You MUST return a JSON object that conforms to the provided schema:
- "text" is your reply to the patient, in plain casual non-technical English.
- "medications" is an OPTIONAL array of medications you are referring to *that are present in the report* and that the patient could plausibly want to track. Only include a medication when your reply is actually about that medication or a class of medications they're on. Do NOT echo every medication in the report on every turn. Do NOT invent medications. If your reply is not about a specific medication, return an empty "medications" array (or omit it).

Style rules for "text":
- Plain, casual, non-technical English. When you must use a medical term, define it in the same sentence.
- Keep answers short and focused — a few sentences is usually enough. Use bullet points only when listing distinct items.
- Ground every answer in what the report actually says. If the patient asks something the report does not cover, say so honestly instead of guessing.
- Never invent values, ranges, dosages, or diagnoses. Never recommend specific treatments or dosages.
- You may suggest the patient ask their doctor about something, but you are not a substitute for one.
- Do not repeat the entire summary — the patient has already seen it. Answer the specific question they asked.

Rules for medications array (when populated):
- "name" is required. Match the medication name exactly as it appears in the report.
- Populate "frequency" (human-readable) and "intervalHours" (number) when the report gives a dosing schedule. "every 8 hours" → 8; "twice daily" → 12; "once daily" → 24; "three times a day" → 8.
- Populate "durationDays" and compute "totalDoses" (= durationDays × doses-per-day) when the report specifies a course length.
- Omit any field the report does not support. Never guess.`;

const CHAT_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    text: { type: 'STRING' },
    medications: {
      type: 'ARRAY',
      items: MEDICATION_SCHEMA,
    },
  },
  required: ['text'],
} as const;

export interface ChatReply {
  text: string;
  medications: Medication[];
}

/** Defensive parser for the chat structured response. */
export function parseChatResponse(rawText: string): ChatReply {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new GeminiError('Gemini returned an empty response.');
  }
  let payload: any;
  try {
    payload = JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fenced) {
      try {
        payload = JSON.parse(fenced[1]);
      } catch {
        throw new GeminiError('Gemini chat response was not valid JSON.');
      }
    } else {
      // Last resort: treat the whole string as the text reply with no medications.
      return { text: trimmed, medications: [] };
    }
  }
  if (!payload || typeof payload !== 'object') {
    return { text: trimmed, medications: [] };
  }
  const text =
    typeof payload.text === 'string' && payload.text.trim() ? payload.text.trim() : '';
  const medications: Medication[] = Array.isArray(payload.medications)
    ? payload.medications
        .map(normalizeMedication)
        .filter((m: Medication | null): m is Medication => m !== null)
    : [];
  if (!text) {
    throw new GeminiError('Gemini chat response had no text.');
  }
  return { text, medications };
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatArgs {
  apiKey: string;
  model: string;
  reportText: string;
  summary: ReportSummary;
  history: ChatTurn[];
  userMessage: string;
  signal?: AbortSignal;
}

export interface ChatResult {
  reply: string;
  medications: Medication[];
  modelUsed: string;
}

function buildChatContext(reportText: string, summary: ReportSummary): string {
  return `${CHAT_SYSTEM_INSTRUCTION}

----- ORIGINAL REPORT TEXT (OCR) -----
${reportText}

----- STRUCTURED SUMMARY (already shown to patient) -----
${JSON.stringify(summary, null, 2)}`;
}

export async function chatAboutReport({
  apiKey,
  model,
  reportText,
  summary,
  history,
  userMessage,
  signal,
}: ChatArgs): Promise<ChatResult> {
  if (!apiKey.trim()) {
    throw new GeminiError('Missing Gemini API key.');
  }
  if (!userMessage.trim()) {
    throw new GeminiError('Empty message.');
  }

  const trimmedModel = model.trim() || DEFAULT_GEMINI_MODEL;
  const url = `${GEMINI_BASE_URL}/${encodeURIComponent(trimmedModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const contents = [
    ...history.map((turn) => ({
      role: turn.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: turn.content }],
    })),
    {
      role: 'user',
      parts: [{ text: userMessage }],
    },
  ];

  const body = {
    systemInstruction: {
      parts: [{ text: buildChatContext(reportText, summary) }],
    },
    contents,
    generationConfig: {
      temperature: 0.4,
      topP: 0.95,
      responseMimeType: 'application/json',
      responseSchema: CHAT_RESPONSE_SCHEMA,
    },
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err: any) {
    throw new GeminiError(
      err?.message ? `Network error: ${err.message}` : 'Network error reaching Gemini.'
    );
  }

  const rawText = await response.text();
  let json: any = null;
  try {
    json = rawText ? JSON.parse(rawText) : null;
  } catch {
    // handled below
  }

  if (!response.ok) {
    const apiMessage = json?.error?.message;
    throw new GeminiError(
      apiMessage ? `Gemini API: ${apiMessage}` : `Gemini request failed (${response.status}).`,
      response.status
    );
  }

  const candidate = json?.candidates?.[0];
  const finishReason: string | undefined = candidate?.finishReason;
  const parts: { text?: string }[] = candidate?.content?.parts ?? [];
  const rawReply = parts.map((p) => p?.text ?? '').join('').trim();

  if (!rawReply) {
    if (finishReason && finishReason !== 'STOP') {
      throw new GeminiError(`Gemini returned no text (finishReason: ${finishReason}).`);
    }
    throw new GeminiError('Gemini returned an empty response.');
  }

  const { text, medications } = parseChatResponse(rawReply);
  return { reply: text, medications, modelUsed: trimmedModel };
}
