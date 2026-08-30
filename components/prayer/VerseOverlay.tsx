import { buildAcknowledgment } from '@/lib/needAcknowledgment';
import type { PrayerResult } from '@/lib/prayer';
import * as Speech from 'expo-speech';
import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  result: PrayerResult;
  onClose: () => void;
}

const FALLBACK_MESSAGE = "We couldn't find verses right now, but God heard your prayer. Try again later.";

export function VerseOverlay({ result, onClose }: Props) {
  const [showMore, setShowMore] = useState(false);
  const [listening, setListening] = useState(false);
  const acknowledgment = buildAcknowledgment(result.detectedNeeds);

  useEffect(() => {
    return () => {
      Speech.stop();
    };
  }, []);

  const toggleListen = (verseText: string) => {
    if (listening) {
      Speech.stop();
      setListening(false);
      return;
    }
    setListening(true);
    Speech.speak(verseText, { onDone: () => setListening(false), onStopped: () => setListening(false) });
  };

  const handleClose = () => {
    Speech.stop();
    onClose();
  };

  const [firstVerse, ...restVerses] = result.verses;

  return (
    <Modal transparent animationType="fade">
      <View style={styles.backdrop}>
        <ScrollView style={styles.card} contentContainerStyle={styles.cardContent}>
          {acknowledgment && <Text style={styles.acknowledgment}>{acknowledgment}</Text>}

          {firstVerse ? (
            <View style={styles.verseBlock}>
              <Text style={styles.reference}>{firstVerse.reference}</Text>
              <Text style={styles.verseText}>{firstVerse.verseText}</Text>
              <Text style={styles.explanation}>{firstVerse.explanation}</Text>
              <View style={styles.listenRow}>
                <Text style={styles.listenLabel}>Listen</Text>
                <Switch value={listening} onValueChange={() => toggleListen(firstVerse.verseText)} />
              </View>
            </View>
          ) : (
            <Text style={styles.body}>{FALLBACK_MESSAGE}</Text>
          )}

          {restVerses.length > 0 && !showMore && (
            <TouchableOpacity onPress={() => setShowMore(true)}>
              <Text style={styles.moreLink}>MORE</Text>
            </TouchableOpacity>
          )}

          {showMore &&
            restVerses.map((verse) => (
              <View key={verse.reference} style={styles.verseBlock}>
                <Text style={styles.reference}>{verse.reference}</Text>
                <Text style={styles.verseText}>{verse.verseText}</Text>
                <Text style={styles.explanation}>{verse.explanation}</Text>
              </View>
            ))}

          <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
            <Text style={styles.closeButtonText}>Amen</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(61,46,31,0.4)', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#FFF8E7', borderRadius: 24, maxHeight: '80%' },
  cardContent: { padding: 24 },
  acknowledgment: { fontSize: 16, fontStyle: 'italic', color: '#3D2E1F', marginBottom: 20, textAlign: 'center' },
  verseBlock: { marginBottom: 20 },
  reference: { fontSize: 18, fontWeight: 'bold', color: '#C47B3A', marginBottom: 8 },
  verseText: { fontSize: 18, color: '#3D2E1F', lineHeight: 26, marginBottom: 8 },
  explanation: { fontSize: 14, color: '#6B5A45', fontStyle: 'italic' },
  listenRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  listenLabel: { fontSize: 14, color: '#3D2E1F', marginRight: 8 },
  moreLink: { fontSize: 14, fontWeight: 'bold', color: '#C47B3A', textAlign: 'center', marginBottom: 20 },
  body: { fontSize: 16, color: '#3D2E1F', textAlign: 'center', marginBottom: 20 },
  closeButton: { backgroundColor: '#D4A853', borderRadius: 20, paddingVertical: 16, alignItems: 'center' },
  closeButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});
