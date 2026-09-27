'use client';

import { useEffect, useState } from 'react';
import { getHistory, type HistoryItem } from '@/lib/api';

const TYPE_LABELS: Record<HistoryItem['type'], string> = {
  email: '📧 Email',
  call: '📞 Call',
  chatbot: '💬 Chat',
  survey: '📋 Survey',
};

const TYPE_COLORS: Record<HistoryItem['type'], string> = {
  email: 'bg-blue-100 text-blue-800',
  call: 'bg-green-100 text-green-800',
  chatbot: 'bg-purple-100 text-purple-800',
  survey: 'bg-yellow-100 text-yellow-800',
};

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getHistory()
      .then((res) => setHistory(res.history))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load history'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Interaction History</h1>

      {loading && <p className="text-gray-500">Loading…</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && history.length === 0 && (
        <p className="text-gray-500">No interactions found.</p>
      )}

      <div className="space-y-3">
        {history.map((item) => (
          <div
            key={item.id}
            className="bg-white rounded-lg border border-gray-200 p-4 flex items-start gap-4"
          >
            <span
              className={`text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${TYPE_COLORS[item.type]}`}
            >
              {TYPE_LABELS[item.type]}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-800">{item.summary}</p>
              <p className="text-xs text-gray-400 mt-1">
                {new Date(item.timestamp).toLocaleString()}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
