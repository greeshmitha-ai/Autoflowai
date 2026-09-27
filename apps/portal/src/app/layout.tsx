import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Customer Portal',
  description: 'Manage your account, view history, and submit support requests',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <span className="font-semibold text-lg">Customer Portal</span>
            <nav className="flex gap-4 text-sm">
              <a href="/history" className="hover:text-blue-600">History</a>
              <a href="/tickets" className="hover:text-blue-600">Support</a>
              <a href="/preferences" className="hover:text-blue-600">Preferences</a>
            </nav>
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
