import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useApp } from '../../context/AppContext';
import AutopsyChart, { CauseOfDeclineTags } from '../../components/AutopsyChart';
import ProvenanceTimeline from '../../components/ProvenanceTimeline';
import HandoverChecklist from '../../components/HandoverChecklist';
import { PLEDGE, PROOF_DAYS, MIN_NEW_COMMITS, REVIVE_REWARD, DEFAULT_DONE_WHEN, TIME_ESTIMATES, canAffordPledge } from '../../lib/claimRules';
import Icon from '../../components/Icons';
import { getLocalProjects } from '../../lib/mockFallback';

export default function ProjectDetails({ projectId }) {
  const router = useRouter();
  const id = projectId || router.query.id;
  const { currentUser, addToast, refreshUser } = useApp();

  const [project, setProject] = useState(null);
  const [activeCommitment, setActiveCommitment] = useState(null);
  const [userRole, setUserRole] = useState('GUEST');
  const [revivers, setRevivers] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  // Fork check modal
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [submissionUrl, setSubmissionUrl] = useState('');

  useEffect(() => {
    if (id) fetchProjectDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, currentUser]);

  const fetchProjectDetail = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        headers: currentUser ? { 'x-user-id': currentUser.id } : {}
      });
      if (res.ok) {
        const data = await res.json();
        setProject(data.project);
        setActiveCommitment(data.activeCommitment);
        setUserRole(data.userRole);
        setRevivers(data.revivers || []);
        setLoading(false);
        return;
      }
    } catch (err) {
      // Static demo export: fall back to the bundled sample projects (read-only)
    }

    const allProjects = getLocalProjects();
    const target = allProjects.find(p => p.id === id) || allProjects[0];
    if (target) {
      setProject(target);
      setActiveCommitment(target.commitments?.[0] || null);
      setUserRole('GUEST');
    }
    setLoading(false);
  };

  // Every claim action is one POST; the server applies the pledge rules and explains any refusal.
  const act = async (url, body, kind = 'success') => {
    if (!currentUser) {
      router.push(`/login?redirect=/project/${project?.id || ''}`);
      return null;
    }
    setActionLoading(true);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': currentUser.id },
        body: JSON.stringify(body || {})
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        addToast(data.error || 'That did not work. Please try again.', 'error');
        return null;
      }
      addToast(data.message || 'Done.', kind);
      await fetchProjectDetail();
      await refreshUser();
      return data;
    } catch (err) {
      addToast('Could not reach the server. Check your connection and try again.', 'error');
      return null;
    } finally {
      setActionLoading(false);
    }
  };

  const handleCommit = () => act(`/api/projects/${project.id}/commit`);
  const handleApprove = () => act(`/api/projects/${project.id}/approve`, { commitmentId: activeCommitment?.id });
  const handleReject = () => act(`/api/projects/${project.id}/reject`, { commitmentId: activeCommitment?.id }, 'info');
  const handleWithdraw = () => {
    if (activeCommitment?.status === 'ACTIVE' &&
      !window.confirm(`Quit this claim? Your ${activeCommitment.stakeLocked || PLEDGE} credits come back and there is no penalty.`)) return;
    return act(`/api/commitments/${activeCommitment.id}/withdraw`, null, 'info');
  };
  const handleCheckFork = async () => {
    const data = await act(`/api/commitments/${activeCommitment.id}/submit`, { forkUrl: submissionUrl.trim() });
    if (data) setSubmitModalOpen(false);
  };

  const handleAnalyzeRepository = async () => {
    if (!currentUser || userRole !== 'OWNER') {
      addToast('Only the project owner can analyze this repository', 'error');
      return;
    }

    try {
      setAnalysisLoading(true);
      const res = await fetch(`/api/projects/${project.id}/analyze`, {
        method: 'POST',
        headers: { 'x-user-id': currentUser.id }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Repository analysis failed');
      setProject(data.project);
      addToast('Live GitHub intelligence refreshed.', 'success');
      await fetchProjectDetail();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setAnalysisLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container" style={{ padding: '60px 0', textAlign: 'center' }}>
        <div style={{ color: 'var(--text-muted)' }}>Loading codebase details...</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="container" style={{ padding: '60px 0', textAlign: 'center' }}>
        <h2>Project not found</h2>
        <Link href="/browse" className="btn btn-outline" style={{ marginTop: 16 }}>
          Back to Browse
        </Link>
      </div>
    );
  }

  let tags = [];
  try {
    tags = typeof project.techTags === 'string' ? JSON.parse(project.techTags) : project.techTags || [];
  } catch (e) {
    tags = (project.techTags || '').split(',').map(s => s.trim()).filter(Boolean);
  }

  const isOwner = userRole === 'OWNER';
  const isTaker = userRole === 'TAKER';
  const isPending = activeCommitment?.status === 'PENDING_APPROVAL';
  const isActive = activeCommitment?.status === 'ACTIVE';
  const isCompleted = project.status === 'COMPLETED';
  const github = project.githubIntelligence;
  const isOpenGrave = project.source === 'OPEN_GRAVE';
  // On open graves many people revive at once: "done" means *your* fork was verified.
  const myRevivalDone = isOpenGrave ? activeCommitment?.status === 'COMPLETED' : isCompleted;
  const workingCount = revivers.filter(r => r.status === 'ACTIVE').length;
  // Open graves take any number of people; a donated project takes one at a time.
  const canClaim = isOpenGrave || project.status === 'LISTED';

  return (
    <div className="container" style={{ padding: '36px 0 70px' }}>
      {/* Back button */}
      <Link
        href="/browse"
        className="btn btn-outline btn-sm"
        style={{ marginBottom: 20, display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        <Icon name="chevronLeft" size={15} /> Back to Graveyard
      </Link>

      {/* Life of a grave */}
      <div className="sketch-card-static" style={{ padding: '14px 18px', marginBottom: 22, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 13, fontFamily: 'var(--font-mono)' }}>
        {[
          { key: 'LISTED', label: '🪦 Dead' },
          { key: 'ACTIVE', label: '🌱 Claimed & being revived' },
          { key: 'COMPLETED', label: '✨ Revived (fork verified)' }
        ].map((stage, i, all) => {
          const order = ['LISTED', 'ACTIVE', 'COMPLETED'];
          const current = project.status === 'PENDING_APPROVAL' ? 'LISTED' : project.status;
          const reached = order.indexOf(current) >= order.indexOf(stage.key);
          return (
            <React.Fragment key={stage.key}>
              <span style={{ fontWeight: reached ? 800 : 400, opacity: reached ? 1 : 0.45 }}>{stage.label}</span>
              {i < all.length - 1 && <span style={{ opacity: 0.4 }}>→</span>}
            </React.Fragment>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 32, alignItems: 'start' }}>
        {/* Left Column: Codebase Details */}
        <div>
          {/* Hero Dossier Card */}
          <div
            className="card"
            style={{
              padding: 26,
              marginBottom: 20,
              position: 'relative',
              background: '#FFFFFF'
            }}
          >
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              <span className="chip" style={{ fontSize: 12 }}>
                <Icon name="tombstone" size={13} /> {project.category}
              </span>
              <span className="chip" style={{ fontSize: 12 }}>
                {isOpenGrave ? '🔓 Open grave' : '🤝 Donated by owner'}
              </span>
              {project.license && (
                <span className="chip" style={{ fontSize: 12 }}>📜 {project.license}</span>
              )}
              <span className="chip" style={{ fontSize: 12 }}>⏳ {project.claimDays || 30}-day claims</span>
              {project.timeEstimate && TIME_ESTIMATES[project.timeEstimate] && (
                <span className="chip" style={{ fontSize: 12 }}>🕒 {TIME_ESTIMATES[project.timeEstimate]}</span>
              )}
              {project.bounty > 0 && (
                <span className="chip chip-accent" style={{ fontSize: 12 }}>💰 {project.bounty} cr bounty</span>
              )}
            </div>

            <h1 className="font-display" style={{ fontSize: 28, fontWeight: 800, margin: '0 0 10px', letterSpacing: '-0.03em' }}>
              {project.title}
            </h1>

            <div style={{ display: 'flex', gap: 14, fontSize: 13, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
              {isOpenGrave && project.githubRepoOwner && (
                <>
                  <span>Originally built by <strong>@{project.githubRepoOwner}</strong></span>
                  <span>·</span>
                </>
              )}
              <span>{isOpenGrave ? 'Discovered' : 'Listed'} by <strong>{project.owner?.alias}</strong></span>
              <span>·</span>
              <span>Last commit {project.lastActiveRecency}</span>
            </div>
            {project.revivedRepoUrl && (
              <div style={{ marginTop: 14, padding: '10px 14px', background: '#D9F2D4', border: '2px solid var(--border)', borderRadius: 10, fontSize: 13.5 }}>
                ✨ <strong>Revived!</strong> The living version is at{' '}
                <a href={project.revivedRepoUrl} target="_blank" rel="noreferrer">{project.revivedRepoUrl.replace('https://github.com/', '')}</a>
              </div>
            )}
            {isOpenGrave && (
              <p style={{ margin: '12px 0 0', fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                This repository is abandoned and its <strong>{project.license}</strong> license already lets anyone fork and modify it,
                as long as the original author is credited. No owner permission is needed, and the original stays untouched.
              </p>
            )}
            {project.githubRepoUrl && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
                <a href={project.githubRepoUrl} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
                  Open GitHub Repository
                </a>
                {isOwner && (
                  <button type="button" className="btn btn-primary btn-sm" onClick={handleAnalyzeRepository} disabled={analysisLoading}>
                    {analysisLoading ? 'Analyzing...' : 'Analyze Repository'}
                  </button>
                )}
                <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>
                  {github?.analyzedAt ? `Analyzed ${new Date(github.analyzedAt).toLocaleDateString()}` : 'Not analyzed yet'}
                </span>
              </div>
            )}
          </div>

          {/* Section Navigation Tabs */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              borderBottom: '2px solid var(--border)',
              marginBottom: 22,
              paddingBottom: 4,
              overflowX: 'auto'
            }}
          >
            {[
              { id: 'overview', label: '📋 Overview & Specs' },
              { id: 'autopsy', label: '🔬 Autopsy & Diagnostics' },
              { id: 'handover', label: '🌱 Claim & Revive' },
              { id: 'provenance', label: '📜 Provenance Ledger' }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className="btn-sketch-sm"
                style={{
                  background: activeTab === tab.id ? 'var(--accent)' : '#FFFFFF',
                  color: activeTab === tab.id ? '#FFFFFF' : 'var(--text)',
                  borderColor: 'var(--border)',
                  fontWeight: activeTab === tab.id ? 800 : 600,
                  fontSize: 13,
                  padding: '8px 14px',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  boxShadow: activeTab === tab.id ? 'none' : 'var(--shadow-sketch-sm)'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* TAB 1: OVERVIEW & SPECS */}
          {activeTab === 'overview' && (
            <div>
              {/* Completion Progress Gauge (owner's estimate; open graves have none) */}
              {!isOpenGrave && (
              <div
                className="surface2"
                style={{
                  padding: 20,
                  marginBottom: 24,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 20,
                  border: '2px solid var(--border)',
                  borderRadius: '16px',
                  boxShadow: 'var(--shadow-sketch-sm)'
                }}
              >
                <div
                  style={{
                    width: 66,
                    height: 66,
                    borderRadius: '50%',
                    background: '#FFFFFF',
                    border: '2px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: 17,
                    color: 'var(--text)',
                    boxShadow: '1.5px 2px 0px #141414',
                    flexShrink: 0
                  }}
                >
                  <span>{project.completion}%</span>
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14.5, fontFamily: 'var(--font-display)' }}>
                    Scope Completion Estimate
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0', lineHeight: 1.45 }}>
                    The owner&apos;s own estimate of how much of the original scope works.
                  </p>
                </div>
              </div>
              )}

              <div className="card" style={{ padding: 24, marginBottom: 24, background: '#FFFFFF' }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-display)', margin: '0 0 8px' }}>🏁 Done when</h3>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-muted)', margin: 0 }}>{project.doneWhen || DEFAULT_DONE_WHEN}</p>
                {project.starterTasks && (
                  <>
                    <h4 style={{ fontSize: 14, fontWeight: 800, margin: '16px 0 6px' }}>Starter tasks</h4>
                    <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                      {project.starterTasks.split('\n').map(t => t.trim()).filter(Boolean).map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                  </>
                )}
                {!isOpenGrave && (
                  <p style={{ fontSize: 12.5, color: 'var(--text-dim)', margin: '14px 0 0' }}>
                    {project.ownerAvailable ? '💬 The owner is happy to answer questions from whoever claims it.' : 'The owner has not offered to answer questions.'}
                  </p>
                )}
              </div>

              {project.handoffNote && (
                <div className="card" style={{ padding: 24, marginBottom: 24, background: '#FFFDF6' }}>
                  <h3 style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-display)', margin: '0 0 10px' }}>
                    ✉️ Handoff letter from the owner
                  </h3>
                  <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-muted)', margin: 0, whiteSpace: 'pre-line', fontStyle: 'italic' }}>
                    {project.handoffNote}
                  </p>
                </div>
              )}

              {/* Description */}
              <div
                className="card"
                style={{
                  padding: 24,
                  marginBottom: 24,
                  background: '#FFFFFF'
                }}
              >
                <h3 style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-display)', margin: '0 0 12px', color: 'var(--text)' }}>
                  About this codebase
                </h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.7, color: 'var(--text-muted)', margin: 0, whiteSpace: 'pre-line' }}>
                  {project.description}
                </p>
              </div>

              {github && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginBottom: 24 }}>
                  <section className="card" style={{ padding: 22, background: '#FFFFFF' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: 'var(--text-dim)' }}>Revival Score</div>
                        <div style={{ fontSize: 48, fontWeight: 800, lineHeight: 1, marginTop: 6 }}>{github.score ?? '--'}<span style={{ fontSize: 20, color: 'var(--text-muted)' }}> / 100</span></div>
                      </div>
                      <div style={{ width: 180, height: 12, background: '#E8E2D5', border: '2px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                        <div style={{ width: `${github.score || 0}%`, height: '100%', background: github.score >= 70 ? 'var(--success)' : github.score >= 40 ? 'var(--accent-warm)' : 'var(--error)' }} />
                      </div>
                    </div>
                    <p style={{ margin: '14px 0 0', color: 'var(--text-muted)', fontSize: 12.5, lineHeight: 1.5 }}>
                      How revivable it is, from real GitHub data: how recently it died (25%), README depth (20%), how many people
                      worked on it (20%), share of issues that got closed (20%), and stars/forks (15%). Analyzed {new Date(github.analyzedAt).toLocaleDateString()}.
                    </p>
                  </section>

                  <section className="card" style={{ padding: 22, background: '#FFFFFF' }}>
                    <h3 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 14px' }}>Autopsy Report</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 12 }}>
                      <div className="surface2" style={{ padding: 12 }}><div className="label">Repository Status</div><strong>{github.status}</strong></div>
                      <div className="surface2" style={{ padding: 12 }}><div className="label">Cause Of Decline</div><strong>{github.cause}</strong></div>
                      <div className="surface2" style={{ padding: 12 }}><div className="label">Last Activity</div><strong>{github.lastActivity}</strong></div>
                      <div className="surface2" style={{ padding: 12 }}><div className="label">Revival Difficulty</div><strong>{github.difficulty}</strong></div>
                    </div>
                  </section>

                  <section className="card" style={{ padding: 22, background: '#FFFFFF' }}>
                    <h3 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 14px' }}>Peak Activity</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
                      <div><div className="label">Peak Month</div><strong>{github.peakMonth || 'Unavailable'}</strong></div>
                      <div><div className="label">Commits</div><strong>{github.peakCommits ?? 0}</strong></div>
                      <div><div className="label">Contributors</div><strong>{github.peakContributors ?? 0}</strong></div>
                      {github.peakPullRequests != null && (
                        <div><div className="label">Pull Requests</div><strong>{github.peakPullRequests}</strong></div>
                      )}
                    </div>
                  </section>
                </div>
              )}

              {/* Tech Stack */}
              <div
                className="card"
                style={{
                  padding: 22,
                  marginBottom: 24,
                  background: '#FFFFFF'
                }}
              >
                <h3 style={{ fontSize: 15, fontWeight: 800, fontFamily: 'var(--font-display)', margin: '0 0 12px', color: 'var(--text)' }}>
                  Technologies & Frameworks
                </h3>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {tags.map(t => (
                    <span
                      key={t}
                      className="tag-sketch"
                      style={{ fontSize: 12.5, padding: '5px 12px', background: '#F4EFE6' }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              {/* Protocol Guarantee Box */}
              <div
                className="card"
                style={{
                  padding: 22,
                  background: '#F4EFE6',
                  border: '2px solid var(--border)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <Icon name="shield" size={17} />
                  <strong style={{ fontSize: 14.5, fontFamily: 'var(--font-display)' }}>System Enforced Trust Guarantees</strong>
                </div>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.65 }}>
                  {isOpenGrave
                    ? <li><strong>Legal by license:</strong> the {project.license} license already permits forking and modifying this code with attribution.</li>
                    : <li><strong>Verified owner:</strong> only the GitHub account that owns this repository could list it.</li>}
                  <li><strong>Git is the proof:</strong> a revival counts when a fork has {MIN_NEW_COMMITS}+ new commits made after the claim, at least one by the claimer. Nobody can withhold the reward.</li>
                  <li><strong>No silent squatting:</strong> claimers pledge {PLEDGE} credits and must show a commit within {PROOF_DAYS} days. Disappearing sends the pledge to this project&apos;s bounty; quitting honestly costs nothing.</li>
                </ul>
              </div>
            </div>
          )}

          {/* TAB 2: AUTOPSY & DIAGNOSTICS */}
          {activeTab === 'autopsy' && (
            <div>
              {/* Cause of Decline Diagnostic Tags */}
              <div className="sketch-card-static" style={{ padding: 20, marginBottom: 24, backgroundColor: 'var(--color-paper)' }}>
                <CauseOfDeclineTags tags={project.autopsyReport?.causeOfDeclineTags} />
              </div>

              {/* Autopsy Report Forensic Diagnostic */}
              <div style={{ marginBottom: 24 }}>
                <AutopsyChart report={project.autopsyReport} />
              </div>
            </div>
          )}

          {/* TAB 3: ESCROW & HANDOVER */}
          {activeTab === 'handover' && (
            <div>
              {/* Stewardship Handover Protocol & Transformation */}
              <div style={{ marginBottom: 24 }}>
                <HandoverChecklist project={project} commitment={activeCommitment} revivers={revivers} />
              </div>

              {/* Submitted Notes (if SUBMITTED) */}
              {activeCommitment?.submissionNotes && (
                <div
                  className="surface2"
                  style={{
                    padding: 20,
                    marginBottom: 24,
                    border: '2px solid var(--border)',
                    borderLeft: '6px solid var(--border)',
                    borderRadius: '12px'
                  }}
                >
                  <h4 style={{ margin: '0 0 8px', fontSize: 14.5, fontWeight: 800, color: 'var(--text)' }}>
                    Verification
                  </h4>
                  <p style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
                    {activeCommitment.submissionNotes}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: PROVENANCE LEDGER */}
          {activeTab === 'provenance' && (
            <div>
              <div style={{ marginBottom: 24 }}>
                <ProvenanceTimeline nodes={project.provenance} />
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Escrow Actions & Role Pane */}
        <div>
          {/* Action Card */}
          <div
            className="card"
            style={{
              padding: 24,
              position: 'sticky',
              top: 88,
              background: '#FFFFFF'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, paddingBottom: 12, borderBottom: '1.5px solid var(--border)' }}>
              <Icon name="lock" size={17} />
              <h3 className="font-display" style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>
                Claim & Revive
              </h3>
            </div>

            {/* CASE 1: owner of a donated project */}
            {isOwner && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ padding: '10px 12px', background: 'rgba(232,162,74,.1)', borderRadius: 8, fontSize: 13, color: 'var(--accent)' }}>
                  👑 You donated this project. You choose who gets the claim; GitHub checks the work.
                </div>

                {isPending && activeCommitment && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                      <strong>{activeCommitment.taker?.alias}</strong> ({activeCommitment.taker?.reputation} rep, {activeCommitment.taker?.ghostStrikes || 0} missed claims) wants to claim it.
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: 0 }}>
                      They have pledged {activeCommitment.stakeLocked} credits. Answer by {fmtDate(activeCommitment.requestExpiresAt)} or the request expires and their pledge goes back.
                    </p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-primary btn-block" onClick={handleApprove} disabled={actionLoading}>
                        {actionLoading ? 'Saving…' : 'Approve'}
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={handleReject} disabled={actionLoading}>Decline</button>
                    </div>
                  </div>
                )}

                {isActive && (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    <strong>{activeCommitment.taker?.alias}</strong> is reviving it.
                    <ClaimTimeline commitment={activeCommitment} />
                  </div>
                )}

                {isCompleted && (
                  <div style={{ padding: '12px 14px', background: 'rgba(95,179,163,.15)', borderRadius: 10, fontSize: 13, color: 'var(--accent-2)' }}>
                    <Icon name="check" size={15} /> Revived. The living version is linked above.
                  </div>
                )}

                {!isPending && !isActive && !isCompleted && (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    Listed and waiting for someone to request it.
                  </div>
                )}
              </div>
            )}

            {/* CASE 2: you have a claim (or a request) */}
            {isTaker && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ padding: '10px 12px', background: 'rgba(95,179,163,.12)', borderRadius: 8, fontSize: 13, color: 'var(--accent-2)' }}>
                  {myRevivalDone
                    ? '✨ You revived this project.'
                    : isPending
                      ? '⏳ Your request is with the owner.'
                      : `🛠️ You are reviving this${isOpenGrave && workingCount > 1 ? ` with ${workingCount - 1} other${workingCount === 2 ? '' : 's'}` : ''}.`}
                </div>

                {isPending && (
                  <>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                      {activeCommitment.stakeLocked} credits are pledged. If the owner declines or doesn&apos;t answer by {fmtDate(activeCommitment.requestExpiresAt)}, they come back.
                    </p>
                    <button className="btn btn-outline btn-sm btn-block" onClick={handleWithdraw} disabled={actionLoading}>
                      Cancel Request (pledge back)
                    </button>
                  </>
                )}

                {isActive && (
                  <>
                    <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                      <li>Fork it{isOpenGrave && project.revivedRepoUrl ? ' (or work in the community fork)' : ''} and push a commit of your own.</li>
                      <li>Keep going until the fork has {MIN_NEW_COMMITS} new commits.</li>
                      <li>Press <strong>Check my fork</strong>. GitHub decides the rest.</li>
                    </ol>
                    <ClaimTimeline commitment={activeCommitment} />
                    <a className="btn btn-primary btn-block" href={`${project.revivedRepoUrl || project.githubRepoUrl}/fork`} target="_blank" rel="noreferrer"
                      style={{ textAlign: 'center', textDecoration: 'none' }}>
                      Fork on GitHub ↗
                    </a>
                    <button className="btn btn-teal btn-block" onClick={() => { setSubmissionUrl(activeCommitment.forkUrl || ''); setSubmitModalOpen(true); }}>
                      <Icon name="upload" size={15} /> Check My Fork
                    </button>
                    <button className="btn btn-outline btn-sm btn-block" onClick={handleWithdraw} disabled={actionLoading}>
                      Quit (pledge back, no penalty)
                    </button>
                    <div style={{ fontSize: 11.5, color: 'var(--text-dim)', textAlign: 'center', lineHeight: 1.45 }}>
                      Missing a date without quitting sends your pledge to this project&apos;s bounty.
                    </div>
                  </>
                )}

                {myRevivalDone && activeCommitment?.submissionNotes && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'pre-line' }}>{activeCommitment.submissionNotes}</div>
                )}
              </div>
            )}

            {/* CASE 3: everyone else */}
            {!isOwner && !isTaker && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {canClaim ? (
                  <>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                      {isOpenGrave
                        ? (isCompleted
                          ? 'Already revived, and still open: join to keep improving the living version.'
                          : workingCount > 0
                            ? `${workingCount} ${workingCount === 1 ? 'person is' : 'people are'} reviving this. Anyone can join.`
                            : 'Anyone can claim it. The license already allows forking.')
                        : 'The owner picks one person to revive it. Request it and they have 3 days to answer.'}
                    </div>
                    <div className="surface2" style={{ padding: 14, borderRadius: 10, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <Row label="Pledge (returned when you finish or quit)" value={`${PLEDGE} cr`} />
                      <Row label="First commit due" value={`within ${PROOF_DAYS} days`} />
                      <Row label="Finish within" value={`${project.claimDays || 30} days`} />
                      <Row label="Reward" value={`+${REVIVE_REWARD} cr${project.bounty > 0 ? ` + ${project.bounty} bounty` : ''}`} strong />
                      {currentUser && <Row label="Your balance" value={`${currentUser.credits} cr`} />}
                    </div>
                    {!currentUser ? (
                      <Link href={`/login?redirect=/project/${project.id}`} className="btn btn-primary btn-block"
                        style={{ textAlign: 'center', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        Sign In to Claim →
                      </Link>
                    ) : (
                      <button className="btn btn-primary btn-block" onClick={handleCommit}
                        disabled={actionLoading || !canAffordPledge(currentUser.credits) || currentUser.banned || !currentUser.githubUsername}>
                        {actionLoading ? 'Claiming…' : isOpenGrave
                          ? `${workingCount > 0 || isCompleted ? '🤝 Join' : '🌱 Claim'} (pledge ${PLEDGE} cr)`
                          : `🙋 Request This Project (pledge ${PLEDGE} cr)`}
                      </button>
                    )}
                    {currentUser && !currentUser.githubUsername && (
                      <div style={{ fontSize: 12, color: 'var(--error)', textAlign: 'center' }}>Connect GitHub to claim: your commits are how progress is checked.</div>
                    )}
                    {currentUser && currentUser.banned && (
                      <div style={{ fontSize: 12, color: 'var(--error)', textAlign: 'center' }}>You left 3 claims without finishing or quitting, so you can&apos;t claim new projects.</div>
                    )}
                    {currentUser && !currentUser.banned && !canAffordPledge(currentUser.credits) && (
                      <div style={{ fontSize: 12, color: 'var(--error)', textAlign: 'center' }}>
                        You need {PLEDGE - currentUser.credits} more credits. Finish or quit a claim to free some.
                      </div>
                    )}
                  </>
                ) : isCompleted ? (
                  <div style={{ padding: '14px', background: '#D9F2D4', borderRadius: 10, fontSize: 13, textAlign: 'center' }}>
                    ✨ Already revived{project.revivedRepoUrl ? ' — see the living version linked above.' : '.'}
                  </div>
                ) : (
                  <div style={{ padding: '14px', background: 'var(--surface-2)', borderRadius: 10, fontSize: 13, color: 'var(--text-dim)', textAlign: 'center' }}>
                    🌱 Someone has this project right now. If they quit or miss a date, it opens up again.
                  </div>
                )}
              </div>
            )}

            {/* Revival crew: everyone who joined this community project */}
            {isOpenGrave && (
              <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1.5px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                  <h4 className="font-display" style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>Revival Crew</h4>
                  <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>
                    {revivers.length === 0 ? 'nobody yet' : `${revivers.length} ${revivers.length === 1 ? 'person' : 'people'}`}
                  </span>
                </div>
                {revivers.length === 0 ? (
                  <p style={{ fontSize: 12.5, color: 'var(--text-dim)', margin: 0 }}>Be the first to join. Anyone else can join you later.</p>
                ) : (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {revivers.map(r => (
                      <li key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5 }}>
                        <span style={{ whiteSpace: 'nowrap' }}>
                          <strong>{r.alias}</strong>
                          {currentUser?.alias === r.alias && <span style={{ color: 'var(--text-dim)' }}> (you)</span>}
                        </span>
                        {r.status === 'COMPLETED' ? (
                          r.forkUrl ? (
                            <a href={r.forkUrl} target="_blank" rel="noreferrer" style={{ color: '#15803d', fontWeight: 700 }}>✨ verified fork ↗</a>
                          ) : (
                            <span style={{ color: '#15803d', fontWeight: 700 }}>✨ verified</span>
                          )
                        ) : (
                          <span style={{ color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                            joined {new Date(r.joinedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {project.revivedRepoUrl && (
                  <a href={project.revivedRepoUrl} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm btn-block"
                    style={{ marginTop: 12, textAlign: 'center', textDecoration: 'none' }}>
                    Community Fork (send PRs here) ↗
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Check my fork */}
      {submitModalOpen && (
        <div className="modal-backdrop" onClick={() => setSubmitModalOpen(false)}>
          <div className="modal-sketch" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 className="font-display" style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Check My Fork</h3>
              <button className="btn-icon btn-ghost" onClick={() => setSubmitModalOpen(false)}>
                <Icon name="close" size={18} />
              </button>
            </div>
            <p style={{ fontSize: 13.5, color: 'var(--text-muted)', marginBottom: 18, lineHeight: 1.5 }}>
              We ask GitHub whether this is a fork of the original with new commits since you claimed it, and whether at least one is yours.
              One of your commits passes the 7-day check. {MIN_NEW_COMMITS} new commits finishes the revival and pays out straight away.
            </p>
            <label className="label">Your fork on GitHub *</label>
            <input
              className="input"
              placeholder={'https://github.com/you/' + (project.githubRepoName || 'repo')}
              value={submissionUrl}
              onChange={e => setSubmissionUrl(e.target.value)}
            />
            <button
              className="btn btn-primary btn-block"
              style={{ marginTop: 16, padding: '12px' }}
              onClick={handleCheckFork}
              disabled={actionLoading || !submissionUrl.trim()}
            >
              {actionLoading ? 'Asking GitHub…' : 'Check My Fork'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}

function Row({ label, value, strong }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
      <span>{label}</span>
      <strong style={strong ? { color: 'var(--accent-2)' } : undefined}>{value}</strong>
    </div>
  );
}

// The two dates that matter on an active claim.
function ClaimTimeline({ commitment }) {
  if (!commitment) return null;
  return (
    <div className="surface2" style={{ padding: 12, borderRadius: 10, fontSize: 12.5, lineHeight: 1.7, marginTop: 6 }}>
      {commitment.proofAt
        ? <div>✅ First commit seen {fmtDate(commitment.proofAt)}</div>
        : commitment.proofDueAt && <div>⏱️ First own commit due <strong>{fmtDate(commitment.proofDueAt)}</strong></div>}
      {commitment.ghostDeadlineAt && <div>🏁 Finish by <strong>{fmtDate(commitment.ghostDeadlineAt)}</strong></div>}
      {commitment.stakeLocked > 0 && <div>🤝 Pledged {commitment.stakeLocked} cr</div>}
    </div>
  );
}

export async function getStaticPaths() {
  // Real projects are rendered on demand; the p1–p12 sample pages exist only in a static demo export.
  const ids = process.env.NEXT_PUBLIC_STATIC_DEMO === 'true' ? ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11', 'p12'] : [];
  return {
    paths: ids.map(id => ({ params: { id } })),
    fallback: process.env.GITHUB_PAGES === 'true' ? false : 'blocking'
  };
}

export async function getStaticProps({ params }) {
  return {
    props: {
      projectId: params.id
    }
  };
}

