import { useCallback, useState } from 'react';
import {
  StyleSheet,
  Image,
  Pressable,
  Alert,
  ScrollView,
  View,
  ActivityIndicator,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Link, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useGeminiSettings } from '@/hooks/use-gemini-settings';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import TextRecognition from '@react-native-ml-kit/text-recognition';

import { GeminiError, summarizeReport, type ReportSummary } from '@/lib/gemini';
import { ReportSummaryView } from '@/components/report-summary-view';

export default function IndexScreen() {
  const [image, setImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);

  const backgroundColor = useThemeColor({}, 'background');
  const iconColor = useThemeColor({}, 'icon');

  const router = useRouter();
  const { settings, isConfigured, reload } = useGeminiSettings();

  // Refresh settings when returning from the settings screen so isConfigured
  // and the active model reflect what the user just saved.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const processImage = async (uri: string) => {
    setImage(uri);
    setExtractedText(null);
    setSummary(null);
    setIsProcessing(true);

    try {
      const result = await TextRecognition.recognize(uri);
      const text = result.text.trim();

      if (!text) {
        Alert.alert('No Text Found', 'Could not detect any text. Try a clearer, well-lit photo.');
      } else {
        setExtractedText(text);
      }
    } catch (e: any) {
      console.error('OCR failed:', e);
      Alert.alert('OCR Error', e?.message ?? 'Failed to process the image.');
    } finally {
      setIsProcessing(false);
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
      await processImage(result.assets[0].uri);
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
      await processImage(result.assets[0].uri);
    }
  };

  const generateSummary = async () => {
    if (!extractedText) return;

    if (!isConfigured) {
      Alert.alert(
        'Gemini Not Configured',
        'Add your API key in Settings to generate a summary.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => router.push('/settings') },
        ]
      );
      return;
    }

    setIsSummarizing(true);
    setSummary(null);
    try {
      const { summary: parsed } = await summarizeReport({
        apiKey: settings.apiKey,
        model: settings.model,
        reportText: extractedText,
      });
      setSummary(parsed);
    } catch (e: any) {
      const message =
        e instanceof GeminiError
          ? e.message
          : e?.message ?? 'Failed to generate summary.';
      Alert.alert('Summary Failed', message);
    } finally {
      setIsSummarizing(false);
    }
  };

  const reset = () => {
    setImage(null);
    setExtractedText(null);
    setSummary(null);
  };

  const isIdle = !image;
  const isDone = !!image && !isProcessing;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor }}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.push('/settings')}
          style={styles.iconButton}
          hitSlop={10}
          accessibilityLabel="Open settings"
        >
          <Ionicons name="settings-outline" size={24} color={iconColor} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <ThemedView style={styles.container}>

          {isIdle ? (
            <Image source={require('@/assets/images/icon.png')} style={styles.logo} />
          ) : (
            <View style={styles.previewContainer}>
              <Image source={{ uri: image }} style={styles.preview} />
              {isProcessing && (
                <View style={styles.loaderOverlay}>
                  <ActivityIndicator size="large" color="#007AFF" />
                  <ThemedText style={styles.loaderText}>Reading text…</ThemedText>
                </View>
              )}
            </View>
          )}

          <ThemedText style={styles.title} type="title">
            {isIdle ? 'Your Health Journey Starts Here'
              : isProcessing ? 'Analyzing Report…'
              : 'Report Captured!'}
          </ThemedText>

          <ThemedText style={styles.subtitle}>
            {isIdle
              ? 'Track your progress, achieve your goals, and live a healthier life.'
              : isProcessing
              ? 'Please wait while we extract text from your report.'
              : 'Generate a plain-language summary or scan another report.'}
          </ThemedText>

          {isDone && extractedText && (
            <View style={styles.textContainer}>
              <ThemedText style={styles.textLabel}>Extracted Text</ThemedText>
              <ThemedText style={styles.extractedText}>{extractedText}</ThemedText>
            </View>
          )}

          {isDone && extractedText && (
            <Pressable
              onPress={generateSummary}
              disabled={isSummarizing}
              style={[
                styles.button,
                styles.summaryButton,
                isSummarizing && styles.buttonDisabled,
              ]}
            >
              {isSummarizing ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <ThemedText style={styles.buttonText}>
                  {isConfigured ? 'Generate Summary with Gemini' : 'Set Up Gemini to Summarize'}
                </ThemedText>
              )}
            </Pressable>
          )}

          {summary && (
            <ReportSummaryView summary={summary} modelLabel={settings.model} />
          )}

          {!isProcessing && (
            <>
              <Link href="/home" asChild>
                <Pressable style={styles.button}>
                  <ThemedText style={styles.buttonText}>Get Started</ThemedText>
                </Pressable>
              </Link>

              <Pressable
                onPress={takePicture}
                style={[styles.button, styles.secondaryButton]}
              >
                <ThemedText style={styles.buttonText}>
                  {isIdle ? 'Scan with Camera' : 'Take New Photo'}
                </ThemedText>
              </Pressable>

              <Pressable
                onPress={pickFromGallery}
                style={[styles.button, styles.ghostButton]}
              >
                <ThemedText style={[styles.buttonText, styles.ghostButtonText]}>
                  {isIdle ? 'Upload from Gallery' : 'Choose Different Photo'}
                </ThemedText>
              </Pressable>

              {!isIdle && (
                <Pressable onPress={reset} style={[styles.button, styles.ghostButton]}>
                  <ThemedText style={[styles.buttonText, styles.ghostButtonText]}>
                    Clear
                  </ThemedText>
                </Pressable>
              )}
            </>
          )}

        </ThemedView>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  iconButton: {
    padding: 8,
  },
  scrollContainer: { flexGrow: 1 },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 40,
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: 30,
    resizeMode: 'contain',
  },
  previewContainer: {
    width: 260,
    height: 260,
    marginBottom: 30,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  preview: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
    backgroundColor: '#E5E5EA',
  },
  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
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
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 30,
    maxWidth: 300,
    lineHeight: 22,
  },
  textContainer: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#F2F2F7',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  textLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  extractedText: {
    fontSize: 14,
    lineHeight: 22,
    color: '#1C1C1E',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 12,
    marginTop: 12,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  buttonDisabled: { opacity: 0.7 },
  secondaryButton: { backgroundColor: '#34C759' },
  summaryButton: { backgroundColor: '#5856D6' },
  ghostButton: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#C7C7CC',
  },
  ghostButtonText: { color: '#8E8E93' },
});
