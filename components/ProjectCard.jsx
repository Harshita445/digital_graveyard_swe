import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  Clock,
  Activity,
  GitFork,
  ArrowRight,
  Code,
  Cpu,
  Layers,
  GraduationCap,
  Globe,
  Coins,
  ShieldCheck
} from 'lucide-react';

export default function ProjectCard({ project, index = 0 }) {
  const router = useRouter();
  let tags = [];
  try {
    tags = typeof project.techTags === 'string' ? JSON.parse(project.techTags) : project.techTags || [];
  } catch (e) {
    tags = (project.techTags || '').split(',').map((s) => s.trim()).filter(Boolean);
  }

  const getDomainIcon = (category) => {
    switch (category) {
      case 'DevTools':
      case 'Developer Tools':
        return <Code style={{ width: 20, height: 20 }} />;
      case 'AI/ML':
      case 'AI & Data':
        return <Cpu style={{ width: 20, height: 20 }} />;
      case 'IoT':
      case 'Infrastructure':
        return <Layers style={{ width: 20, height: 20 }} />;
      case 'Education':
      case 'Campus':
        return <GraduationCap style={{ width: 20, height: 20 }} />;
      default:
        return <Globe style={{ width: 20, height: 20 }} />;
    }
  };

  // Only real, computed scores are shown; unanalyzed projects say so.
  const revivalScore = project.revivalScore?.overallScore ?? null;

  const district = project.district || project.category;
  const license = project.license || 'No license';
  const lastActiveText = project.lastActiveRecency ? `Last commit ${project.lastActiveRecency}` : 'Activity unknown';

  const isOpenGrave = project.source === 'OPEN_GRAVE';
  const statusBadge = {
    LISTED: { label: '🪦 Dead', bg: 'var(--color-paper-dark)' },
    PENDING_APPROVAL: { label: '⏳ Claim pending', bg: '#FFF4D6' },
    ACTIVE: { label: '🌱 Being revived', bg: '#E3F4E1' },
    SUBMITTED: { label: '🔎 In review', bg: '#FFF4D6' },
    COMPLETED: { label: '✨ Revived', bg: '#D9F2D4' },
    GHOSTED_RELISTED: { label: '🪦 Dead again', bg: 'var(--color-paper-dark)' }
  }[project.status] || { label: project.status, bg: 'var(--color-paper-dark)' };

  const hasTornCorner = project.hasTornCorner ?? (index % 2 === 0);

  const handleCardClick = (e) => {
    // If user clicked directly on a link or button, let that handle it
    if (e.target.closest('a') || e.target.closest('button')) return;
    router.push(`/project/${project.id}`);
  };

  return (
    <div
      className="sketch-card"
      onClick={handleCardClick}
      style={{
        padding: '20px 20px 16px',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        cursor: 'pointer',
        minHeight: 270,
        backgroundColor: 'var(--color-paper)'
      }}
    >
      {/* Torn Corner Detail (incidental vintage wear) */}
      {hasTornCorner && (
        <svg
          className="crack-corner"
          viewBox="0 0 20 20"
          fill="none"
          style={{ position: 'absolute', top: 6, right: 8, width: 18, height: 18, pointerEvents: 'none' }}
        >
          <path d="M 0 0 L 20 0 L 20 20 Z" fill="#ede9df" stroke="#141414" strokeWidth="1.5" />
          <line x1="2" y1="18" x2="18" y2="2" stroke="#141414" strokeWidth="1.2" />
        </svg>
      )}

      <div>
        {/* Card Header: Tombstone Frame Icon + Title & Badges */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Tombstone Headstone Frame */}
            <div
              className="sketch-headstone"
              style={{
                width: 40,
                height: 48,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'var(--color-paper-dark)',
                color: 'var(--color-ink)',
                flexShrink: 0
              }}
            >
              {getDomainIcon(project.category || project.domainCategory)}
            </div>

            <div>
              <Link
                href={`/project/${project.id}`}
                style={{
                  textDecoration: 'none',
                  color: 'var(--color-ink)',
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 700,
                  fontSize: 16.5,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  lineHeight: 1.25
                }}
              >
                <span>{project.title}</span>
                <ArrowRight style={{ width: 14, height: 14, opacity: 0.7 }} />
              </Link>

              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'rgba(17, 17, 17, 0.65)', display: 'block', marginTop: 2 }}>
                {district}
              </span>
            </div>
          </div>

          {/* Permissive License / Fork Friendly Badge */}
          <span
            className="sketch-tag"
            style={{
              padding: '2px 6px',
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              gap: 3,
              flexShrink: 0
            }}
            title={project.isForkFriendly ? 'Open-source license: anyone may fork it' : 'No open license: only the owner can grant reuse'}
          >
            <GitFork style={{ width: 10, height: 10 }} />
            <span>{license}</span>
          </span>
        </div>

        {/* Tagline / Description */}
        <p
          style={{
            fontSize: 13,
            color: 'rgba(17, 17, 17, 0.82)',
            lineHeight: 1.45,
            marginBottom: 12,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            fontFamily: 'var(--font-sans)'
          }}
        >
          {project.tagline || project.description}
        </p>

        {/* Tech Stack Tags & Stake Requirement */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {tags.slice(0, 3).map((tech) => (
            <span
              key={tech}
              className="sketch-tag"
              style={{
                padding: '2px 7px',
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                color: 'rgba(17, 17, 17, 0.85)'
              }}
            >
              {tech}
            </span>
          ))}
          <span className="sketch-tag" style={{ padding: '2px 7px', fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, backgroundColor: statusBadge.bg }}>
            {statusBadge.label}
          </span>
          <span className="sketch-tag" style={{ padding: '2px 7px', fontSize: 11, fontFamily: 'var(--font-mono)' }}
            title={isOpenGrave ? 'Abandoned public repo; its license already allows anyone to fork it' : 'Listed by its verified owner'}>
            {isOpenGrave ? '🔓 Open grave' : '🤝 Donated'}
          </span>
          {project.stakeRequired > 0 && (
            <span
              className="sketch-tag"
              style={{
                padding: '2px 7px',
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                backgroundColor: 'var(--color-paper-dark)'
              }}
            >
              🪙 {project.stakeRequired} cr stake
            </span>
          )}
        </div>
      </div>

      {/* Footer Info Row */}
      <div
        style={{
          paddingTop: 10,
          borderTop: '2px solid rgba(17, 17, 17, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 11.5,
          fontFamily: 'var(--font-mono)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(17, 17, 17, 0.7)' }}>
          <Clock style={{ width: 13, height: 13 }} />
          <span>{lastActiveText}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700, color: 'var(--color-ink)' }}>
          <Activity style={{ width: 13, height: 13 }} />
          <span>{revivalScore === null ? 'Not analyzed' : `Revival score ${revivalScore}`}</span>
        </div>
      </div>
    </div>
  );
}
