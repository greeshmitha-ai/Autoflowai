/**
 * ConnectionQualityIndicator — Task 34.4
 * Shows connection quality in the header.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ConnectionQuality } from '../hooks/useConnectionQuality';

interface Props {
  quality: ConnectionQuality;
  latencyMs?: number;
}

const COLORS: Record<ConnectionQuality, string> = {
  good: '#22c55e',
  degraded: '#f59e0b',
  offline: '#ef4444',
};

const LABELS: Record<ConnectionQuality, string> = {
  good: 'Online',
  degraded: 'Slow',
  offline: 'Offline',
};

export function ConnectionQualityIndicator({ quality, latencyMs }: Props) {
  return (
    <View style={styles.container}>
      <View style={[styles.dot, { backgroundColor: COLORS[quality] }]} />
      <Text style={[styles.label, { color: COLORS[quality] }]}>
        {LABELS[quality]}
        {quality === 'degraded' && latencyMs ? ` (${latencyMs}ms)` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
  },
});
