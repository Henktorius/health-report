import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useMedications } from '@/hooks/use-medications';
import {
  dosesRemaining,
  formatRelativeTime,
  isCourseComplete,
  nextDoseAt,
  type TrackedMedication,
} from '@/lib/medications';

export default function MedicationsScreen() {
  const backgroundColor = useThemeColor({}, 'background');
  const iconColor = useThemeColor({}, 'icon');
  const { medications, isLoading, reload, recordDose, undoDose, archive, remove } =
    useMedications();

  // Tick every 30s so countdowns refresh smoothly without burning battery.
  const [, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(i);
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const onLongPress = (med: TrackedMedication) => {
    Alert.alert(med.name, undefined, [
      { text: 'Cancel', style: 'cancel' },
      med.archived
        ? {
            text: 'Reactivate',
            onPress: () => archive(med.id, false),
          }
        : {
            text: 'Archive',
            onPress: () => archive(med.id, true),
          },
      med.doses.length > 0
        ? {
            text: 'Undo last dose',
            onPress: () => undoDose(med.id),
          }
        : { text: 'Undo last dose', style: 'cancel' as const, onPress: () => {} },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Delete medication?', 'This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => remove(med.id) },
          ]),
      },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor }}>
      <View style={styles.topBar}>
        <ThemedText type="title" style={styles.appTitle}>
          Medications
        </ThemedText>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#007AFF" />
        </View>
      ) : medications.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="medkit-outline" size={56} color="#C7C7CC" />
          <ThemedText style={styles.emptyTitle}>No medications tracked</ThemedText>
          <ThemedText style={styles.emptyHint}>
            When the AI mentions a medication in a chat, tap “Track this” to add it here.
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={medications}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <MedicationRow
              med={item}
              iconColor={iconColor}
              onTakeDose={() => recordDose(item.id)}
              onLongPress={() => onLongPress(item)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function MedicationRow({
  med,
  iconColor,
  onTakeDose,
  onLongPress,
}: {
  med: TrackedMedication;
  iconColor: string;
  onTakeDose: () => void;
  onLongPress: () => void;
}) {
  const remaining = dosesRemaining(med);
  const next = nextDoseAt(med);
  const courseDone = isCourseComplete(med);

  const now = Date.now();
  const dueIn = next !== null ? next - now : null;
  const overdue = dueIn !== null && dueIn <= 0;

  let scheduleLabel = '';
  if (med.archived) {
    scheduleLabel = 'Archived';
  } else if (courseDone) {
    scheduleLabel = 'Course complete';
  } else if (med.doses.length === 0) {
    scheduleLabel =
      typeof med.intervalHours === 'number'
        ? `Take first dose to start the timer`
        : 'No schedule set';
  } else if (dueIn === null) {
    scheduleLabel = 'No interval set';
  } else if (overdue) {
    scheduleLabel = `Due now (${formatRelativeTime(-dueIn)} overdue)`;
  } else {
    scheduleLabel = `Next dose in ${formatRelativeTime(dueIn)}`;
  }

  const meta = [med.dosage, med.frequency].filter(Boolean).join('  •  ');

  return (
    <Pressable
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.rowHeader}>
        <View style={styles.rowIcon}>
          <Ionicons
            name="medkit-outline"
            size={20}
            color={med.archived ? iconColor : '#5856D6'}
          />
        </View>
        <View style={styles.rowBody}>
          <ThemedText style={[styles.rowTitle, med.archived && styles.dimText]}>
            {med.name}
          </ThemedText>
          {meta ? <ThemedText style={styles.rowMeta}>{meta}</ThemedText> : null}
        </View>
        {remaining !== null ? (
          <View style={[styles.badge, courseDone && styles.badgeDone]}>
            <ThemedText style={styles.badgeText}>
              {remaining}/{med.totalDoses}
            </ThemedText>
          </View>
        ) : null}
      </View>

      <ThemedText
        style={[
          styles.scheduleLabel,
          overdue && !med.archived && styles.scheduleOverdue,
          courseDone && styles.dimText,
          med.archived && styles.dimText,
        ]}
      >
        {scheduleLabel}
      </ThemedText>

      {med.purpose ? (
        <ThemedText style={styles.rowPurpose}>For: {med.purpose}</ThemedText>
      ) : null}

      {!med.archived && !courseDone ? (
        <Pressable
          onPress={onTakeDose}
          style={[styles.doseButton, overdue && styles.doseButtonOverdue]}
        >
          <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
          <ThemedText style={styles.doseButtonText}>I took it now</ThemedText>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topBar: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  appTitle: {
    fontSize: 28,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 8,
  },
  emptyHint: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 20,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 10,
  },
  row: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    gap: 6,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EDECFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowBody: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  rowMeta: {
    fontSize: 13,
    color: '#3A3A3C',
    marginTop: 2,
  },
  rowPurpose: {
    fontSize: 13,
    color: '#3A3A3C',
  },
  scheduleLabel: {
    fontSize: 13,
    color: '#5856D6',
    fontWeight: '600',
  },
  scheduleOverdue: {
    color: '#B8420C',
  },
  dimText: {
    color: '#8E8E93',
  },
  badge: {
    backgroundColor: '#EDECFF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  badgeDone: {
    backgroundColor: '#E1F5E5',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5856D6',
  },
  doseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#34C759',
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 4,
  },
  doseButtonOverdue: {
    backgroundColor: '#FF9500',
  },
  doseButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
