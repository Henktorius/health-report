import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useGeminiSettings } from '@/hooks/use-gemini-settings';
import { DEFAULT_GEMINI_MODEL } from '@/lib/gemini';

const AI_STUDIO_URL = 'https://aistudio.google.com/app/apikey';

export default function SettingsScreen() {
  const { settings, isLoading, save, clear } = useGeminiSettings();
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const iconColor = useThemeColor({}, 'icon');

  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(DEFAULT_GEMINI_MODEL);
  const [showKey, setShowKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!isLoading) {
      setApiKey(settings.apiKey);
      setModel(settings.model);
    }
  }, [isLoading, settings.apiKey, settings.model]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await save({ apiKey, model });
      setSavedAt(Date.now());
    } catch (e: any) {
      Alert.alert('Save Failed', e?.message ?? 'Could not save settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = () => {
    Alert.alert(
      'Clear Gemini Settings?',
      'This will remove your stored API key and reset the model.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clear();
            setApiKey('');
            setModel(DEFAULT_GEMINI_MODEL);
            setSavedAt(null);
          },
        },
      ]
    );
  };

  const openAIStudio = () => {
    Linking.openURL(AI_STUDIO_URL).catch(() => {
      Alert.alert('Cannot Open Link', AI_STUDIO_URL);
    });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor }} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Settings', headerShown: true }} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <ThemedView style={styles.container}>
          <ThemedText type="subtitle">Google Gemini</ThemedText>
          <ThemedText style={[styles.description, { color: iconColor }]}>
            Provide your own Gemini API key to generate plain-language summaries of
            scanned reports. The key is stored on this device only.
          </ThemedText>

          <Pressable onPress={openAIStudio} style={styles.linkRow}>
            <Ionicons name="open-outline" size={16} color="#007AFF" />
            <ThemedText style={styles.linkText}>Get a key from Google AI Studio</ThemedText>
          </Pressable>

          <View style={styles.field}>
            <ThemedText style={[styles.label, { color: iconColor }]}>API Key</ThemedText>
            <View style={styles.inputRow}>
              <TextInput
                value={apiKey}
                onChangeText={setApiKey}
                placeholder="AIza…"
                placeholderTextColor={iconColor}
                secureTextEntry={!showKey}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                style={[styles.input, styles.inputWithIcon, { color: textColor }]}
              />
              <Pressable
                onPress={() => setShowKey((s) => !s)}
                style={styles.eyeButton}
                hitSlop={8}
              >
                <Ionicons
                  name={showKey ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={iconColor}
                />
              </Pressable>
            </View>
          </View>

          <View style={styles.field}>
            <ThemedText style={[styles.label, { color: iconColor }]}>Model</ThemedText>
            <TextInput
              value={model}
              onChangeText={setModel}
              placeholder={DEFAULT_GEMINI_MODEL}
              placeholderTextColor={iconColor}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              style={[styles.input, { color: textColor }]}
            />
            <ThemedText style={[styles.hint, { color: iconColor }]}>
              Default: {DEFAULT_GEMINI_MODEL}. Any model id available to your key works
              (e.g. gemini-2.5-pro, gemini-2.0-flash).
            </ThemedText>
          </View>

          <Pressable
            onPress={handleSave}
            style={[styles.button, isSaving && styles.buttonDisabled]}
            disabled={isSaving || isLoading}
          >
            {isSaving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <ThemedText style={styles.buttonText}>Save</ThemedText>
            )}
          </Pressable>

          {savedAt && (
            <ThemedText style={[styles.savedHint, { color: iconColor }]}>
              Saved.
            </ThemedText>
          )}

          <Pressable onPress={handleClear} style={[styles.button, styles.dangerButton]}>
            <ThemedText style={[styles.buttonText, styles.dangerButtonText]}>
              Clear Stored Key
            </ThemedText>
          </Pressable>
        </ThemedView>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1 },
  container: {
    flex: 1,
    padding: 20,
    gap: 16,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  linkText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
  field: { gap: 6 },
  label: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  inputRow: {
    position: 'relative',
    justifyContent: 'center',
  },
  input: {
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  inputWithIcon: {
    paddingRight: 44,
  },
  eyeButton: {
    position: 'absolute',
    right: 12,
    padding: 4,
  },
  hint: {
    fontSize: 12,
    lineHeight: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  savedHint: {
    fontSize: 13,
    textAlign: 'center',
  },
  dangerButton: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#FF3B30',
  },
  dangerButtonText: {
    color: '#FF3B30',
  },
});
