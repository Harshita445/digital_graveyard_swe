import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icons';
import { GitBranch } from 'lucide-react';
import { CATEGORIES } from '../lib/mockFallback';
import { PLEDGE, PROOF_DAYS, MIN_NEW_COMMITS, CLAIM_DAY_OPTIONS, DEFAULT_CLAIM_DAYS, TIME_ESTIMATES } from '../lib/claimRules';

export default function SubmitProject() {
  const router = useRouter();
  const { currentUser, addToast, refreshUser } = useApp();

  const [gitRepoUrl, setGitRepoUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [doneWhen, setDoneWhen] = useState('');
  const [starterTasks, setStarterTasks] = useState('');
  const [timeEstimate, setTimeEstimate] = useState('WEEKS');
  const [claimDays, setClaimDays] = useState(DEFAULT_CLAIM_DAYS);
  const [category, setCategory] = useState('Web');
  const [techTags, setTechTags] = useState('');
  const [completion, setCompletion] = useState(30);
  const [handoffNote, setHandoffNote] = useState('');
  const [ownerAvailable, setOwnerAvailable] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [suggestUrl, setSuggestUrl] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [suggestResult, setSuggestResult] = useState(null); // { ok, text, projectId }

  // Quick path: one URL, the server runs the legal check and fills in everything else from GitHub.
  const handleSuggest = async (e) => {
    e.preventDefault();
    if (!suggestUrl.trim()) return;
    setSuggesting(true);
    setSuggestResult(null);
    try {
      const res = await fetch('/api/projects/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: suggestUrl.trim() })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        addToast('Listed as an open grave!', 'success');
        router.push(`/project/${data.project.id}`);
        return;
      }
      if (res.status === 401) { await refreshUser(); return; }
      setSuggestResult({ ok: false, text: data.error || 'That repository could not be listed.', projectId: data.projectId });
    } catch (err) {
      setSuggestResult({ ok: false, text: 'Could not reach the server. Check your connection and try again.' });
    } finally {
      setSuggesting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentUser) {
      addToast('Please sign in to list a project', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          githubRepoUrl: gitRepoUrl.trim(),
          title: title.trim(),
          description: description.trim(),
          doneWhen: doneWhen.trim(),
          starterTasks: starterTasks.trim(),
          timeEstimate,
          claimDays: Number(claimDays),
          category,
          techTags: techTags.split(',').map(t => t.trim()).filter(Boolean),
          completion: Number(completion),
          handoffNote: handoffNote.trim(),
          ownerAvailable
        })
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.project) {
        addToast(data.message || 'Listed!', 'success');
        router.push(`/project/${data.project.id}`);
        return;
      }
      if (res.status === 401) { await refreshUser(); return; }
      // Show the server's reason (not yours to list, missing "done when", etc.).
      addToast(data?.error || 'That project could not be listed.', 'error');
      if (data?.projectId) router.push(`/project/${data.projectId}`);
    } catch (err) {
      addToast('Could not reach the server. Check your connection and try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!currentUser) {
    return (
      <div className="container" style={{ padding: '70px 0 90px', maxWidth: 480, textAlign: 'center' }}>
        <div className="card" style={{ padding: 36, borderRadius: '18px', background: '#FFFFFF', border: '2px solid var(--border)', boxShadow: '3px 4px 0px #141414' }}>
          <div style={{ width: 48, height: 48, border: '2px solid var(--border)', borderRadius: '12px 12px 6px 6px', background: '#FAF8F4', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, boxShadow: '2px 2px 0px #141414' }}>
            <Icon name="upload" size={22} />
          </div>
          <h2 className="font-display" style={{ fontSize: 26, fontWeight: 800, margin: '0 0 10px' }}>
            Authentication Required
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 0 20px', lineHeight: 1.5 }}>
            Sign in with GitHub to list a repository. That is how we check whether a repo is yours.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            <Link href="/login" className="btn btn-primary btn-block" style={{ height: 42, borderRadius: '10px', fontSize: 14.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              Continue with GitHub →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: '40px 0 80px', maxWidth: 720 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: '#FFFFFF', border: '1.8px solid var(--border)', borderRadius: '20px', fontSize: 12, fontWeight: 700, marginBottom: 12, boxShadow: '1.5px 1.5px 0px #141414' }}>
          <Icon name="tombstone" size={13} /> Project Intake Registry
        </div>
        <h1 className="font-display" style={{ fontSize: 32, fontWeight: 800, margin: '0 0 6px', letterSpacing: '-0.03em' }}>
          Bury a Project So Someone Can Revive It
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14.5, margin: 0, lineHeight: 1.5 }}>
          Paste a GitHub repository. We check that you&apos;re allowed to list it, then build its autopsy from the real commit history.
        </p>
        <div style={{ marginTop: 14, padding: 14, border: '2px dashed var(--border)', borderRadius: 12, fontSize: 13, lineHeight: 1.55, background: '#FFFFFF' }}>
          <strong>What can you list?</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            <li><strong>Your own repo</strong> (your connected GitHub account owns it) → listed as a <em>donated</em> project.</li>
            <li><strong>Anyone&apos;s abandoned repo</strong> with an open-source license (MIT, Apache, GPL…), archived or untouched for 12+ months → listed as an <em>open grave</em>. The license already allows forking, with credit to the original author.</li>
            <li>Anything else is refused: no license means &quot;all rights reserved&quot;, so only its owner can list it.</li>
          </ul>
        </div>
      </div>

      {/* Quick suggest: just a URL */}
      <form onSubmit={handleSuggest} className="card" style={{ padding: 24, marginBottom: 28, background: '#FFFFFF', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <h2 className="font-display" style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>🔎 Suggest a Dead Repo</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13.5, margin: '4px 0 0', lineHeight: 1.5 }}>
            Found an abandoned project worth saving? Paste its link. If it&apos;s archived or silent for 12+ months and its license allows forking,
            it&apos;s listed straight away. The title, category and autopsy come from GitHub.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="url"
            className="input"
            value={suggestUrl}
            onChange={e => setSuggestUrl(e.target.value)}
            placeholder="https://github.com/owner/repository"
            style={{ flex: '1 1 260px' }}
            aria-label="GitHub repository URL"
            required
          />
          <button type="submit" className="btn btn-primary" disabled={suggesting || !suggestUrl.trim()}>
            {suggesting ? 'Checking GitHub…' : 'Check & List'}
          </button>
        </div>
        {suggesting && (
          <div style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>Checking the license and activity, then building the autopsy. This can take up to 30 seconds.</div>
        )}
        {suggestResult && !suggestResult.ok && (
          <div style={{ padding: '10px 12px', borderRadius: 8, background: '#FDE8E8', border: '1.5px solid var(--error)', fontSize: 13, lineHeight: 1.5 }}>
            {suggestResult.text}
            {suggestResult.projectId && (
              <> <Link href={`/project/${suggestResult.projectId}`} style={{ fontWeight: 700, color: 'inherit' }}>View it →</Link></>
            )}
          </div>
        )}
      </form>

      <h2 className="font-display" style={{ fontSize: 19, fontWeight: 800, margin: '0 0 6px' }}>
        Or list it with the full details
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13.5, margin: '0 0 12px', lineHeight: 1.5 }}>
        Needed for your own repo, and useful for any grave: claimers see all of this before they pledge.
      </p>

      <form
        onSubmit={handleSubmit}
        className="card"
        style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 22, background: '#FFFFFF', borderRadius: '18px', boxShadow: '3px 4px 0px #141414' }}
      >
        <div>
          <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><GitBranch size={16} /> GitHub repository *</label>
          <input className="input" style={{ height: 44, borderRadius: '10px' }} placeholder="https://github.com/owner/repository"
            value={gitRepoUrl} onChange={e => setGitRepoUrl(e.target.value)} required />
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 5 }}>
            Public, and not a fork. Yours → a <em>donated</em> project where you approve who claims it. Someone else&apos;s abandoned, open-licensed repo → an <em>open grave</em> anyone can join.
          </div>
        </div>

        <div>
          <label className="label">Title *</label>
          <input className="input" style={{ height: 42, borderRadius: '10px' }} maxLength={120} placeholder="e.g. Adaptive Audio Equalizer"
            value={title} onChange={e => setTitle(e.target.value)} required />
        </div>

        <div>
          <label className="label">What it is and where it stands *</label>
          <textarea className="input" rows={4} maxLength={5000} style={{ borderRadius: '12px', padding: '12px 14px', lineHeight: 1.5 }}
            placeholder="What works today, what is broken or missing, how to run it."
            value={description} onChange={e => setDescription(e.target.value)} required />
        </div>

        <div>
          <label className="label">Done when… *</label>
          <textarea className="input" rows={2} maxLength={600} style={{ borderRadius: '12px', padding: '12px 14px', lineHeight: 1.5 }}
            placeholder="e.g. It builds on Node 20 and the login bug (issue #12) is fixed."
            value={doneWhen} onChange={e => setDoneWhen(e.target.value)} required />
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 5 }}>
            What &quot;revived&quot; means for this project. Claimers aim for this, and GitHub confirms the work ({MIN_NEW_COMMITS}+ new commits on a fork).
          </div>
        </div>

        <div>
          <label className="label">Starter tasks</label>
          <textarea className="input" rows={3} maxLength={1500} style={{ borderRadius: '12px', padding: '12px 14px', lineHeight: 1.5 }}
            placeholder={'One per line, e.g.\nUpdate dependencies\nFix the failing build'}
            value={starterTasks} onChange={e => setStarterTasks(e.target.value)} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 18 }}>
          <div>
            <label className="label">Time estimate</label>
            <select className="input" style={{ height: 42, borderRadius: '10px', cursor: 'pointer' }} value={timeEstimate} onChange={e => setTimeEstimate(e.target.value)}>
              {Object.entries(TIME_ESTIMATES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Claim length</label>
            <select className="input" style={{ height: 42, borderRadius: '10px', cursor: 'pointer' }} value={claimDays} onChange={e => setClaimDays(Number(e.target.value))}>
              {CLAIM_DAY_OPTIONS.map(d => <option key={d} value={d}>{d} days</option>)}
            </select>
          </div>
          <div>
            <label className="label">Category</label>
            <select className="input" style={{ height: 42, borderRadius: '10px', cursor: 'pointer' }} value={category} onChange={e => setCategory(e.target.value)}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18 }}>
          <div>
            <label className="label">Technologies (comma-separated)</label>
            <input className="input" style={{ height: 42, borderRadius: '10px' }} placeholder="e.g. Next.js, PostgreSQL"
              value={techTags} onChange={e => setTechTags(e.target.value)} />
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label className="label" style={{ margin: 0 }}>Rough completion (estimate)</label>
              <span style={{ fontWeight: 800, fontSize: 13 }}>{completion}%</span>
            </div>
            <input type="range" min="0" max="95" value={completion} onChange={e => setCompletion(e.target.value)}
              style={{ width: '100%', marginTop: 8, accentColor: '#141414', cursor: 'pointer' }} />
          </div>
        </div>

        <div>
          <label className="label">Handoff letter (if it&apos;s your project)</label>
          <textarea className="input" rows={4} maxLength={4000} style={{ borderRadius: '12px', padding: '12px 14px', lineHeight: 1.5 }}
            placeholder="Why did you stop? What's half-done? What would you do next? This is the context a reviver can't get from the code."
            value={handoffNote} onChange={e => setHandoffNote(e.target.value)} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, fontSize: 13.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={ownerAvailable} onChange={e => setOwnerAvailable(e.target.checked)}
              style={{ accentColor: '#141414', width: 17, height: 17 }} />
            I&apos;m happy to answer questions from whoever claims it (your own repo only)
          </label>
        </div>

        <div className="surface2" style={{ padding: 14, borderRadius: 12, border: '2px dashed var(--border)', fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-muted)' }}>
          <strong style={{ color: 'var(--text)' }}>How claims work:</strong> claiming pledges {PLEDGE} credits. The claimer must push a commit of their own to a fork within {PROOF_DAYS} days,
          and finish ({MIN_NEW_COMMITS}+ new commits) within the claim length you chose. Quitting returns the pledge; disappearing sends it to this project&apos;s bounty for the next reviver.
          On your own repo you approve who gets the claim. You never have to review the code: git does that.
        </div>

        <button type="submit" className="btn btn-primary btn-block" style={{ padding: '14px', fontSize: 15, marginTop: 4, borderRadius: '12px' }} disabled={submitting}>
          {submitting ? 'Checking GitHub and listing…' : 'List in the Graveyard →'}
        </button>
      </form>
    </div>
  );
}
