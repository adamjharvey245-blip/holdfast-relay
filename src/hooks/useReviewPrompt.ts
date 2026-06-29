import { useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';

const ACTIVATIONS_KEY = 'holdfast_watch_activations';
const PROMPT_COUNT_KEY = 'holdfast_review_prompt_count';
const LAST_PROMPTED_KEY = 'holdfast_review_last_prompted';
const HAS_RATED_KEY = 'holdfast_has_rated';

const MIN_ACTIVATIONS = 3;
const MAX_PROMPTS = 4;
const PROMPT_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function useReviewPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);

  const recordActivation = useCallback(async () => {
    try {
      const [rawCount, rawPrompts, rawLast, rawRated] = await Promise.all([
        AsyncStorage.getItem(ACTIVATIONS_KEY),
        AsyncStorage.getItem(PROMPT_COUNT_KEY),
        AsyncStorage.getItem(LAST_PROMPTED_KEY),
        AsyncStorage.getItem(HAS_RATED_KEY),
      ]);

      const activations = (parseInt(rawCount ?? '0', 10) || 0) + 1;
      const promptCount = parseInt(rawPrompts ?? '0', 10) || 0;
      const lastPrompted = rawLast ? parseInt(rawLast, 10) : null;
      const hasRated = rawRated === 'true';

      await AsyncStorage.setItem(ACTIVATIONS_KEY, String(activations));

      const now = Date.now();
      const dueForPrompt =
        !hasRated &&
        activations >= MIN_ACTIVATIONS &&
        promptCount < MAX_PROMPTS &&
        (lastPrompted === null || now - lastPrompted >= PROMPT_INTERVAL_MS);

      if (dueForPrompt) {
        setShowPrompt(true);
      }
    } catch (e) {
      // non-critical — silently ignore
    }
  }, []);

  const recordPromptShown = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(PROMPT_COUNT_KEY);
      const count = (parseInt(raw ?? '0', 10) || 0) + 1;
      await Promise.all([
        AsyncStorage.setItem(PROMPT_COUNT_KEY, String(count)),
        AsyncStorage.setItem(LAST_PROMPTED_KEY, String(Date.now())),
      ]);
    } catch (e) {}
  }, []);

  const handleEnjoyingApp = useCallback(async () => {
    setShowPrompt(false);
    await Promise.all([
      recordPromptShown(),
      AsyncStorage.setItem(HAS_RATED_KEY, 'true'),
    ]);
    if (await StoreReview.hasAction()) {
      await StoreReview.requestReview();
    }
  }, [recordPromptShown]);

  const handleNotEnjoyingApp = useCallback(async () => {
    setShowPrompt(false);
    await recordPromptShown();
  }, [recordPromptShown]);

  const dismissPrompt = useCallback(() => {
    setShowPrompt(false);
  }, []);

  return { showPrompt, recordActivation, handleEnjoyingApp, handleNotEnjoyingApp, dismissPrompt };
}
