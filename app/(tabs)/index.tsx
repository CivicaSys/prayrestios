import { VerseOverlay } from '@/components/prayer/VerseOverlay';
import { profileAtom } from '@/lib/atoms';
import { submitPrayer, type PrayerResult } from '@/lib/prayer';
import { useAtomValue } from 'jotai';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity } from 'react-native';

export default function PrayScreen() {
  const profile = useAtomValue(profileAtom);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PrayerResult | null>(null);

  const handleAmen = async () => {
    if (!content.trim() || !profile) return;
    setSubmitting(true);
    try {
      const prayerResult = await submitPrayer(content.trim(), profile.preferredTranslation);
      setResult(prayerResult);
      setContent('');
    } catch {
      Alert.alert('Something went wrong', 'We could not save your prayer. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={styles.heading}>What's on your heart today?</Text>
      <TextInput
        style={styles.input}
        multiline
        placeholder="Tell God about what's on your heart..."
        placeholderTextColor="#9C8A72"
        value={content}
        onChangeText={setContent}
      />
      <TouchableOpacity
        style={[styles.amenButton, (!content.trim() || submitting || !profile) && styles.amenButtonDisabled]}
        onPress={handleAmen}
        disabled={!content.trim() || submitting || !profile}
      >
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.amenButtonText}>Amen</Text>}
      </TouchableOpacity>

      {result && <VerseOverlay result={result} onClose={() => setResult(null)} />}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FDF8F0', padding: 24, justifyContent: 'center' },
  heading: { fontSize: 24, fontWeight: '600', color: '#3D2E1F', textAlign: 'center', marginBottom: 24 },
  input: { backgroundColor: '#fff', borderRadius: 16, padding: 20, fontSize: 18, minHeight: 160, textAlignVertical: 'top', color: '#3D2E1F' },
  amenButton: { backgroundColor: '#D4A853', borderRadius: 24, paddingVertical: 18, marginTop: 24, alignItems: 'center' },
  amenButtonDisabled: { opacity: 0.5 },
  amenButtonText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
});
