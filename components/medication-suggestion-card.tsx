import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import type { Medication } from '@/lib/gemini';

interface Props {
  medication: Medication;
  onTrack: (medication: Medication) => Promise<void> | void;
  /** When provided, renders a non-interactive "Tracked" state instead of a button. */
  alreadyTracked?: boolean;
}

export function MedicationSuggestionCard({ medication, onTrack, alreadyTracked }: Props) {
  const [state, setState] = useState<'idle' | 'saving' | 'tracked'>(
    alreadyTracked ? 'tracked' : 'idle'
  );

  const handlePress = async () => {
    if (state !== 'idle') return;
    setState('saving');
    try {
      await onTrack(medication);
      setState('tracked');
    } catch {
      setState('idle');
    }
  };

  const meta = [medication.dosage, medication.frequency].filter(Boolean).join('  •  ');
  const courseBits: string[] = [];
  if (medication.totalDoses) courseBits.push(`${medication.totalDoses} doses total`);
  if (medication.durationDays) courseBits.push(`${medication.durationDays}-day course`);
  const courseLine = courseBits.join(' · ');

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.iconBubble}>
          <Ionicons name="medkit-outline" size={18} color="#5856D6" />
        </View>
        <View style={styles.headerText}>
          <ThemedText style={styles.name}>{medication.name}</ThemedText>
          {meta ? <ThemedText style={styles.meta}>{meta}</ThemedText> : null}
        </View>
      </View>

      {medication.purpose ? (
        <ThemedText style={styles.purpose}>For: {medication.purpose}</ThemedText>
      ) : null}

      {courseLine ? <ThemedText style={styles.course}>{courseLine}</ThemedText> : null}

      {medication.notes ? (
        <ThemedText style={styles.notes}>{medication.notes}</ThemedText>
      ) : null}

      <Pressable
        onPress={handlePress}
        disabled={state !== 'idle'}
        style={[
          styles.button,
          state === 'tracked' && styles.buttonTracked,
          state === 'saving' && styles.buttonDisabled,
        ]}
      >
        <Ionicons
          name={state === 'tracked' ? 'checkmark-circle' : 'add-circle-outline'}
          size={18}
          color={state === 'tracked' ? '#0F8A3F' : '#FFFFFF'}
        />
        <ThemedText
          style={[
            styles.buttonText,
            state === 'tracked' && styles.buttonTextTracked,
          ]}
        >
          {state === 'tracked' ? 'Tracking' : state === 'saving' ? 'Saving…' : 'Track this'}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    gap: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 2,
  },
  iconBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EDECFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  meta: {
    fontSize: 13,
    color: '#3A3A3C',
    marginTop: 2,
  },
  purpose: {
    fontSize: 13,
    color: '#3A3A3C',
  },
  course: {
    fontSize: 12,
    color: '#5856D6',
    fontWeight: '600',
  },
  notes: {
    fontSize: 13,
    color: '#3A3A3C',
    fontStyle: 'italic',
    lineHeight: 18,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#5856D6',
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 4,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonTracked: {
    backgroundColor: '#E1F5E5',
  },
  buttonTextTracked: {
    color: '#0F8A3F',
  },
});
