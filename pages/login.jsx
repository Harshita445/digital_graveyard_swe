import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icons';

export default function Login({ initialMode = 'login' }) {
  const router = useRouter();
  const { currentUser, loading: authLoading } = useApp();
  const [providers, setProviders] = useState({ github: true, devSimulation: false });
  const [errorMsg, setErrorMsg] = useState('');

  // Learn which sign-in options are actually configured on this deployment.
  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/providers')
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (data && !cancelled) setProviders(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Already signed in? Skip the form.
  React.useEffect(() => {
    if (!authLoading && currentUser && !router.query.error) {
      router.replace('/dashboard');
    }
  }, [authLoading, currentUser, router]);

  React.useEffect(() => {
    const err = router.query.error;
    if (!err) return;
    const messages = {
      github_not_configured: 'GitHub sign-in is not available right now. Please try again later.',
      state_mismatch: 'Security check failed. Please try signing in with GitHub again.',
      access_denied: 'GitHub authorization was declined.',
      account_banned: 'This account is suspended due to protocol violations.',
      invalid_oauth_request: 'The GitHub sign-in request was incomplete. Please try again.',
      token_exchange_failed: 'GitHub did not accept the sign-in. Please try again.',
      profile_fetch_failed: 'Could not read your GitHub profile. Please try again.',
      oauth_internal_error: 'Something went wrong signing in with GitHub. Please try again.'
    };
    setErrorMsg(messages[err] || 'Sign-in failed. Please try again.');
  }, [router.query.error]);

  return (
    <div className="container" style={{ padding: '50px 0 80px', maxWidth: 460 }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ width: 48, height: 48, border: '2px solid var(--border)', borderRadius: '12px 12px 6px 6px', background: '#FFFFFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14, boxShadow: '2px 2px 0px #141414' }}>
          <Icon name="tombstone" size={22} />
        </div>
        <h1 className="font-display" style={{ fontSize: 28, fontWeight: 800, margin: '0 0 8px', letterSpacing: '-0.03em' }}>
          Authenticate to Graveyard
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13.5, margin: 0 }}>
          Sign in with GitHub. Your real email stays private. New accounts are issued a unique Digger alias and 500 starter escrow credits.
        </p>
      </div>

      {errorMsg && (
        <div
          style={{
            padding: '12px 16px',
            marginBottom: 16,
            background: '#FFF0F0',
            border: '1.8px solid #F87171',
            borderRadius: '10px',
            color: '#B91C1C',
            fontSize: 13,
            fontWeight: 700,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            boxShadow: '2px 2px 0px #141414'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="alertTriangle" size={16} />
            <span>{errorMsg}</span>
          </div>
          {router.query.error === 'github_not_configured' && providers.devSimulation && (
            <div style={{ marginTop: 4, fontSize: 12 }}>
              <Link
                href="/api/auth/github?dev=true"
                style={{ color: '#1D4ED8', textDecoration: 'underline', fontWeight: 800 }}
              >
                Click here to test GitHub OAuth in Dev Simulation Mode →
              </Link>
            </div>
          )}
        </div>
      )}

      <div
        className="card"
        style={{
          padding: 26,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          background: '#FFFFFF',
          borderRadius: '18px',
          border: '2px solid var(--border)',
          boxShadow: '3px 4px 0px #141414'
        }}
      >
        {/* GitHub OAuth Button */}
        <a
          href={providers.github ? '/api/auth/github' : undefined}
          aria-disabled={!providers.github}
          title={providers.github ? undefined : 'GitHub sign-in is not configured'}
          className="btn btn-block"
          style={{
            height: 44,
            fontSize: 14.5,
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            background: '#24292F',
            color: '#FFFFFF',
            border: '2px solid #141414',
            boxShadow: '2px 2.5px 0px #141414',
            textDecoration: 'none',
            fontWeight: 700,
            cursor: providers.github ? 'pointer' : 'not-allowed',
            opacity: providers.github ? 1 : 0.45
          }}
        >
          <Icon name="github" size={20} />
          <span>Continue with GitHub</span>
        </a>
      </div>
    </div>
  );
}

