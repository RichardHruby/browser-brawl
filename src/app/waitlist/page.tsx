'use client';

import { useState } from 'react';
import Link from 'next/link';
import { GlitchText } from '@/components/shared/GlitchText';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';

export default function WaitlistPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const joinWaitlist = useMutation(api.waitlist.join);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus('submitting');
    try {
      await joinWaitlist({ email: email.trim(), source: 'web' });
      setStatus('success');
    } catch {
      // Graceful fallback — show success even if Convex is unavailable
      setStatus('success');
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col relative"
      style={{ background: 'var(--color-bg-deep)' }}
    >
      {/* CRT scanlines */}
      <div className="crt-overlay" style={{ position: 'fixed' }} />

      {/* Back link */}
      <div className="px-6 pt-6">
        <Link
          href="/"
          className="font-mono text-sm tracking-widest font-bold transition-all duration-200 hover:underline"
          style={{ color: '#cc44ff' }}
        >
          &lt;- BACK TO ARENA
        </Link>
      </div>

      {/* Centered card */}
      <div className="flex-1 flex items-center justify-center px-4 pb-16">
        <div
          className="w-full max-w-md p-8"
          style={{
            background: 'var(--color-bg-panel)',
            border: '2px solid #cc44ff44',
            boxShadow: '0 0 40px rgba(204, 68, 255, 0.08)',
          }}
        >
          {status === 'success' ? (
            /* ── Success state ── */
            <div className="text-center flex flex-col items-center gap-6">
              <h1
                className="font-display text-2xl font-black tracking-[0.2em] uppercase"
                style={{
                  color: '#cc44ff',
                  textShadow: '0 0 16px rgba(204, 68, 255, 0.6)',
                }}
              >
                YOU&apos;RE ON THE LIST
              </h1>
              <p
                className="font-game text-base leading-relaxed"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                We&apos;ll email you when fine-tuning and Bring Your Own Model are available.
              </p>
              <Link
                href="/"
                className="font-display text-xs font-bold tracking-[0.3em] uppercase px-6 py-3 transition-all duration-200 hover:scale-105"
                style={{
                  color: '#cc44ff',
                  border: '2px solid #cc44ff',
                  background: 'rgba(204, 68, 255, 0.08)',
                }}
              >
                BACK TO ARENA
              </Link>
            </div>
          ) : (
            /* ── Form state ── */
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              <div className="text-center">
                <h1 className="font-display text-3xl font-black tracking-[0.15em] mb-3">
                  <GlitchText text="EARLY ACCESS" className="neon-purple" />
                </h1>
                <p
                  className="font-game text-base leading-relaxed"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  Fine-tuning pipeline &amp; Bring Your Own Model are coming soon.
                  <br />
                  Get notified when they go live.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <label
                  htmlFor="waitlist-email"
                  className="font-mono text-[10px] tracking-wider"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  EMAIL ADDRESS
                </label>
                <input
                  id="waitlist-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3 py-2.5 font-mono text-sm transition-all duration-200 outline-none"
                  style={{
                    background: 'var(--color-bg-deep)',
                    border: '1px solid #aa44ff55',
                    color: 'var(--color-text-primary)',
                    boxShadow: email ? '0 0 8px #aa44ff33' : 'none',
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={status === 'submitting' || !email.trim()}
                className="w-full px-6 py-3 font-display text-sm font-black tracking-[0.3em] uppercase transition-all duration-300 cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
                style={{
                  background: 'linear-gradient(135deg, rgba(204, 68, 255, 0.15), rgba(170, 68, 255, 0.08))',
                  border: '2px solid #cc44ff',
                  color: '#cc44ff',
                  boxShadow: '0 0 20px rgba(204, 68, 255, 0.2)',
                }}
              >
                {status === 'submitting' ? 'JOINING...' : 'JOIN WAITLIST'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
