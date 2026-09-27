import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Welcome to your Customer Portal</h1>
      <p className="text-gray-600">
        Manage your account, view your interaction history, submit support tickets, and control your
        communication preferences.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/history"
          className="block p-6 bg-white rounded-lg border border-gray-200 hover:border-blue-400 transition-colors"
        >
          <h2 className="font-semibold text-lg mb-1">Interaction History</h2>
          <p className="text-sm text-gray-500">View emails, calls, chats, and survey responses</p>
        </Link>
        <Link
          href="/tickets"
          className="block p-6 bg-white rounded-lg border border-gray-200 hover:border-blue-400 transition-colors"
        >
          <h2 className="font-semibold text-lg mb-1">Support Tickets</h2>
          <p className="text-sm text-gray-500">Submit and track your support requests</p>
        </Link>
        <Link
          href="/preferences"
          className="block p-6 bg-white rounded-lg border border-gray-200 hover:border-blue-400 transition-colors"
        >
          <h2 className="font-semibold text-lg mb-1">Communication Preferences</h2>
          <p className="text-sm text-gray-500">Manage your opt-in and opt-out settings</p>
        </Link>
      </div>
    </div>
  );
}
