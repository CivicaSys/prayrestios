import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function Welcome() {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <View style={styles.flexGrow} />
      <Text style={styles.title}>PrayRest</Text>
      <Text style={styles.subtitle}>Tell God about what's on your heart. Then rest, assured.</Text>
      <View style={styles.flexGrow} />
      <TouchableOpacity style={styles.button} onPress={() => router.push('/signup')}>
        <Text style={styles.buttonText}>Get Started</Text>
      </TouchableOpacity>
      <Pressable onPress={() => router.push('/login')}>
        <Text style={styles.signInText}>or Sign In here</Text>
      </Pressable>
      <View style={styles.spacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#FDF8F0' },
  spacer: { height: 40 },
  title: { fontSize: 40, fontWeight: 'bold', marginBottom: 12, textAlign: 'center', color: '#3D2E1F' },
  subtitle: { fontSize: 18, color: '#6B5A45', marginBottom: 32, textAlign: 'center', paddingHorizontal: 16 },
  flexGrow: { flex: 1 },
  button: { backgroundColor: '#D4A853', paddingVertical: 16, paddingHorizontal: 48, borderRadius: 20, marginBottom: 12, width: '100%' },
  buttonText: { color: '#fff', fontSize: 22, fontWeight: 'bold', textAlign: 'center' },
  signInText: { color: '#3D2E1F', fontSize: 16, textAlign: 'center', textDecorationLine: 'underline', marginBottom: 24 },
});
