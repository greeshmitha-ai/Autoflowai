/**
 * Contact detail screen — Task 34.3
 * View/edit contact, add internal notes. RBAC enforced.
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { contactsApi, Contact } from '../../src/lib/api';
import { useAuth } from '../../src/context/AuthContext';
import { ConnectionQualityIndicator } from '../../src/components/ConnectionQualityIndicator';
import { useConnectionQuality } from '../../src/hooks/useConnectionQuality';

export default function ContactDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const { canUpdateRecords } = useAuth();
  const { quality, latencyMs } = useConnectionQuality();
  const router = useRouter();

  useEffect(() => {
    contactsApi.get(id).then(setContact).catch(console.error).finally(() => setLoading(false));
  }, [id]);

  const handleAddNote = async () => {
    if (!note.trim() || !contact) return;
    setSaving(true);
    try {
      await contactsApi.addNote(contact.contactId, note.trim());
      setNote('');
      Alert.alert('Note added');
    } catch {
      Alert.alert('Error', 'Failed to add note');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  if (!contact) {
    return (
      <View style={styles.centered}>
        <Text>Contact not found</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <ConnectionQualityIndicator quality={quality} latencyMs={latencyMs} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{contact.fullName.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.name}>{contact.fullName}</Text>
        <Text style={styles.email}>{contact.email}</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Details</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Phone</Text>
            <Text style={styles.value}>{contact.phone || '—'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Lead Score</Text>
            <Text style={[styles.value, styles.score]}>{contact.leadScore}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Stage</Text>
            <Text style={styles.value}>{contact.lifecycleStage || '—'}</Text>
          </View>
        </View>

        {canUpdateRecords && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Add Internal Note</Text>
            <TextInput
              style={styles.noteInput}
              placeholder="Write a note..."
              value={note}
              onChangeText={setNote}
              multiline
              numberOfLines={3}
            />
            <TouchableOpacity
              style={[styles.button, (!note.trim() || saving) && styles.buttonDisabled]}
              onPress={handleAddNote}
              disabled={!note.trim() || saving}
            >
              <Text style={styles.buttonText}>{saving ? 'Saving...' : 'Add Note'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  back: { color: '#6366f1', fontSize: 16 },
  content: { padding: 24, alignItems: 'center' },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#e0e7ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: { fontSize: 28, fontWeight: '700', color: '#6366f1' },
  name: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 4 },
  email: { fontSize: 15, color: '#6b7280', marginBottom: 24 },
  section: { width: '100%', marginBottom: 24 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f3f4f6' },
  label: { fontSize: 14, color: '#6b7280' },
  value: { fontSize: 14, color: '#111827', fontWeight: '500' },
  score: { color: '#6366f1', fontWeight: '700' },
  noteInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  button: { backgroundColor: '#6366f1', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  buttonDisabled: { backgroundColor: '#c7d2fe' },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
