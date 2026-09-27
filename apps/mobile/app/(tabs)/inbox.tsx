/**
 * Team Inbox screen — Task 34.1, 34.3
 * Shows unified conversation queue with real-time updates.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { inboxApi, Conversation } from '../../src/lib/api';
import { useAuth } from '../../src/context/AuthContext';

const CHANNEL_COLORS: Record<string, string> = {
  email: '#3b82f6',
  sms: '#10b981',
  live_chat: '#8b5cf6',
  whatsapp: '#22c55e',
  facebook: '#1d4ed8',
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  pending: 'Pending',
  resolved: 'Resolved',
  snoozed: 'Snoozed',
};

function ConversationItem({ item, onPress }: { item: Conversation; onPress: () => void }) {
  const channelColor = CHANNEL_COLORS[item.channel] ?? '#6b7280';
  return (
    <TouchableOpacity style={styles.item} onPress={onPress}>
      <View style={[styles.channelDot, { backgroundColor: channelColor }]} />
      <View style={styles.itemContent}>
        <View style={styles.itemHeader}>
          <Text style={styles.contactName}>{item.contactName}</Text>
          <Text style={styles.timestamp}>{new Date(item.updatedAt).toLocaleTimeString()}</Text>
        </View>
        <Text style={styles.preview} numberOfLines={1}>{item.lastMessage}</Text>
        <View style={styles.itemFooter}>
          <Text style={[styles.channelTag, { color: channelColor }]}>{item.channel}</Text>
          <Text style={styles.statusTag}>{STATUS_LABELS[item.status] ?? item.status}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function InboxScreen() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { canSendMessages } = useAuth();
  const router = useRouter();

  const load = useCallback(async () => {
    try {
      const data = await inboxApi.list({ status: 'open' });
      setConversations(data.conversations);
    } catch (err) {
      console.error('Failed to load inbox:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Team Inbox" />
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.conversationId}
        renderItem={({ item }) => (
          <ConversationItem
            item={item}
            onPress={() => {
              if (canSendMessages) {
                router.push(`/conversation/${item.conversationId}`);
              }
            }}
          />
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No open conversations</Text>
          </View>
        }
        contentContainerStyle={conversations.length === 0 ? styles.emptyContainer : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  item: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 10,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  channelDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4, marginRight: 10 },
  itemContent: { flex: 1 },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  contactName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  timestamp: { fontSize: 12, color: '#9ca3af' },
  preview: { fontSize: 14, color: '#6b7280', marginBottom: 6 },
  itemFooter: { flexDirection: 'row', gap: 8 },
  channelTag: { fontSize: 12, fontWeight: '500', textTransform: 'capitalize' },
  statusTag: { fontSize: 12, color: '#9ca3af' },
  empty: { alignItems: 'center', paddingTop: 40 },
  emptyText: { color: '#9ca3af', fontSize: 16 },
  emptyContainer: { flex: 1 },
});
