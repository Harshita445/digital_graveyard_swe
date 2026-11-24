import React, { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { CheckCircle2, Circle, Award, Sprout, TreeDeciduous, ExternalLink } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { PLEDGE, PROOF_DAYS, MIN_NEW_COMMITS, REVIVE_REWARD } from '../lib/claimRules';

const fmt = d => (d ? new Date(d).toLocaleDateString() : null);

// Every step is ticked off by real data (GitHub checks or the system's own records).
// Nobody clicks "sign": an open grave has no owner around to sign anything.
function openGraveSteps(project, revivers) {
  const revived = project.status === 'COMPLETED';
  const author = project.githubRepoOwner ? `@${project.githubRepoOwner}` : 'the original author';
  const first = revivers[0];
  const firstVerified = revivers.filter(r => r.verifiedAt).sort((a, b) => new Date(a.verifiedAt) - new Date(b.verifiedAt))[0];
  const names = revivers.map(r => r.alias);
  const crew = names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;
  return [
    {
      title: 'Grave verified as dead and legally revivable',
      description: `GitHub confirms it is archived or untouched for 12+ months, and its ${project.githubLicense || 'open-source'} license already allows anyone to fork and modify it.`,
      checkedBy: 'GitHub',
      done: true,
      when: fmt(project.createdAt)
    },
    {
      title: 'Claimed by revivers',
      description: first
        ? `${crew} ${names.length === 1 ? 'has' : 'have'} joined. It is a community project, so anyone else can join too.`
        : `Anyone can claim it with a ${PLEDGE}-credit pledge, and more people can join later. Each claimer must show a commit of their own within ${PROOF_DAYS} days.`,
      checkedBy: 'System',
      done: Boolean(first),
      when: first ? fmt(first.joinedAt) : null
    },
    {
      title: 'A fork has new commits made after the claim',
      description: `GitHub is asked whether the fork really is a fork of the original, with ${MIN_NEW_COMMITS}+ commits newer than the claim and at least one by the claimer.`,
      checkedBy: 'GitHub',
      done: revived,
      when: firstVerified ? fmt(firstVerified.verifiedAt) : null
    },
    {
      title: 'Revived, with the original author credited',
      description: revived
        ? `The first verified fork is now the community fork: later revivers send it pull requests. ${author} stays credited as the creator, as the license requires.`
        : `Once verified, the fork is linked here and ${author} stays credited as the creator.`,
      checkedBy: 'System',
      done: revived,
      when: null,
      link: revived ? project.revivedRepoUrl : null
    }
  ];
}

function donatedSteps(project, commitment) {
  const s = project.status;
  const approved = ['ACTIVE', 'COMPLETED'].includes(s);
  let approvalText = `Waiting for someone to request it (with a ${PLEDGE}-credit pledge).`;
  if (approved) {
    approvalText = `${commitment?.taker?.alias || 'The builder'} was approved. Their ${commitment?.stakeLocked || PLEDGE}-credit pledge comes back when they finish or quit.`;
  } else if (s === 'PENDING_APPROVAL') {
    approvalText = 'Someone has requested it. The owner has 3 days to approve or decline, or the request expires.';
  }
  return [
    {
      title: 'Ownership verified',
      description: "The lister's connected GitHub account owns this repository, so they have the right to give it away.",
      checkedBy: 'GitHub',
      done: true,
      when: fmt(project.createdAt)
    },
    {
      title: 'Builder approved',
      description: approvalText,
      checkedBy: 'Owner',
      done: approved,
      when: approved ? fmt(commitment?.approvedAt) : null
    },
    {
      title: `First own commit within ${PROOF_DAYS} days`,
      description: 'Checked on GitHub every day. No commit and no quit means the claim is released and the pledge goes to the bounty.',
      checkedBy: 'GitHub',
      done: s === 'COMPLETED' || Boolean(commitment?.proofAt),
      when: fmt(commitment?.proofAt)
    },
    {
      title: 'Revived',
      description: `The fork reaches ${MIN_NEW_COMMITS}+ new commits before the deadline. The pledge comes back with a ${REVIVE_REWARD}-credit reward. GitHub decides, not the owner.`,
      checkedBy: 'GitHub',
      done: s === 'COMPLETED',
      when: s === 'COMPLETED' ? fmt(commitment?.resolvedAt) : null,
      link: s === 'COMPLETED' ? project.revivedRepoUrl : null
    }
  ];
}

export default function HandoverChecklist({ project, commitment, revivers = [] }) {
  const isOpenGrave = project?.source === 'OPEN_GRAVE';
  const steps = isOpenGrave ? openGraveSteps(project, revivers) : donatedSteps(project, commitment);
  const isCompleted = project?.status === 'COMPLETED';
  let growthStage = 'tombstone';
  if (isCompleted) growthStage = 'tree';
  else if (project?.status === 'ACTIVE') growthStage = 'sapling';

  // Celebrate once when a completed revival is shown.
  const celebrated = useRef(false);
  useEffect(() => {
    if (!isCompleted || celebrated.current) return;
    celebrated.current = true;
    try { confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 } }); } catch (e) { /* optional effect */ }
  }, [isCompleted]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div
        className="sketch-card-static"
        style={{ padding: 24, textAlign: 'center', backgroundColor: 'rgba(244, 239, 230, 0.45)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}
      >
        <div style={{ width: 80, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {growthStage === 'tombstone' && (
            <svg style={{ width: 56, height: 68, color: 'var(--color-ink)' }} stroke="currentColor" fill="none" strokeWidth="2.5" viewBox="0 0 40 48">
              <path d="M 8 45 L 8 18 C 8 8, 32 8, 32 18 L 32 45" />
              <path d="M 4 45 L 36 45" />
              <path d="M 16 26 L 24 26 M 20 22 L 20 34" strokeWidth="2" />
            </svg>
          )}
          {growthStage === 'sapling' && <Sprout style={{ width: 56, height: 56, color: '#15803d', strokeWidth: 2 }} />}
          {growthStage === 'tree' && <TreeDeciduous style={{ width: 68, height: 68, color: '#15803d', strokeWidth: 2 }} />}
        </div>
        <div>
          <h2 style={{ fontFamily: 'var(--font-hand)', fontSize: 30, fontWeight: 700, margin: 0, color: 'var(--color-ink)' }}>
            {growthStage === 'tombstone' && 'Waiting for a Reviver'}
            {growthStage === 'sapling' && 'Revival in Progress'}
            {growthStage === 'tree' && '🎉 Revived!'}
          </h2>
          <p style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'rgba(17, 17, 17, 0.7)', maxWidth: 560, margin: '6px auto 0' }}>
            {isOpenGrave
              ? 'No signatures needed: the license already gives permission, and GitHub history proves the work. Each step below ticks itself off.'
              : 'The owner donated this project. Each step below ticks itself off as the owner and builder act on the platform.'}
          </p>
        </div>
      </div>

      <div className="sketch-card-static" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ paddingBottom: 12, borderBottom: '2px solid rgba(17, 17, 17, 0.12)' }}>
          <h3 style={{ fontFamily: 'var(--font-hand)', fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--color-ink)' }}>
            {isOpenGrave ? 'Revival Checklist' : 'Handover Checklist'}
          </h3>
          <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'rgba(17, 17, 17, 0.65)', margin: '2px 0 0' }}>
            Checked automatically, nothing to click
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {steps.map((step, idx) => (
            <div
              key={step.title}
              className="sketch-card-static"
              style={{ padding: 16, backgroundColor: step.done ? 'rgba(244, 239, 230, 0.4)' : 'var(--color-paper)' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flex: '1 1 320px' }}>
                  {step.done
                    ? <CheckCircle2 style={{ width: 22, height: 22, color: '#15803d', flexShrink: 0 }} />
                    : <Circle style={{ width: 22, height: 22, color: 'rgba(17, 17, 17, 0.4)', flexShrink: 0 }} />}
                  <div>
                    <h4 style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 14.5, margin: 0, color: 'var(--color-ink)' }}>
                      {idx + 1}. {step.title}
                    </h4>
                    <p style={{ fontSize: 12.5, color: 'rgba(17, 17, 17, 0.8)', lineHeight: 1.4, margin: '4px 0 0', fontFamily: 'var(--font-sans)' }}>
                      {step.description}
                    </p>
                    {step.link && (
                      <a href={step.link} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 12.5, fontWeight: 700, color: 'var(--color-ink)' }}>
                        View the revived fork <ExternalLink style={{ width: 12, height: 12 }} />
                      </a>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <span className="sketch-tag" style={{ padding: '2px 6px', fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700, color: step.done ? '#15803d' : 'rgba(17, 17, 17, 0.6)', gap: 3 }}>
                    {step.done && <Award style={{ width: 11, height: 11 }} />}
                    <span>{step.done ? 'DONE' : 'PENDING'}</span>
                  </span>
                  <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'rgba(17, 17, 17, 0.6)' }}>
                    Checked by: {step.checkedBy}{step.done && step.when ? ` · ${step.when}` : ''}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
