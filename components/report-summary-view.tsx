import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { MedicationSuggestionCard } from '@/components/medication-suggestion-card';
import type {
  KeyResult,
  Medication,
  ReportSummary,
  ResultStatus,
  Symptom,
} from '@/lib/gemini';

const STATUS_META: Record<
  ResultStatus,
  { label: string; fg: string; bg: string }
> = {
  normal:     { label: 'Normal',     fg: '#0F8A3F', bg: '#E1F5E5' },
  high:       { label: 'High',       fg: '#B8420C', bg: '#FFE6D5' },
  low:        { label: 'Low',        fg: '#1860B7', bg: '#D9ECFF' },
  borderline: { label: 'Borderline', fg: '#8B5E00', bg: '#FFF4D5' },
  unknown:    { label: '—',          fg: '#6E6E73', bg: '#EFEFF4' },
};

interface Props {
  summary: ReportSummary;
  modelLabel?: string;
  onTrackMedication?: (medication: Medication) => Promise<void> | void;
  trackedMedicationKeys?: Set<string>;
}

export function ReportSummaryView({
  summary,
  modelLabel,
  onTrackMedication,
  trackedMedicationKeys,
}: Props) {
  const isEmpty =
    !summary.overview &&
    summary.flags.length === 0 &&
    summary.keyResults.length === 0 &&
    summary.medications.length === 0 &&
    summary.symptoms.length === 0 &&
    summary.questionsForDoctor.length === 0;

  if (isEmpty) {
    return (
      <View style={styles.emptyCard}>
        <ThemedText style={styles.emptyText}>
          The model could not extract anything useful from this report. Try a clearer photo.
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {summary.overview ? (
        <View style={styles.overviewCard}>
          <ThemedText style={styles.overviewText}>{summary.overview}</ThemedText>
        </View>
      ) : null}

      {summary.flags.length > 0 ? <FlagsCallout flags={summary.flags} /> : null}

      {summary.keyResults.length > 0 ? (
        <Section title="Key Results">
          {summary.keyResults.map((r, i) => (
            <KeyResultRow key={`r-${i}`} result={r} isLast={i === summary.keyResults.length - 1} />
          ))}
        </Section>
      ) : null}

      {summary.medications.length > 0 ? (
        onTrackMedication ? (
          <View style={styles.medicationCardStack}>
            <ThemedText style={styles.medicationStackTitle}>Medications</ThemedText>
            {summary.medications.map((m, i) => (
              <MedicationSuggestionCard
                key={`m-${i}`}
                medication={m}
                onTrack={onTrackMedication}
                alreadyTracked={trackedMedicationKeys?.has(m.name.toLowerCase())}
              />
            ))}
          </View>
        ) : (
          <Section title="Medications">
            {summary.medications.map((m, i) => (
              <MedicationRow key={`m-${i}`} med={m} isLast={i === summary.medications.length - 1} />
            ))}
          </Section>
        )
      ) : null}

      {summary.symptoms.length > 0 ? (
        <Section title="Symptoms">
          {summary.symptoms.map((s, i) => (
            <SymptomRow key={`s-${i}`} symptom={s} isLast={i === summary.symptoms.length - 1} />
          ))}
        </Section>
      ) : null}

      {summary.questionsForDoctor.length > 0 ? (
        <Section title="Ask Your Doctor">
          {summary.questionsForDoctor.map((q, i) => (
            <View key={`q-${i}`} style={styles.questionRow}>
              <ThemedText style={styles.questionNumber}>{i + 1}</ThemedText>
              <ThemedText style={styles.questionText}>{q}</ThemedText>
            </View>
          ))}
        </Section>
      ) : null}

      {modelLabel ? <ThemedText style={styles.modelHint}>Model: {modelLabel}</ThemedText> : null}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function FlagsCallout({ flags }: { flags: string[] }) {
  return (
    <View style={styles.flagsCard}>
      <View style={styles.flagsHeader}>
        <Ionicons name="warning-outline" size={16} color="#B8420C" />
        <ThemedText style={styles.flagsTitle}>Worth Discussing</ThemedText>
      </View>
      {flags.map((f, i) => (
        <View key={`f-${i}`} style={styles.flagRow}>
          <ThemedText style={styles.flagBullet}>•</ThemedText>
          <ThemedText style={styles.flagText}>{f}</ThemedText>
        </View>
      ))}
    </View>
  );
}

function StatusBadge({ status }: { status: ResultStatus }) {
  const meta = STATUS_META[status];
  return (
    <View style={[styles.badge, { backgroundColor: meta.bg }]}>
      <ThemedText style={[styles.badgeText, { color: meta.fg }]}>{meta.label}</ThemedText>
    </View>
  );
}

function KeyResultRow({ result, isLast }: { result: KeyResult; isLast: boolean }) {
  return (
    <View style={[styles.row, !isLast && styles.rowDivider]}>
      <View style={styles.resultTopRow}>
        <ThemedText style={styles.resultName} numberOfLines={2}>
          {result.test || '—'}
        </ThemedText>
        <StatusBadge status={result.status} />
      </View>
      <View style={styles.resultValueRow}>
        <ThemedText style={styles.resultValue}>{result.value || '—'}</ThemedText>
        {result.normalRange ? (
          <ThemedText style={styles.resultRange}>Normal: {result.normalRange}</ThemedText>
        ) : null}
      </View>
      {result.meaning ? (
        <ThemedText style={styles.resultMeaning}>{result.meaning}</ThemedText>
      ) : null}
    </View>
  );
}

function MedicationRow({ med, isLast }: { med: Medication; isLast: boolean }) {
  const meta = [med.dosage, med.purpose].filter(Boolean).join('  •  ');
  return (
    <View style={[styles.row, !isLast && styles.rowDivider]}>
      <ThemedText style={styles.medName}>{med.name}</ThemedText>
      {meta ? <ThemedText style={styles.medMeta}>{meta}</ThemedText> : null}
      {med.notes ? <ThemedText style={styles.medNotes}>{med.notes}</ThemedText> : null}
    </View>
  );
}

function SymptomRow({ symptom, isLast }: { symptom: Symptom; isLast: boolean }) {
  return (
    <View style={[styles.row, styles.symptomRowLayout, !isLast && styles.rowDivider]}>
      <ThemedText style={styles.symptomDot}>•</ThemedText>
      <View style={styles.symptomBody}>
        <ThemedText style={styles.symptomText}>{symptom.description}</ThemedText>
        {symptom.severity ? (
          <ThemedText style={styles.symptomSeverity}>{symptom.severity}</ThemedText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    maxWidth: 360,
    gap: 14,
    marginBottom: 16,
  },

  emptyCard: {
    backgroundColor: '#F2F2F7',
    borderRadius: 14,
    padding: 16,
    width: '100%',
    maxWidth: 360,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#3A3A3C',
    textAlign: 'center',
  },

  overviewCard: {
    backgroundColor: '#E8F4FF',
    borderRadius: 14,
    padding: 16,
  },
  overviewText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#1C1C1E',
  },

  flagsCard: {
    backgroundColor: '#FFF4EC',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FFD9BD',
    gap: 6,
  },
  flagsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  flagsTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B8420C',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  flagRow: {
    flexDirection: 'row',
    gap: 6,
  },
  flagBullet: {
    color: '#B8420C',
    fontSize: 14,
    lineHeight: 20,
  },
  flagText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: '#1C1C1E',
  },

  section: {
    backgroundColor: '#F2F2F7',
    borderRadius: 14,
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
  },
  sectionBody: {
    paddingHorizontal: 14,
    paddingBottom: 4,
  },

  row: {
    paddingVertical: 10,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#D1D1D6',
  },

  resultTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  resultName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  resultValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  resultValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  resultRange: {
    fontSize: 12,
    color: '#8E8E93',
  },
  resultMeaning: {
    fontSize: 13,
    lineHeight: 18,
    color: '#3A3A3C',
    marginTop: 6,
  },

  medName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  medMeta: {
    fontSize: 13,
    color: '#3A3A3C',
    marginTop: 2,
  },
  medNotes: {
    fontSize: 13,
    lineHeight: 18,
    color: '#3A3A3C',
    marginTop: 4,
    fontStyle: 'italic',
  },

  symptomRowLayout: {
    flexDirection: 'row',
    gap: 8,
  },
  symptomDot: {
    color: '#1C1C1E',
    fontSize: 16,
    lineHeight: 20,
  },
  symptomBody: {
    flex: 1,
  },
  symptomText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#1C1C1E',
  },
  symptomSeverity: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },

  questionRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
  },
  questionNumber: {
    fontSize: 13,
    fontWeight: '700',
    color: '#5856D6',
    minWidth: 16,
  },
  questionText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: '#1C1C1E',
  },

  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },

  modelHint: {
    fontSize: 11,
    color: '#8E8E93',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 4,
  },
  medicationCardStack: {
    gap: 8,
  },
  medicationStackTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
    marginLeft: 4,
  },
});
