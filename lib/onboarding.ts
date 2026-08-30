// lib/onboarding.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_PREFIX = 'prayrest_onboarded_';

export async function hasCompletedOnboarding(userId: string): Promise<boolean> {
  const value = await AsyncStorage.getItem(`${KEY_PREFIX}${userId}`);
  return value === 'true';
}

export async function markOnboardingComplete(userId: string): Promise<void> {
  await AsyncStorage.setItem(`${KEY_PREFIX}${userId}`, 'true');
}
