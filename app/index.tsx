import { useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useConversations } from '@/hooks/use-conversations';
import type { ConversationSummary } from '@/lib/conversations';

export default function IndexScreen() {
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const iconColor = useThemeColor({}, 'icon');
  const router = useRouter();
  const { conversations, isLoading, reload, remove } = useConversations();

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const onPressConversation = (id: string) => {
    router.push(`/chat/${id}` as any);
  };

  const onLongPressConversation = (item: ConversationSummary) => {
    Alert.alert(item.title, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => remove(item.id),
      },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor }}>
      <View style={styles.topBar}>
        <ThemedText type="title" style={styles.appTitle}>
          Health Reports
        </ThemedText>
        <Pressable
          onPress={() => router.push('/settings')}
          style={styles.iconButton}
          hitSlop={10}
          accessibilityLabel="Open settings"
        >
          <Ionicons name="settings-outline" size={24} color={iconColor} />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#007AFF" />
        </View>
      ) : conversations.length === 0 ? (
        <EmptyState />
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <ConversationRow
              item={item}
              textColor={textColor}
              iconColor={iconColor}
              onPress={() => onPressConversation(item.id)}
              onLongPress={() => onLongPressConversation(item)}
            />
          )}
        />
      )}

      <View style={styles.fabContainer}>
        <Pressable
          onPress={() => router.push('/new' as any)}
          style={styles.fab}
          accessibilityLabel="Start a new conversation"
        >
          <Ionicons name="add" size={28} color="#FFFFFF" />
          <ThemedText style={styles.fabText}>New Report</ThemedText>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function EmptyState() {
  return (
    <View style={styles.centered}>
      <Ionicons name="chatbubbles-outline" size={56} color="#C7C7CC" />
      <ThemedText style={styles.emptyTitle}>No reports yet</ThemedText>
      <ThemedText style={styles.emptyHint}>
        Tap “New Report” to scan a medical report and start chatting about it.
      </ThemedText>
    </View>
  );
}

function ConversationRow({
  item,
  textColor,
  iconColor,
  onPress,
  onLongPress,
}: {
  item: ConversationSummary;
  textColor: string;
  iconColor: string;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const date = new Date(item.updatedAt);
  const dateLabel = date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.rowIcon}>
        <Ionicons name="document-text-outline" size={22} color="#5856D6" />
      </View>
      <View style={styles.rowBody}>
        <ThemedText
          style={[styles.rowTitle, { color: textColor }]}
          numberOfLines={1}
        >
          {item.title}
        </ThemedText>
        {item.preview ? (
          <ThemedText
            style={[styles.rowPreview, { color: iconColor }]}
            numberOfLines={2}
          >
            {item.preview}
          </ThemedText>
        ) : null}
        <ThemedText style={[styles.rowMeta, { color: iconColor }]}>
          {dateLabel} · {item.messageCount} {item.messageCount === 1 ? 'message' : 'messages'}
        </ThemedText>
      </View>
      <Ionicons name="chevron-forward" size={18} color={iconColor} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  appTitle: {
    fontSize: 28,
  },
  iconButton: {
    padding: 8,
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
    paddingBottom: 120,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  rowPressed: {
    opacity: 0.6,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EDECFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  rowPreview: {
    fontSize: 13,
    lineHeight: 18,
  },
  rowMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  fabContainer: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 30,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
