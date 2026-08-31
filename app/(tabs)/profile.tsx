import { profileAtom, type TranslationCode } from '@/lib/atoms';
import { supabase } from '@/lib/supabase';
import { useAtom } from 'jotai';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const TRANSLATIONS: { code: TranslationCode; label: string }[] = [
  { code: 'kjv', label: 'King James Version' },
  { code: 'asv', label: 'American Standard Version' },
  { code: 'web', label: 'World English Bible' },
];

export default function ProfileScreen() {
  const [profile, setProfile] = useAtom(profileAtom);
  const [saving, setSaving] = useState(false);

  const changeTranslation = async (code: TranslationCode) => {
    if (!profile || code === profile.preferredTranslation) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ preferred_translation: code }).eq('id', profile.id);
    setSaving(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setProfile({ ...profile, preferredTranslation: code });
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (!profile) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.name}>{profile.displayName}</Text>

      <Text style={styles.sectionTitle}>Preferred Translation</Text>
      {TRANSLATIONS.map((t) => (
        <TouchableOpacity
          key={t.code}
          style={[styles.option, profile.preferredTranslation === t.code && styles.optionSelected]}
          onPress={() => changeTranslation(t.code)}
          disabled={saving}
        >
          <Text style={styles.optionText}>{t.label}</Text>
        </TouchableOpacity>
      ))}

      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FDF8F0', padding: 24 },
  name: { fontSize: 24, fontWeight: 'bold', color: '#3D2E1F', marginBottom: 24, textAlign: 'center' },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', color: '#6B5A45', marginBottom: 12, textTransform: 'uppercase' },
  option: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 2, borderColor: '#eee' },
  optionSelected: { borderColor: '#D4A853', backgroundColor: '#FFF8E7' },
  optionText: { fontSize: 16, color: '#3D2E1F' },
  signOutButton: { marginTop: 40, alignItems: 'center' },
  signOutText: { color: '#C47B3A', fontSize: 16, fontWeight: 'bold' },
});
