import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ReportSummaryView } from '@/components/report-summary-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useGeminiSettings } from '@/hooks/use-gemini-settings';
import {
  appendMessage,
  getConversation,
  type ChatMessage,
  type Conversation,
} from '@/lib/conversations';
import { GeminiError, chatAboutReport, type ChatTurn } from '@/lib/gemini';

type ListItem =
  | { kind: 'summary'; id: 'summary' }
  | { kind: 'message'; id: string; message: ChatMessage }
  | { kind: 'pending'; id: 'pending' };

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const iconColor = useThemeColor({}, 'icon');
  const { settings, isConfigured, reload: reloadSettings } = useGeminiSettings();

  useFocusEffect(
    useCallback(() => {
      reloadSettings();
    }, [reloadSettings])
  );

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const listRef = useRef<FlatList<ListItem>>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const conv = await getConversation(id);
    setConversation(conv);
    setIsLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const items: ListItem[] = (() => {
    if (!conversation) return [];
    const msgs: ListItem[] = conversation.messages.map((m) => ({
      kind: 'message',
      id: m.id,
      message: m,
    }));
    const head: ListItem[] = [{ kind: 'summary', id: 'summary' }];
    return isSending
      ? [...head, ...msgs, { kind: 'pending', id: 'pending' }]
      : [...head, ...msgs];
  })();

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || !conversation) return;

    if (!isConfigured) {
      Alert.alert(
        'Gemini Not Configured',
        'Add your API key in Settings to continue chatting.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => router.push('/settings') },
        ]
      );
      return;
    }

    setDraft('');
    setIsSending(true);

    const afterUser = await appendMessage(conversation.id, {
      role: 'user',
      content: text,
    });
    if (afterUser) setConversation(afterUser);
    scrollToEnd();

    const history: ChatTurn[] = (afterUser?.messages ?? [])
      .slice(0, -1)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const { reply } = await chatAboutReport({
        apiKey: settings.apiKey,
        model: settings.model,
        reportText: conversation.reportText,
        summary: conversation.summary,
        history,
        userMessage: text,
      });
      const afterAssistant = await appendMessage(conversation.id, {
        role: 'assistant',
        content: reply,
      });
      if (afterAssistant) setConversation(afterAssistant);
      scrollToEnd();
    } catch (e: any) {
      const message =
        e instanceof GeminiError ? e.message : e?.message ?? 'Failed to get a reply.';
      Alert.alert('Chat Failed', message);
    } finally {
      setIsSending(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.flex, { backgroundColor }]}>
        <Stack.Screen options={{ title: 'Loading…', headerShown: true }} />
        <View style={styles.centered}>
          <ActivityIndicator color="#007AFF" />
        </View>
      </SafeAreaView>
    );
  }

  if (!conversation) {
    return (
      <SafeAreaView style={[styles.flex, { backgroundColor }]}>
        <Stack.Screen options={{ title: 'Not Found', headerShown: true }} />
        <View style={styles.centered}>
          <ThemedText style={styles.notFound}>This conversation no longer exists.</ThemedText>
          <Pressable onPress={() => router.replace('/')} style={styles.backButton}>
            <ThemedText style={styles.backButtonText}>Back to Reports</ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor }]} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: conversation.title,
          headerShown: true,
          headerBackTitle: 'Reports',
        }}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(it) => it.id}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={scrollToEnd}
          renderItem={({ item }) => {
            if (item.kind === 'summary') {
              return (
                <View style={styles.summaryWrapper}>
                  <ReportSummaryView
                    summary={conversation.summary}
                    modelLabel={settings.model}
                  />
                </View>
              );
            }
            if (item.kind === 'pending') {
              return (
                <View style={[styles.bubbleRow, styles.bubbleRowAssistant]}>
                  <View style={[styles.bubble, styles.assistantBubble]}>
                    <ActivityIndicator size="small" color="#5856D6" />
                  </View>
                </View>
              );
            }
            return <MessageBubble message={item.message} textColor={textColor} />;
          }}
        />

        <View style={[styles.inputBar, { borderTopColor: '#D1D1D6' }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Ask a follow-up question…"
            placeholderTextColor={iconColor}
            multiline
            style={[styles.input, { color: textColor }]}
            editable={!isSending}
          />
          <Pressable
            onPress={handleSend}
            disabled={!draft.trim() || isSending}
            style={[
              styles.sendButton,
              (!draft.trim() || isSending) && styles.sendButtonDisabled,
            ]}
            accessibilityLabel="Send message"
          >
            <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MessageBubble({
  message,
  textColor,
}: {
  message: ChatMessage;
  textColor: string;
}) {
  const isUser = message.role === 'user';
  return (
    <View
      style={[
        styles.bubbleRow,
        isUser ? styles.bubbleRowUser : styles.bubbleRowAssistant,
      ]}
    >
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        <ThemedText
          style={[
            styles.bubbleText,
            { color: isUser ? '#FFFFFF' : textColor },
          ]}
        >
          {message.content}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 12,
  },
  notFound: {
    fontSize: 15,
    color: '#8E8E93',
    textAlign: 'center',
  },
  backButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  listContent: {
    padding: 14,
    gap: 8,
    paddingBottom: 16,
  },
  summaryWrapper: {
    alignItems: 'center',
    marginBottom: 8,
  },
  bubbleRow: {
    flexDirection: 'row',
    marginVertical: 4,
  },
  bubbleRowUser: {
    justifyContent: 'flex-end',
  },
  bubbleRowAssistant: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  userBubble: {
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: '#F2F2F7',
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 21,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  input: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 120,
  },
  sendButton: {
    backgroundColor: '#007AFF',
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
});
