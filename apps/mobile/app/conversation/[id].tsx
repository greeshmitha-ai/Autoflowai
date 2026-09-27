/**
 * Conversation detail screen — Task 34.3
 * Full operator chat interface for a specific conversation.
 */
import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { liveChatApi } from '../../src/lib/api';
import { useAuth } from '../../src/context/AuthContext';
import { useConnectionQuality } from '../../src/hooks/useConnectionQuality';
import { ConnectionQualityIndicator } from '../../src/components/ConnectionQualityIndicator';

interface Message {
  id: string;
  content: string;
  sender: 'operator' | 'customer' | 'note';
  timestamp: string;
}

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isNote, setIsNote] = useState(false);
  const { canSendMessages } = useAuth();
  const { quality, latencyMs, enqueueAction } = useConnectionQuality();
  const flatListRef = useRef<FlatList>(null);
  const router = useRouter();

  const handleSend = () => {
    if (!input.trim() || !canSendMessages) return;
    const content = input.trim();
    setInput('');

    const msg: Message = {
      id: Date.now().toString(),
      content,
      sender: isNote ? 'note' : 'operator',
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, msg]);

    enqueueAction(`msg-${msg.id}`, async () => {
      if (isNote) {
        await liveChatApi.addNote(id, content);
      } else {
        await liveChatApi.sendMessage(id, content);
      }
    });

    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Conversation</Text>
        <ConnectionQualityIndicator quality={quality} latencyMs={latencyMs} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messageList}
          renderItem={({ item }) => {
            const isOp = item.sender === 'operator';
            const isNoteMsg = item.sender === 'note';
            return (
              <View style={[styles.bubble, isOp && styles.opBubble, isNoteMsg && styles.noteBubble]}>
                {isNoteMsg && <Text style={styles.noteLabel}>Internal Note</Text>}
                <Text style={[styles.bubbleText, isOp && styles.opText]}>{item.content}</Text>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Start the conversation</Text>
            </View>
          }
        />

        {canSendMessages && (
          <View style={styles.inputArea}>
            <TouchableOpacity
              style={[styles.noteToggle, isNote && styles.noteToggleActive]}
              onPress={() => setIsNote((v) => !v)}
            >
              <Text style={[styles.noteToggleText, isNote && styles.noteToggleTextActive]}>Note</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.input}
              placeholder={isNote ? 'Internal note...' : 'Message...'}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={2000}
            />
            <TouchableOpacity
              style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!input.trim()}
            >
              <Text style={styles.sendText}>Send</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  back: { color: '#6366f1', fontSize: 16, minWidth: 60 },
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  messageList: { padding: 16, gap: 8 },
  bubble: {
    maxWidth: '75%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    alignSelf: 'flex-start',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  opBubble: { backgroundColor: '#6366f1', alignSelf: 'flex-end' },
  noteBubble: { backgroundColor: '#fef3c7', borderWidth: 1, borderColor: '#fcd34d' },
  noteLabel: { fontSize: 10, color: '#92400e', fontWeight: '600', marginBottom: 4 },
  bubbleText: { fontSize: 14, color: '#111827' },
  opText: { color: '#fff' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: '#9ca3af', fontSize: 15 },
  inputArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
    gap: 8,
  },
  noteToggle: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  noteToggleActive: { backgroundColor: '#fef3c7', borderColor: '#fcd34d' },
  noteToggleText: { fontSize: 12, color: '#6b7280' },
  noteToggleTextActive: { color: '#92400e' },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    maxHeight: 100,
    backgroundColor: '#f9fafb',
  },
  sendBtn: { backgroundColor: '#6366f1', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
  sendBtnDisabled: { backgroundColor: '#c7d2fe' },
  sendText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
