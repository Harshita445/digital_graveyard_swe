import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icons';
import { GitBranch, Code2 } from 'lucide-react';
import { getLocalProjects, saveLocalProjects, CATEGORIES, STATIC_DEMO } from '../lib/mockFallback';

export default function SubmitProject() {
  const router = useRouter();
  const { currentUser, addToast } = useApp();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Web');
  const [completion, setCompletion] = useState(30);
  const [techTags, setTechTags] = useState('React, Node.js, SQLite');
  const [stakeRequired, setStakeRequired] = useState(100);
  const [gitRepoUrl, setGitRepoUrl] = useState('');
  const [gitBranch, setGitBranch] = useState('main');
  const [milestoneMode, setMilestoneMode] = useState(false);
  const [handoffNote, setHandoffNote] = useState('');
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
      addToast('Please select or log in to a persona to submit a project', 'error');
      return;
    }
    if (currentUser.banned) {
      addToast('Account restricted due to 3 ghost strikes. Project submission blocked.', 'error');
      return;
    }
    if (!title.trim() || !description.trim()) {
      addToast('Title and description are required', 'error');
      return;
    }
    if (!gitRepoUrl.trim()) {
      addToast('Git repository URL is required', 'error');
      return;
    }

    try {
      setSubmitting(true);
      const tagsArray = techTags.split(',').map(s => s.trim()).filter(Boolean);
      const cleanGitUrl = gitRepoUrl.trim();
      const repoSlug = cleanGitUrl.split('/').filter(Boolean).pop()?.replace('.git', '') || 'repository';
      const cleanBranch = gitBranch.trim() || 'main';
      const packageLabel = `${repoSlug}.git (${cleanBranch})`;

      try {
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(currentUser ? { 'x-user-id': currentUser.id } : {})
          },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim(),
            category,
            completion: Number(completion),
            techTags: JSON.stringify(tagsArray),
            stakeRequired: Number(stakeRequired),
            fileName: packageLabel,
            fileUrl: cleanGitUrl,
            milestoneMode,
            githubRepoUrl: cleanGitUrl,
            handoffNote: handoffNote.trim()
          })
        });

        const data = await res.json().catch(() => null);
        if (res.ok && data?.project) {
          addToast(data.message || 'Project listed in the Graveyard successfully!', 'success');
          router.push(`/project/${data.project.id}`);
          return;
        }
        if (data?.error) {
          // The server answered: show its reason (e.g. you don't own this repo) instead of faking success.
          addToast(data.error, 'error');
          if (data.projectId) router.push(`/project/${data.projectId}`);
          return;
        }
      } catch (err) {
        // Network failure only: handled in static demo fallback below
      }

      if (!STATIC_DEMO) {
        addToast('Could not reach the server. Check your connection and try again.', 'error');
        return;
      }
      // Demo fallback for a static export build only
      const newProj = {
        id: `p-${Date.now()}`,
        ownerId: currentUser.id,
        owner: currentUser,
        title: title.trim(),
        description: description.trim(),
        category,
        completion: Number(completion),
        techTags: JSON.stringify(tagsArray),
        stakeRequired: Number(stakeRequired),
        fileName: packageLabel,
        fileUrl: cleanGitUrl,
        milestoneMode,
        githubRepoUrl: cleanGitUrl,
        status: 'LISTED',
        createdAt: new Date().toISOString(),
        commitments: []
      };
      const allProjects = getLocalProjects();
      saveLocalProjects([newProj, ...allProjects]);
      addToast('Project listed in the Graveyard successfully! (Demo Mode)', 'success');
      router.push(`/project/${newProj.id}`);
    } catch (err) {
      addToast(err.message, 'error');
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
            Listing an abandoned repository and configuring an escrow stake requirement requires an active account.
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

      <h2 className="font-display" style={{ fontSize: 19, fontWeight: 800, margin: '0 0 12px' }}>
        Donating your own project? Use the full form
      </h2>

      <form
        onSubmit={handleSubmit}
        className="card"
        style={{
          padding: 32,
          display: 'flex',
          flexDirection: 'column',
          gap: 22,
          background: '#FFFFFF',
          borderRadius: '18px',
          boxShadow: '3px 4px 0px #141414'
        }}
      >
        {/* Project Name */}
        <div>
          <label className="label">Project Title *</label>
          <input
            className="input"
            style={{ height: 42, borderRadius: '10px' }}
            placeholder="e.g. Adaptive Audio Equalizer"
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
          />
        </div>

        {/* Short & Detailed Description */}
        <div>
          <label className="label">Overview & Current State *</label>
          <textarea
            className="input"
            rows={5}
            style={{ borderRadius: '12px', padding: '12px 14px', lineHeight: 1.5 }}
            placeholder="Explain what is currently working, what is broken or missing, and what a taker must build to finish it..."
            value={description}
            onChange={e => setDescription(e.target.value)}
            required
          />
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 5 }}>
            Be specific about missing architecture, untested components, or deployment blockers.
          </div>
        </div>

        {/* Category & Completion Slider */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          <div>
            <label className="label">Category</label>
            <select
              className="input"
              style={{ height: 42, borderRadius: '10px', cursor: 'pointer' }}
              value={category}
              onChange={e => setCategory(e.target.value)}
            >
              {CATEGORIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label className="label" style={{ margin: 0 }}>Starting Completion</label>
              <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--text)' }}>{completion}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="95"
              value={completion}
              onChange={e => setCompletion(e.target.value)}
              style={{ width: '100%', marginTop: 8, accentColor: '#141414', cursor: 'pointer' }}
            />
          </div>
        </div>

        {/* Technologies */}
        <div>
          <label className="label">Technologies & Frameworks (comma-separated)</label>
          <input
            className="input"
            style={{ height: 42, borderRadius: '10px' }}
            placeholder="e.g. Next.js, FastAPI, PostgreSQL, Tailwind"
            value={techTags}
            onChange={e => setTechTags(e.target.value)}
          />
        </div>

        {/* Git Repository Source (Replaces source code zip file upload) */}
        <div
          style={{
            background: '#FAF8F4',
            padding: 22,
            borderRadius: 14,
            border: '2px solid var(--border)',
            boxShadow: '2px 2px 0px #141414'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <GitBranch size={18} />
              <label className="label" style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Git Repository URL *</label>
            </div>
          </div>

          <input
            className="input"
            style={{ height: 44, borderRadius: '10px' }}
            placeholder="https://github.com/owner/repository"
            value={gitRepoUrl}
            onChange={e => setGitRepoUrl(e.target.value)}
            required
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 14 }}>
            <div>
              <label className="label" style={{ fontSize: 12 }}>Target Branch / Revision</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <GitBranch size={16} color="var(--text-muted)" />
                <input
                  className="input"
                  style={{ height: 38, borderRadius: '8px' }}
                  placeholder="main"
                  value={gitBranch}
                  onChange={e => setGitBranch(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="label" style={{ fontSize: 12 }}>Required Escrow Stake (Credits) *</label>
              <input
                type="number"
                min="20"
                max="500"
                className="input"
                style={{ height: 38, borderRadius: '8px' }}
                value={stakeRequired}
                onChange={e => setStakeRequired(e.target.value)}
                required
              />
            </div>
          </div>

          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 12, display: 'flex', alignItems: 'flex-start', gap: 8, lineHeight: 1.4 }}>
            <Code2 size={15} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              Must be a public GitHub repository. The stake only applies to donated projects; open graves are free to claim.
            </span>
          </div>
        </div>

        {/* Handoff letter */}
        <div>
          <label className="label">Handoff Letter (if it&apos;s your project)</label>
          <textarea
            className="input"
            rows={4}
            style={{ borderRadius: '12px', padding: '12px 14px', lineHeight: 1.5 }}
            placeholder="Why did you stop? What works, what's half-done, what would you do next? This is the context a reviver can't get from the code."
            value={handoffNote}
            onChange={e => setHandoffNote(e.target.value)}
          />
        </div>

        {/* Milestone Mode Toggle */}
        <div
          className="surface2"
          style={{
            padding: 16,
            borderRadius: '12px',
            border: '2px solid var(--border)',
            boxShadow: '1px 2px 0px #141414'
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={milestoneMode}
              onChange={e => setMilestoneMode(e.target.checked)}
              style={{ accentColor: '#141414', width: 18, height: 18, cursor: 'pointer' }}
            />
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
                Enable Milestone Checkpoints
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>
                Splits the blind work phase into 3 phased review targets (M1, M2, M3) with automated checkpoint verification.
              </div>
            </div>
          </label>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          className="btn btn-primary btn-block"
          style={{ padding: '14px', fontSize: 15, marginTop: 8, borderRadius: '12px' }}
          disabled={submitting}
        >
          {submitting ? 'Listing in Graveyard...' : 'List Git Repository in Graveyard →'}
        </button>
      </form>
    </div>
  );
}
