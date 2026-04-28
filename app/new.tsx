import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useGeminiSettings } from '@/hooks/use-gemini-settings';
import { GeminiError, summarizeReport } from '@/lib/gemini';
import { createConversation } from '@/lib/conversations';

type Stage = 'idle' | 'ocr' | 'summarizing';

export default function NewConversationScreen() {
  const router = useRouter();
  const backgroundColor = useThemeColor({}, 'background');
  const iconColor = useThemeColor({}, 'icon');
  const { settings, isConfigured, reload } = useGeminiSettings();

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>('idle');

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const isWorking = stage !== 'idle';

  const runPipeline = async (uri: string) => {
    if (!isConfigured) {
      Alert.alert(
        'Gemini Not Configured',
        'Add your Gemini API key in Settings before scanning a report.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => router.push('/settings') },
        ]
      );
      return;
    }

    setImageUri(uri);
    setStage('ocr');

    let reportText = '';
    try {
      const result = await TextRecognition.recognize(uri);
      reportText = result.text.trim();
      if (!reportText) {
        Alert.alert(
          'No Text Found',
          'Could not detect any text in this photo. Try a clearer, well-lit shot.'
        );
        setStage('idle');
        setImageUri(null);
        return;
      }
    } catch (e: any) {
      console.error('OCR failed:', e);
      Alert.alert('OCR Error', e?.message ?? 'Failed to read text from the image.');
      setStage('idle');
      setImageUri(null);
      return;
    }

    setStage('summarizing');
    try {
      const { summary } = await summarizeReport({
        apiKey: settings.apiKey,
        model: settings.model,
        reportText,
      });
      const conv = await createConversation({
        reportText,
        reportImageUri: uri,
        summary,
      });
      router.replace(`/chat/${conv.id}` as any);
    } catch (e: any) {
      const message =
        e instanceof GeminiError
          ? e.message
          : e?.message ?? 'Failed to generate summary.';
      Alert.alert('Summary Failed', message);
      setStage('idle');
      setImageUri(null);
    }
  };

  const takePicture = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Camera permission is required to scan reports.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 1,
    });
    if (!result.canceled) {
      await runPipeline(result.assets[0].uri);
    }
  };

  const pickFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Denied',
        'Photo library access is required to upload reports.'
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 1,
    });
    if (!result.canceled) {
      await runPipeline(result.assets[0].uri);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor }} edges={['bottom']}>
      <Stack.Screen options={{ title: 'New Report', headerShown: true }} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ThemedView style={styles.container}>
          {imageUri ? (
            <View style={styles.previewContainer}>
              <Image source={{ uri: imageUri }} style={styles.preview} />
              {isWorking && (
                <View style={styles.loaderOverlay}>
                  <ActivityIndicator size="large" color="#007AFF" />
                  <ThemedText style={styles.loaderText}>
                    {stage === 'ocr' ? 'Reading text…' : 'Generating summary…'}
                  </ThemedText>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.placeholder}>
              <Ionicons name="image-outline" size={64} color={iconColor} />
            </View>
          )}

          <ThemedText type="title" style={styles.title}>
            {isWorking ? 'Analyzing Report…' : 'Upload Your Report'}
          </ThemedText>
          <ThemedText style={styles.subtitle}>
            {isWorking
              ? 'Hang tight while we extract the text and summarize it.'
              : 'Take a clear photo of your medical report or pick one from your gallery. We’ll extract the text and start a conversation about it.'}
          </ThemedText>

          {!isWorking && (
            <>
              <Pressable
                onPress={takePicture}
                style={[styles.button, styles.primaryButton]}
              >
                <Ionicons name="camera-outline" size={20} color="#FFFFFF" />
                <ThemedText style={styles.buttonText}>Scan with Camera</ThemedText>
              </Pressable>
              <Pressable
                onPress={pickFromGallery}
                style={[styles.button, styles.secondaryButton]}
              >
                <Ionicons name="images-outline" size={20} color="#FFFFFF" />
                <ThemedText style={styles.buttonText}>Upload from Gallery</ThemedText>
              </Pressable>
            </>
          )}

          {!isConfigured && !isWorking && (
            <Pressable
              onPress={() => router.push('/settings')}
              style={styles.settingsHint}
            >
              <Ionicons name="warning-outline" size={16} color="#B8420C" />
              <ThemedText style={styles.settingsHintText}>
                Gemini API key not set — tap to open settings.
              </ThemedText>
            </Pressable>
          )}
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
    alignItems: 'center',
    gap: 14,
  },
  placeholder: {
    width: 240,
    height: 240,
    borderRadius: 20,
    backgroundColor: '#E5E5EA',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  previewContainer: {
    width: 240,
    height: 240,
    marginTop: 12,
    marginBottom: 8,
    position: 'relative',
  },
  preview: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
    backgroundColor: '#E5E5EA',
  },
  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loaderText: {
    marginTop: 10,
    fontWeight: '600',
    color: '#007AFF',
  },
  title: {
    fontSize: 24,
    textAlign: 'center',
    marginTop: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 20,
    marginBottom: 8,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: '100%',
    maxWidth: 320,
  },
  primaryButton: { backgroundColor: '#34C759' },
  secondaryButton: { backgroundColor: '#007AFF' },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  settingsHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF4EC',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 12,
  },
  settingsHintText: {
    color: '#B8420C',
    fontSize: 13,
  },
});
