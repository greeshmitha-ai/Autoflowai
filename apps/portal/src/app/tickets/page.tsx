'use client';

import { useEffect, useState } from 'react';
import { getTickets, submitTicket, type SupportTicket } from '@/lib/api';

const STATUS_COLORS: Record<SupportTicket['status'], string> = {
  open: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  resolved: 'bg-green-100 text-green-800',
};

export default function TicketsPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    loadTickets();
  }, []);

  function loadTickets() {
    setLoading(true);
    getTickets()
      .then((res) => setTickets(res.tickets))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load tickets'))
      .finally(() => setLoading(false));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError('');
    setSubmitting(true);
    try {
      await submitTicket({ subject, description });
      setSubject('');
      setDescription('');
      setShowForm(false);
      loadTickets();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit ticket');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Support Tickets</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700"
        >
          {showForm ? 'Cancel' : 'New Ticket'}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-lg border border-gray-200 p-6 space-y-4"
        >
          <h2 className="font-semibold">Submit a Support Request</h2>
          {submitError && <p className="text-red-600 text-sm">{submitError}</p>}
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="subject">Subject</label>
            <input
              id="subject"
              type="text"
              required
              maxLength={500}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="description">Description</label>
            <textarea
              id="description"
              required
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <p className="text-xs text-gray-500">
            File attachments (max 10 MB) can be added after ticket creation.
          </p>
          <button
            type="submit"
            disabled={submitting}
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
          >
            {submitting ? 'Submitting…' : 'Submit Ticket'}
          </button>
        </form>
      )}

      {loading && <p className="text-gray-500">Loading…</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && tickets.length === 0 && (
        <p className="text-gray-500">No support tickets yet.</p>
      )}

      <div className="space-y-3">
        {tickets.map((ticket) => (
          <div
            key={ticket.ticket_id}
            className="bg-white rounded-lg border border-gray-200 p-4 space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-sm">{ticket.subject}</span>
              <span
                className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_COLORS[ticket.status]}`}
              >
                {ticket.status.replace('_', ' ')}
              </span>
            </div>
            <p className="text-xs text-gray-500">
              Ref: <span className="font-mono">{ticket.ticket_ref}</span> ·{' '}
              {new Date(ticket.created_at).toLocaleDateString()}
            </p>
            <p className="text-sm text-gray-700 line-clamp-2">{ticket.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
