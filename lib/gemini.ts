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
- Do not diagnose, do not recommend treatment, do not editorialize beyond plain explanation.`;

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
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          dosage: { type: 'STRING' },
          purpose: { type: 'STRING' },
          notes: { type: 'STRING' },
        },
        required: ['name'],
      },
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
        .filter((m: any) => m && typeof m === 'object' && typeof m.name === 'string' && m.name.trim())
        .map((m: any) => ({
          name: m.name.trim(),
          dosage: typeof m.dosage === 'string' && m.dosage.trim() ? m.dosage.trim() : undefined,
          purpose: typeof m.purpose === 'string' && m.purpose.trim() ? m.purpose.trim() : undefined,
          notes: typeof m.notes === 'string' && m.notes.trim() ? m.notes.trim() : undefined,
        }))
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

Rules:
- Use plain, casual, non-technical English. When you must use a medical term, define it in the same sentence.
- Keep answers short and focused — a few sentences is usually enough. Use bullet points only when listing distinct items.
- Ground every answer in what the report actually says. If the patient asks something the report does not cover, say so honestly instead of guessing.
- Never invent values, ranges, dosages, or diagnoses. Never recommend specific treatments or dosages.
- You may suggest the patient ask their doctor about something, but you are not a substitute for one.
- Do not repeat the entire summary — the patient has already seen it. Answer the specific question they asked.`;

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
  const reply = parts.map((p) => p?.text ?? '').join('').trim();

  if (!reply) {
    if (finishReason && finishReason !== 'STOP') {
      throw new GeminiError(`Gemini returned no text (finishReason: ${finishReason}).`);
    }
    throw new GeminiError('Gemini returned an empty response.');
  }

  return { reply, modelUsed: trimmedModel };
}
