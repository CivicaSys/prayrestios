import { quizAnswersAtom } from '@/lib/atoms';
import { useRouter } from 'expo-router';
import { useAtom } from 'jotai';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';

const GOALS = [
  "Feel God's peace daily",
  'Build a consistent prayer habit',
  'Find verses for hard moments',
  'Track answered prayers',
  'Share prayer with others',
];

export default function QuizGoals() {
  const router = useRouter();
  const [, setQuizAnswers] = useAtom(quizAnswersAtom);
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (goal: string) => {
    setSelected((prev) => (prev.includes(goal) ? prev.filter((g) => g !== goal) : [...prev, goal]));
  };

  const handleNext = () => {
    setQuizAnswers((prev) => ({ ...prev, goals: selected }));
    router.push('/quiz-source');
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>What brings you to PrayRest?</Text>
      <Text style={styles.subtitle}>Choose all that apply</Text>
      {GOALS.map((goal) => (
        <TouchableOpacity
          key={goal}
          style={[styles.card, selected.includes(goal) && styles.cardSelected]}
          onPress={() => toggle(goal)}
        >
          <Text style={styles.cardText}>{goal}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity
        style={[styles.button, selected.length === 0 && styles.buttonDisabled]}
        onPress={handleNext}
        disabled={selected.length === 0}
      >
        <Text style={styles.buttonText}>Continue</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, backgroundColor: '#FDF8F0' },
  title: { fontSize: 26, fontWeight: 'bold', color: '#3D2E1F', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#6B5A45', textAlign: 'center', marginBottom: 24 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 2, borderColor: 'transparent' },
  cardSelected: { borderColor: '#D4A853' },
  cardText: { fontSize: 16, color: '#3D2E1F' },
  button: { backgroundColor: '#D4A853', paddingVertical: 16, borderRadius: 20, alignItems: 'center', marginTop: 12 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});
