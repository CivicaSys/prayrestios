import { quizAnswersAtom } from '@/lib/atoms';
import { useRouter } from 'expo-router';
import { useAtom } from 'jotai';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function QuizCommitment() {
  const router = useRouter();
  const [, setQuizAnswers] = useAtom(quizAnswersAtom);

  const handleAnswer = (committed: boolean) => {
    setQuizAnswers((prev) => ({ ...prev, committed }));
    router.push('/paywall');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Are you ready to make prayer a daily habit?</Text>
      <TouchableOpacity style={styles.button} onPress={() => handleAnswer(true)}>
        <Text style={styles.buttonText}>Yes, I&apos;m ready</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.buttonSecondary} onPress={() => handleAnswer(false)}>
        <Text style={styles.buttonSecondaryText}>Not sure yet</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#FDF8F0' },
  title: { fontSize: 26, fontWeight: 'bold', color: '#3D2E1F', textAlign: 'center', marginBottom: 32 },
  button: { backgroundColor: '#D4A853', paddingVertical: 16, borderRadius: 20, alignItems: 'center', marginBottom: 12 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  buttonSecondary: { paddingVertical: 16, borderRadius: 20, alignItems: 'center' },
  buttonSecondaryText: { color: '#6B5A45', fontSize: 16 },
});
