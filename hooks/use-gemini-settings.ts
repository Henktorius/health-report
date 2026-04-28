import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { DEFAULT_GEMINI_MODEL } from '@/lib/gemini';

const API_KEY_STORAGE_KEY = 'gemini_api_key';
const MODEL_STORAGE_KEY = 'gemini_model';

export interface GeminiSettings {
  apiKey: string;
  model: string;
}

export interface UseGeminiSettings {
  settings: GeminiSettings;
  isLoading: boolean;
  isConfigured: boolean;
  reload: () => Promise<void>;
  save: (next: GeminiSettings) => Promise<void>;
  clear: () => Promise<void>;
}

const EMPTY: GeminiSettings = { apiKey: '', model: DEFAULT_GEMINI_MODEL };

// expo-secure-store throws on web — fall back to localStorage there so the
// settings screen at least functions during web development. Never relied on
// for actual key security; the production targets are iOS and Android.
async function readItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

async function writeItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export function useGeminiSettings(): UseGeminiSettings {
  const [settings, setSettings] = useState<GeminiSettings>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    setIsLoading(true);
    try {
      const [apiKey, model] = await Promise.all([
        readItem(API_KEY_STORAGE_KEY),
        readItem(MODEL_STORAGE_KEY),
      ]);
      setSettings({
        apiKey: apiKey ?? '',
        model: model && model.trim() ? model : DEFAULT_GEMINI_MODEL,
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const save = useCallback(async (next: GeminiSettings) => {
    const apiKey = next.apiKey.trim();
    const model = next.model.trim() || DEFAULT_GEMINI_MODEL;

    if (apiKey) {
      await writeItem(API_KEY_STORAGE_KEY, apiKey);
    } else {
      await deleteItem(API_KEY_STORAGE_KEY);
    }
    await writeItem(MODEL_STORAGE_KEY, model);

    setSettings({ apiKey, model });
  }, []);

  const clear = useCallback(async () => {
    await Promise.all([deleteItem(API_KEY_STORAGE_KEY), deleteItem(MODEL_STORAGE_KEY)]);
    setSettings(EMPTY);
  }, []);

  return {
    settings,
    isLoading,
    isConfigured: settings.apiKey.length > 0,
    reload,
    save,
    clear,
  };
}
