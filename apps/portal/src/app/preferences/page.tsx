'use client';

import { useEffect, useState } from 'react';
import { getPreferences, updatePreferences, requestDataExport, type Preferences } from '@/lib/api';

export default function PreferencesPage() {
  const [prefs, setPrefs] = useState<Preferences>({
    email_opt_in: true,
    sms_opt_in: true,
    in_app_opt_in: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [exportMessage, setExportMessage] = useState('');
  const [exportLoading, setExportLoading] = useState(false);

  useEffect(() => {
    getPreferences()
      .then((res) => setPrefs(res.preferences))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load preferences'))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaveMessage('');
    setSaving(true);
    try {
      await updatePreferences(prefs);
      setSaveMessage('Preferences saved successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  }

  async function handleDataExport() {
    setExportLoading(true);
    setExportMessage('');
    try {
      const res = await requestDataExport();
      setExportMessage(`${res.message} Estimated completion: ${new Date(res.estimated_completion).toLocaleString()}`);
    } catch (err) {
      setExportMessage(err instanceof Error ? err.message : 'Failed to request export');
    } finally {
      setExportLoading(false);
    }
  }

  if (loading) return <p className="text-gray-500">Loading…</p>;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Communication Preferences</h1>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {saveMessage && <p className="text-green-600 text-sm">{saveMessage}</p>}

      <form onSubmit={handleSave} className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <h2 className="font-semibold">Channel Opt-ins</h2>
        <p className="text-sm text-gray-500">
          Choose which channels you want to receive communications on.
        </p>

        {(
          [
            { key: 'email_opt_in', label: 'Email', description: 'Receive emails from us' },
            { key: 'sms_opt_in', label: 'SMS', description: 'Receive text messages' },
            { key: 'in_app_opt_in', label: 'In-App', description: 'Receive in-app notifications' },
          ] as const
        ).map(({ key, label, description }) => (
          <label key={key} className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={prefs[key]}
              onChange={(e) => setPrefs((p) => ({ ...p, [key]: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-300 text-blue-600"
            />
            <div>
              <span className="text-sm font-medium">{label}</span>
              <p className="text-xs text-gray-500">{description}</p>
            </div>
          </label>
        ))}

        <button
          type="submit"
          disabled={saving}
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Preferences'}
        </button>
      </form>

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <h2 className="font-semibold">Personal Data Export</h2>
        <p className="text-sm text-gray-500">
          Request a copy of all your personal data. Your export will be ready within 48 hours.
        </p>
        {exportMessage && <p className="text-sm text-blue-700">{exportMessage}</p>}
        <button
          onClick={handleDataExport}
          disabled={exportLoading}
          className="bg-gray-800 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
        >
          {exportLoading ? 'Requesting…' : 'Request Data Export'}
        </button>
      </div>
    </div>
  );
}
