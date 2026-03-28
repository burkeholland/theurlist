'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { AuthModal } from './auth-modal';

export function NavHeader() {
  const { user, loading, signOut } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const userLabel = user?.displayName || user?.email;

  return (
    <header className="w-full border-b border-[var(--border)] bg-white">
      <nav className="mx-auto flex h-12 w-full max-w-[860px] items-center justify-between px-4">
        <div className="flex items-center gap-5">
          <Link
            href="/"
            className="text-base font-bold text-[var(--text)] no-underline"
            style={{ fontFamily: 'var(--font-mono)', letterSpacing: '-0.5px' }}
          >
            urlist<span className="text-[var(--accent)]">.</span>
          </Link>
          <div className="flex items-center gap-[14px]">
            <Link href="/" className="text-[13px] font-medium text-[var(--text)] hover:text-[var(--text)]">
              Home
            </Link>
            <Link
              href="/app/compose"
              className="text-[13px] text-[var(--text-muted)] no-underline transition-colors duration-150 hover:text-[var(--text)]"
            >
              Compose
            </Link>
            {user && (
              <Link
                href="/app/my-links"
                className="text-[13px] text-[var(--text-muted)] no-underline transition-colors duration-150 hover:text-[var(--text)]"
              >
                My lists
              </Link>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {loading ? (
            <span className="text-[13px] text-[var(--text-muted)]">...</span>
          ) : user ? (
            <>
              {userLabel && <span className="text-[13px] text-[var(--text-muted)]">{userLabel}</span>}
              <button
                onClick={() => signOut()}
                className="text-[13px] text-[var(--text-muted)] transition-colors duration-150 hover:text-[var(--text)]"
              >
                Sign out
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowAuthModal(true)}
              className="text-[13px] text-[var(--text-muted)] transition-colors duration-150 hover:text-[var(--text)]"
            >
              Sign in
            </button>
          )}
        </div>
      </nav>
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </header>
  );
}
