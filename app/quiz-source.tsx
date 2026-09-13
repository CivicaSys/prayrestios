import { quizAnswersAtom } from '@/lib/atoms';
import { useRouter } from 'expo-router';
import { useAtom } from 'jotai';
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const SOURCES = ['App Store search', 'Friend or family', 'Social media', 'Church', 'Other'];

export default function QuizSource() {
  const router = useRouter();
  const [, setQuizAnswers] = useAtom(quizAnswersAtom);
  const [selected, setSelected] = useState<string | null>(null);

  const handleNext = () => {
    if (!selected) return;
    setQuizAnswers((prev) => ({ ...prev, source: selected }));
    router.push('/quiz-commitment');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>How did you hear about PrayRest?</Text>
      {SOURCES.map((source) => (
        <TouchableOpacity
          key={source}
          style={[styles.card, selected === source && styles.cardSelected]}
          onPress={() => setSelected(source)}
        >
          <Text style={styles.cardText}>{source}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity
        style={[styles.button, !selected && styles.buttonDisabled]}
        onPress={handleNext}
        disabled={!selected}
      >
        <Text style={styles.buttonText}>Continue</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#FDF8F0' },
  title: { fontSize: 26, fontWeight: 'bold', color: '#3D2E1F', textAlign: 'center', marginBottom: 24 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 2, borderColor: 'transparent' },
  cardSelected: { borderColor: '#D4A853' },
  cardText: { fontSize: 16, color: '#3D2E1F' },
  button: { backgroundColor: '#D4A853', paddingVertical: 16, borderRadius: 20, alignItems: 'center', marginTop: 12 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});
