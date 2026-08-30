import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function VerifyEmail() {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Check your email</Text>
      <Text style={styles.body}>
        We sent you a confirmation link. Tap it to verify your email, then come back and log in.
      </Text>
      <TouchableOpacity style={styles.button} onPress={() => router.replace('/login')}>
        <Text style={styles.buttonText}>Back to Login</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#FDF8F0' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#3D2E1F', marginBottom: 16, textAlign: 'center' },
  body: { fontSize: 16, color: '#3D2E1F', textAlign: 'center', marginBottom: 32, lineHeight: 22 },
  button: { backgroundColor: '#D4A853', paddingVertical: 16, paddingHorizontal: 40, borderRadius: 20 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});
