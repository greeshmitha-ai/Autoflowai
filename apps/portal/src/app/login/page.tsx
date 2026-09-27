'use client';

import { useState } from 'react';
import { sendMagicLink, passwordLogin, verifyMagicLink } from '@/lib/api';

type Mode = 'magic-link' | 'password';

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('magic-link');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [magicToken, setMagicToken] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'form' | 'verify'>('form');

  async function handleMagicLinkSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await sendMagicLink(email, tenantId);
      setMessage(res.message);
      setStep('verify');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyToken(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await verifyMagicLink(magicToken);
      localStorage.setItem('portal_token', res.token);
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid or expired token');
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await passwordLogin(email, password, tenantId);
      localStorage.setItem('portal_token', res.token);
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto mt-12">
      <h1 className="text-2xl font-bold mb-6">Sign in to your Portal</h1>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setMode('magic-link')}
          className={`px-4 py-2 rounded text-sm font-medium ${mode === 'magic-link' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
        >
          Magic Link
        </button>
        <button
          onClick={() => setMode('password')}
          className={`px-4 py-2 rounded text-sm font-medium ${mode === 'password' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
        >
          Password
        </button>
      </div>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
      {message && <p className="text-green-600 text-sm mb-4">{message}</p>}

      {mode === 'magic-link' && step === 'form' && (
        <form onSubmit={handleMagicLinkSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="tenant">Tenant ID</label>
            <input
              id="tenant"
              type="text"
              required
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded text-sm font-medium disabled:opacity-50"
          >
            {loading ? 'Sending…' : 'Send Magic Link'}
          </button>
        </form>
      )}

      {mode === 'magic-link' && step === 'verify' && (
        <form onSubmit={handleVerifyToken} className="space-y-4">
          <p className="text-sm text-gray-600">Enter the token from your email:</p>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="token">Token</label>
            <input
              id="token"
              type="text"
              required
              value={magicToken}
              onChange={(e) => setMagicToken(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded text-sm font-medium disabled:opacity-50"
          >
            {loading ? 'Verifying…' : 'Verify Token'}
          </button>
        </form>
      )}

      {mode === 'password' && (
        <form onSubmit={handlePasswordLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="email-pw">Email</label>
            <input
              id="email-pw"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="tenant-pw">Tenant ID</label>
            <input
              id="tenant-pw"
              type="text"
              required
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded text-sm font-medium disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      )}
    </div>
  );
}
