import { markOnboardingComplete } from '@/lib/onboarding';
import { profileAtom, type TranslationCode } from '@/lib/atoms';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import { useAtom } from 'jotai';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const TRANSLATIONS: { code: TranslationCode; label: string }[] = [
  { code: 'kjv', label: 'King James Version' },
  { code: 'asv', label: 'American Standard Version' },
  { code: 'web', label: 'World English Bible' },
];

export default function Onboarding() {
  const router = useRouter();
  const [profile, setProfile] = useAtom(profileAtom);
  const [selected, setSelected] = useState<TranslationCode>('kjv');
  const [saving, setSaving] = useState(false);

  const handleContinue = async () => {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ preferred_translation: selected })
      .eq('id', profile.id);
    setSaving(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setProfile({ ...profile, preferredTranslation: selected });
    await markOnboardingComplete(profile.id);
    router.replace('/(tabs)');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Choose your translation</Text>
      <Text style={styles.subtitle}>You can change this anytime in Profile.</Text>
      {TRANSLATIONS.map((t) => (
        <TouchableOpacity
          key={t.code}
          style={[styles.option, selected === t.code && styles.optionSelected]}
          onPress={() => setSelected(t.code)}
        >
          <Text style={styles.optionText}>{t.label}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity style={styles.button} onPress={handleContinue} disabled={saving || !profile}>
        <Text style={styles.buttonText}>{saving ? 'Saving...' : 'Continue'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#FDF8F0' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#3D2E1F', marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#6B5A45', marginBottom: 32, textAlign: 'center' },
  option: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 2, borderColor: '#eee' },
  optionSelected: { borderColor: '#D4A853', backgroundColor: '#FFF8E7' },
  optionText: { fontSize: 18, color: '#3D2E1F', textAlign: 'center' },
  button: { backgroundColor: '#D4A853', paddingVertical: 16, borderRadius: 20, marginTop: 24, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});
