/**
 * Live Chat operator interface — Task 34.1, 34.3
 * Operators can send/receive messages and add internal notes.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { inboxApi, liveChatApi, Conversation } from '../../src/lib/api';
import { useAuth } from '../../src/context/AuthContext';
import { useConnectionQuality } from '../../src/hooks/useConnectionQuality';

interface Message {
  id: string;
  content: string;
  sender: 'operator' | 'customer' | 'note';
  timestamp: string;
}

function MessageBubble({ message }: { message: Message }) {
  const isOperator = message.sender === 'operator';
  const isNote = message.sender === 'note';

  return (
    <View
      style={[
        styles.bubble,
        isOperator && styles.operatorBubble,
        isNote && styles.noteBubble,
      ]}
    >
      {isNote && <Text style={styles.noteLabel}>Internal Note</Text>}
      <Text style={[styles.bubbleText, isOperator && styles.operatorText]}>
        {message.content}
      </Text>
      <Text style={[styles.bubbleTime, isOperator && styles.operatorTime]}>
        {new Date(message.timestamp).toLocaleTimeString()}
      </Text>
    </View>
  );
}

export default function LiveChatScreen() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isNote, setIsNote] = useState(false);
  const [loading, setLoading] = useState(true);
  const { canSendMessages } = useAuth();
  const { enqueueAction } = useConnectionQuality();
  const flatListRef = useRef<FlatList<Message>>(null);

  const loadConversations = useCallback(async () => {
    try {
      const data = await inboxApi.list({ status: 'open', channel: 'live_chat' });
      setConversations(data.conversations);
    } catch (err) {
      console.error('Failed to load live chat conversations:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const handleSend = () => {
    if (!input.trim() || !activeConversation || !canSendMessages) return;

    const content = input.trim();
    setInput('');
    const noteMode = isNote;

    const optimisticMsg: Message = {
      id: Date.now().toString(),
      content,
      sender: noteMode ? 'note' : 'operator',
      timestamp: new Date().toISOString(),
    };
    setMessages((prev: Message[]) => [...prev, optimisticMsg]);

    // Queue action for offline retry (Task 34.4)
    enqueueAction(`send-${optimisticMsg.id}`, async () => {
      if (noteMode) {
        await liveChatApi.addNote(activeConversation.conversationId, content);
      } else {
        await liveChatApi.sendMessage(activeConversation.conversationId, content);
      }
    });

    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  if (!activeConversation) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Live Chat" />
        <FlatList<Conversation>
          data={conversations}
          keyExtractor={(item: Conversation) => item.conversationId}
          renderItem={({ item }: { item: Conversation }) => (
            <TouchableOpacity
              style={styles.convItem}
              onPress={() => setActiveConversation(item)}
            >
              <Text style={styles.convName}>{item.contactName}</Text>
              <Text style={styles.convPreview} numberOfLines={1}>{item.lastMessage}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No active live chat sessions</Text>
            </View>
          }
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScreenHeader title={activeConversation.contactName} />
      <TouchableOpacity style={styles.backButton} onPress={() => setActiveConversation(null)}>
        <Text style={styles.backText}>← Back to conversations</Text>
      </TouchableOpacity>

      <FlatList<Message>
        ref={flatListRef}
        data={messages}
        keyExtractor={(item: Message) => item.id}
        renderItem={({ item }: { item: Message }) => <MessageBubble message={item} />}
        contentContainerStyle={styles.messageList}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No messages yet</Text>
          </View>
        }
      />

      {canSendMessages && (
        <View style={styles.inputArea}>
          <TouchableOpacity
            style={[styles.noteToggle, isNote && styles.noteToggleActive]}
            onPress={() => setIsNote((v: boolean) => !v)}
          >
            <Text style={[styles.noteToggleText, isNote && styles.noteToggleTextActive]}>
              Note
            </Text>
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            placeholder={isNote ? 'Add internal note...' : 'Type a message...'}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            style={[styles.sendButton, !input.trim() && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!input.trim()}
          >
            <Text style={styles.sendText}>Send</Text>
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  convItem: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 10,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  convName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  convPreview: { fontSize: 13, color: '#6b7280', marginTop: 4 },
  backButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  backText: { color: '#6366f1', fontSize: 14 },
  messageList: { padding: 16, gap: 8 },
  bubble: {
    maxWidth: '75%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    alignSelf: 'flex-start',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
    marginBottom: 8,
  },
  operatorBubble: { backgroundColor: '#6366f1', alignSelf: 'flex-end' },
  noteBubble: { backgroundColor: '#fef3c7', borderWidth: 1, borderColor: '#fcd34d' },
  noteLabel: { fontSize: 10, color: '#92400e', fontWeight: '600', marginBottom: 4 },
  bubbleText: { fontSize: 14, color: '#111827' },
  operatorText: { color: '#fff' },
  bubbleTime: { fontSize: 10, color: '#9ca3af', marginTop: 4, alignSelf: 'flex-end' },
  operatorTime: { color: 'rgba(255,255,255,0.7)' },
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
  sendButton: {
    backgroundColor: '#6366f1',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sendButtonDisabled: { backgroundColor: '#c7d2fe' },
  sendText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  empty: { alignItems: 'center', paddingTop: 40 },
  emptyText: { color: '#9ca3af', fontSize: 16 },
});
