import { supabase } from '@/lib/supabase';
import { useFocusEffect } from '@react-navigation/native';
import * as Speech from 'expo-speech';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

interface PrayerRow {
  id: string;
  content: string;
  is_answered: boolean;
  answered_note: string | null;
  created_at: string;
}

interface VerseRow {
  id: string;
  reference: string;
  verse_text: string;
  explanation: string | null;
  sort_order: number;
}

export default function HistoryScreen() {
  const [prayers, setPrayers] = useState<PrayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [versesByPrayer, setVersesByPrayer] = useState<Record<string, VerseRow[]>>({});
  const [noteDraft, setNoteDraft] = useState('');

  const loadPrayers = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('prayers')
      .select('id, content, is_answered, answered_note, created_at')
      .order('created_at', { ascending: false });
    if (!error && data) setPrayers(data);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadPrayers();
    }, [loadPrayers]),
  );

  const toggleExpand = async (prayerId: string) => {
    if (expandedId === prayerId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(prayerId);
    if (!versesByPrayer[prayerId]) {
      const { data } = await supabase
        .from('prayer_verses')
        .select('id, reference, verse_text, explanation, sort_order')
        .eq('prayer_id', prayerId)
        .order('sort_order');
      setVersesByPrayer((prev) => ({ ...prev, [prayerId]: data ?? [] }));
    }
  };

  const markAnswered = async (prayerId: string) => {
    const { error } = await supabase
      .from('prayers')
      .update({ is_answered: true, answered_at: new Date().toISOString(), answered_note: noteDraft.trim() || null })
      .eq('id', prayerId);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setNoteDraft('');
    loadPrayers();
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#D4A853" />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      data={prayers}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      ListEmptyComponent={
        <Text style={styles.emptyText}>Your prayer journey starts with one prayer. Go ahead — He's listening.</Text>
      }
      renderItem={({ item }) => {
        const expanded = expandedId === item.id;
        return (
          <TouchableOpacity style={styles.card} onPress={() => toggleExpand(item.id)} activeOpacity={0.85}>
            <View style={styles.cardHeader}>
              <Text style={styles.date}>{new Date(item.created_at).toLocaleDateString()}</Text>
              {item.is_answered && <Text style={styles.answeredBadge}>Answered</Text>}
            </View>
            <Text style={styles.content} numberOfLines={expanded ? undefined : 2}>
              {item.content}
            </Text>

            {expanded && (
              <View style={styles.expandedSection}>
                {(versesByPrayer[item.id] ?? []).map((verse) => (
                  <View key={verse.id} style={styles.verseBlock}>
                    <Text style={styles.reference}>{verse.reference}</Text>
                    <Text style={styles.verseText}>{verse.verse_text}</Text>
                    <TouchableOpacity onPress={() => Speech.speak(verse.verse_text)}>
                      <Text style={styles.listenLink}>Listen</Text>
                    </TouchableOpacity>
                  </View>
                ))}

                {item.is_answered ? (
                  item.answered_note && <Text style={styles.answeredNote}>{item.answered_note}</Text>
                ) : (
                  <View style={styles.markAnsweredRow}>
                    <TextInput
                      style={styles.noteInput}
                      placeholder="How was this answered? (optional)"
                      value={noteDraft}
                      onChangeText={setNoteDraft}
                    />
                    <TouchableOpacity style={styles.markButton} onPress={() => markAnswered(item.id)}>
                      <Text style={styles.markButtonText}>Mark Answered</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </TouchableOpacity>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FDF8F0' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FDF8F0' },
  listContent: { padding: 16 },
  emptyText: { textAlign: 'center', color: '#6B5A45', fontSize: 16, marginTop: 60, paddingHorizontal: 32 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  date: { fontSize: 12, color: '#9C8A72' },
  answeredBadge: { fontSize: 12, fontWeight: 'bold', color: '#6B8E23' },
  content: { fontSize: 16, color: '#3D2E1F' },
  expandedSection: { marginTop: 16, borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 16 },
  verseBlock: { marginBottom: 12 },
  reference: { fontSize: 14, fontWeight: 'bold', color: '#C47B3A' },
  verseText: { fontSize: 14, color: '#3D2E1F', marginTop: 4 },
  listenLink: { fontSize: 13, color: '#C47B3A', marginTop: 4, textDecorationLine: 'underline' },
  answeredNote: { fontSize: 14, color: '#6B8E23', fontStyle: 'italic', marginTop: 4 },
  markAnsweredRow: { marginTop: 8 },
  noteInput: { backgroundColor: '#f7f2e9', borderRadius: 10, padding: 10, fontSize: 14, marginBottom: 8 },
  markButton: { backgroundColor: '#6B8E23', borderRadius: 14, paddingVertical: 10, alignItems: 'center' },
  markButtonText: { color: '#fff', fontWeight: 'bold' },
});
