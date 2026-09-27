/**
 * Tasks screen — Task 34.1, 34.3
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
  Alert,
} from 'react-native';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { tasksApi, Task } from '../../src/lib/api';
import { useAuth } from '../../src/context/AuthContext';

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#ef4444',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#22c55e',
};

const STATUS_COLORS: Record<string, string> = {
  open: '#6366f1',
  completed: '#22c55e',
  overdue: '#ef4444',
};

function TaskItem({ item, onComplete }: { item: Task; onComplete: () => void }) {
  const isOverdue = item.status === 'overdue';
  return (
    <View style={[styles.item, isOverdue && styles.overdueItem]}>
      <TouchableOpacity
        style={[styles.checkbox, item.status === 'completed' && styles.checkboxDone]}
        onPress={onComplete}
      >
        {item.status === 'completed' && <Text style={styles.checkmark}>✓</Text>}
      </TouchableOpacity>
      <View style={styles.itemContent}>
        <Text style={[styles.title, item.status === 'completed' && styles.titleDone]}>
          {item.title}
        </Text>
        <View style={styles.meta}>
          <Text style={[styles.priority, { color: PRIORITY_COLORS[item.priority] }]}>
            {item.priority}
          </Text>
          <Text style={styles.dot}>·</Text>
          <Text style={[styles.status, { color: STATUS_COLORS[item.status] }]}>
            {item.status}
          </Text>
          {item.dueDate && (
            <>
              <Text style={styles.dot}>·</Text>
              <Text style={[styles.dueDate, isOverdue && styles.overdueDue]}>
                {new Date(item.dueDate).toLocaleDateString()}
              </Text>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

export default function TasksScreen() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { canUpdateRecords } = useAuth();

  const load = useCallback(async () => {
    try {
      const data = await tasksApi.list();
      setTasks(data.tasks);
    } catch (err) {
      console.error('Failed to load tasks:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleComplete = async (task: Task) => {
    if (!canUpdateRecords) {
      Alert.alert('Permission Denied', 'You do not have permission to update tasks.');
      return;
    }
    try {
      await tasksApi.update(task.taskId, { status: 'completed' });
      setTasks((prev) =>
        prev.map((t) => (t.taskId === task.taskId ? { ...t, status: 'completed' } : t)),
      );
    } catch (err) {
      Alert.alert('Error', 'Failed to update task');
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Tasks" />
      <FlatList
        data={tasks}
        keyExtractor={(item) => item.taskId}
        renderItem={({ item }) => (
          <TaskItem item={item} onComplete={() => handleComplete(item)} />
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No tasks</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
  overdueItem: { borderLeftWidth: 3, borderLeftColor: '#ef4444' },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#d1d5db',
    marginRight: 12,
    marginTop: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxDone: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  checkmark: { color: '#fff', fontSize: 12, fontWeight: '700' },
  itemContent: { flex: 1 },
  title: { fontSize: 15, fontWeight: '500', color: '#111827' },
  titleDone: { textDecorationLine: 'line-through', color: '#9ca3af' },
  meta: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 },
  priority: { fontSize: 12, fontWeight: '500', textTransform: 'capitalize' },
  status: { fontSize: 12, textTransform: 'capitalize' },
  dot: { color: '#d1d5db', fontSize: 12 },
  dueDate: { fontSize: 12, color: '#6b7280' },
  overdueDue: { color: '#ef4444' },
  empty: { alignItems: 'center', paddingTop: 40 },
  emptyText: { color: '#9ca3af', fontSize: 16 },
});
