/**
 * CRM Deal Board screen — Task 34.1, 34.3
 * Kanban-style deal board with stage columns.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { crmApi, DealStage, Deal } from '../../src/lib/api';
import { useAuth } from '../../src/context/AuthContext';

const DEFAULT_PIPELINE_ID = 'default'; // In production, fetch from user preferences

function DealCard({ deal, onPress }: { deal: Deal; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.dealCard} onPress={onPress}>
      <Text style={styles.dealName} numberOfLines={2}>{deal.name}</Text>
      <Text style={styles.dealValue}>${deal.value.toLocaleString()}</Text>
    </TouchableOpacity>
  );
}

function StageColumn({ stage, onDealPress }: { stage: DealStage; onDealPress: (deal: Deal) => void }) {
  return (
    <View style={styles.column}>
      <View style={styles.columnHeader}>
        <Text style={styles.columnTitle}>{stage.name}</Text>
        <Text style={styles.columnCount}>{stage.deals.length}</Text>
      </View>
      <Text style={styles.columnValue}>${stage.totalValue.toLocaleString()}</Text>
      {stage.deals.map((deal) => (
        <DealCard key={deal.dealId} deal={deal} onPress={() => onDealPress(deal)} />
      ))}
    </View>
  );
}

export default function CRMScreen() {
  const [stages, setStages] = useState<DealStage[]>([]);
  const [loading, setLoading] = useState(true);
  const { canViewCRM } = useAuth();
  const router = useRouter();

  const load = useCallback(async () => {
    if (!canViewCRM) return;
    try {
      const data = await crmApi.board(DEFAULT_PIPELINE_ID);
      setStages(data.stages);
    } catch (err) {
      console.error('Failed to load CRM board:', err);
    } finally {
      setLoading(false);
    }
  }, [canViewCRM]);

  useEffect(() => { load(); }, [load]);

  if (!canViewCRM) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permissionText}>You don't have access to CRM</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  const handleDealPress = (deal: Deal) => {
    router.push(`/deal/${deal.dealId}`);
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="CRM Pipeline" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.board}>
        {stages.map((stage) => (
          <StageColumn key={stage.stageId} stage={stage} onDealPress={handleDealPress} />
        ))}
        {stages.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No pipeline data</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  permissionText: { color: '#9ca3af', fontSize: 16 },
  board: { padding: 16, gap: 12 },
  column: {
    width: 220,
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    padding: 12,
  },
  columnHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  columnTitle: { fontSize: 14, fontWeight: '600', color: '#374151' },
  columnCount: {
    backgroundColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 12,
    color: '#6b7280',
  },
  columnValue: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 8 },
  dealCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  dealName: { fontSize: 14, fontWeight: '500', color: '#111827', marginBottom: 4 },
  dealValue: { fontSize: 13, color: '#6366f1', fontWeight: '600' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyText: { color: '#9ca3af', fontSize: 16 },
});
