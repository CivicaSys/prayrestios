import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function RequestsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Prayer Requests</Text>
      <Text style={styles.body}>Sharing and praying for others' requests is coming in a future update.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FDF8F0', justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#3D2E1F', marginBottom: 12 },
  body: { fontSize: 15, color: '#6B5A45', textAlign: 'center' },
});
