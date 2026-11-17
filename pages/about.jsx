import React, { useState } from 'react';
import Icon from '../components/Icons';

export default function About() {
  const [openFaq, setOpenFaq] = useState(0);

  const faqs = [
    {
      q: "Is it legal to revive someone else's project?",
      a: 'For open graves, yes. We only list a public repository if its open-source license (MIT, Apache, BSD, GPL and similar) already gives everyone the right to fork and modify it. You work in your own fork, the original is never touched, and the license requires you to keep crediting the original author. Repos with no license, or a license that does not allow this, can only be listed by their owner as a donation.'
    },
    {
      q: 'What counts as “dead”?',
      a: 'The owner archived the repository, or nobody has pushed to it for at least 12 months. The listing check asks GitHub directly, so an active project like Linux is refused automatically.'
    },
    {
      q: 'How do you stop people taking credit for work they did not do?',
      a: 'Git history is the proof. When you submit a revival, we check with GitHub that your repository is a real fork of the original and that it has new commits made after you claimed it. Commits made before the claim, or by copying the code into a fresh repo, do not count. The original author stays credited on the project page forever.'
    },
    {
      q: 'Why does claiming an open grave cost nothing, but a donated project needs a stake?',
      a: "Anyone could fork an open grave anyway, so a claim is only a public “I'm working on this” flag for 14 days. A donated project is different: a real owner is handing over their work and waiting for you, so the builder locks a credit stake that they lose if they disappear, and the owner gets 7 days to review before the work is approved automatically."
    },
    {
      q: 'What is in the autopsy report?',
      a: "It is built from the repository's real GitHub history: commits per year or quarter over its whole life, the peak, when the main contributor stopped, open versus closed issues, stars and forks. From that it diagnoses the most likely cause of death (for example maintainer departure, solo-maintainer burnout, gradual fade-out or an abrupt stop) and suggests where a reviver should start."
    },
    {
      q: 'Why is there no chat, and why the Digger-#### aliases?',
      a: "These apply to donated projects. Owner and builder never negotiate: the system's fixed rules handle the handover, stakes and deadlines, so there is nothing to argue about and no pressure. Aliases keep both sides anonymous. Your GitHub username is never shown to other users."
    },
    {
      q: 'Is real money involved?',
      a: 'No. Credits are an internal points system with no cash value. They exist so that ghosting a donated project has a cost.'
    }
  ];

  return (
    <div className="container" style={{ padding: '40px 0 80px', maxWidth: 840 }}>
      {/* Title */}
      <div style={{ marginBottom: 36, textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: '#FFFFFF', border: '1.8px solid var(--border)', borderRadius: '20px', fontSize: 12, fontWeight: 700, marginBottom: 14, boxShadow: '1.5px 1.5px 0px #141414' }}>
          <Icon name="tombstone" size={13} /> The On Digital Graveyard
        </div>
        <h1 className="font-display" style={{ fontSize: 36, fontWeight: 800, margin: '0 0 12px', letterSpacing: '-0.03em' }}>
          The Digital Graveyard Manifesto
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 16, lineHeight: 1.65, margin: '0 auto', maxWidth: 640 }}>
          Every year thousands of good open-source projects quietly die: the maintainer moves on and the code sits frozen.
          Digital Graveyard finds them, explains why they died, and lets anyone legally bring them back, with git history as proof of who did the work.
        </p>
      </div>

      {/* The Two Fears Cards */}
      <div
        className="card"
        style={{
          padding: 28,
          marginBottom: 36,
          background: '#FFFFFF',
          borderRadius: '18px',
          boxShadow: '3px 4px 0px #141414'
        }}
      >
        <h3 className="font-display" style={{ fontSize: 18, fontWeight: 800, margin: '0 0 16px', letterSpacing: '-0.02em' }}>
          Two Ways a Project Enters the Graveyard
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <div
            style={{
              padding: 20,
              background: '#F4EFE6',
              border: '2px solid var(--border)',
              borderRadius: '14px',
              boxShadow: '1.5px 2px 0px #141414'
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)', marginBottom: 8, fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>🔓 1. Open Graves</span>
            </div>
            <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: 0, lineHeight: 1.55 }}>
              A public repository that is archived or untouched for 12+ months and whose open-source license already allows forking. Anyone can list it; no owner permission is needed.
            </p>
            <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: '#141414' }}>
              ✓ Free to claim. Fork it, commit, and the revival is verified automatically.
            </div>
          </div>

          <div
            style={{
              padding: 20,
              background: '#F4EFE6',
              border: '2px solid var(--border)',
              borderRadius: '14px',
              boxShadow: '1.5px 2px 0px #141414'
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)', marginBottom: 8, fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>🎁 2. Donated Projects</span>
            </div>
            <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: 0, lineHeight: 1.55 }}>
              The owner lists their own unfinished project (we check that your GitHub account owns the repo) and can leave a handoff letter for whoever picks it up.
            </p>
            <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: '#1E6B3E' }}>
              ✓ Protected by credit stakes, a 7-day auto-release and reputation strikes.
            </div>
          </div>
        </div>
      </div>

      {/* Core Differentiators Table */}
      <div style={{ marginBottom: 40 }}>
        <h2 className="font-display" style={{ fontSize: 24, fontWeight: 800, marginBottom: 16, letterSpacing: '-0.02em' }}>
          How It Differs
        </h2>
        <div
          className="card"
          style={{
            overflow: 'hidden',
            background: '#FFFFFF',
            borderRadius: '16px',
            boxShadow: '3px 4px 0px #141414'
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#F4EFE6', borderBottom: '2px solid var(--border)' }}>
                <th style={{ padding: '14px 18px', width: '45%', color: 'var(--text-muted)', fontWeight: 800 }}>A dead repo on GitHub today</th>
                <th style={{ padding: '14px 18px', color: 'var(--text)', fontWeight: 800 }}>On Digital Graveyard</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1.5px dotted var(--border)' }}>
                <td style={{ padding: '14px 18px', color: 'var(--text-muted)' }}>Nobody knows it exists or why it stopped</td>
                <td style={{ padding: '14px 18px', fontWeight: 700 }}>Searchable listing with an autopsy built from its real history</td>
              </tr>
              <tr style={{ borderBottom: '1.5px dotted var(--border)' }}>
                <td style={{ padding: '14px 18px', color: 'var(--text-muted)' }}>Unclear if you are even allowed to continue it</td>
                <td style={{ padding: '14px 18px', fontWeight: 700 }}>Only listed when its license already allows forking</td>
              </tr>
              <tr style={{ borderBottom: '1.5px dotted var(--border)' }}>
                <td style={{ padding: '14px 18px', color: 'var(--text-muted)' }}>Several people may fork it without knowing about each other</td>
                <td style={{ padding: '14px 18px', fontWeight: 700 }}>A public claim shows who is working on it</td>
              </tr>
              <tr style={{ borderBottom: '1.5px dotted var(--border)' }}>
                <td style={{ padding: '14px 18px', color: 'var(--text-muted)' }}>A revival is invisible unless you go looking</td>
                <td style={{ padding: '14px 18px', fontWeight: 700 }}>The verified fork is linked on the project page</td>
              </tr>
              <tr>
                <td style={{ padding: '14px 18px', color: 'var(--text-muted)' }}>Credit for the work is easy to blur</td>
                <td style={{ padding: '14px 18px', fontWeight: 800, color: '#1E6B3E' }}>Git commits prove who did what; the original author stays credited</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* FAQ Accordion */}
      <div>
        <h2 className="font-display" style={{ fontSize: 24, fontWeight: 800, marginBottom: 18, letterSpacing: '-0.02em' }}>
          Frequently Asked Questions
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {faqs.map((f, idx) => (
            <div
              key={idx}
              className="card"
              style={{
                borderRadius: '14px',
                overflow: 'hidden',
                background: '#FFFFFF',
                boxShadow: openFaq === idx ? '2px 3px 0px #141414' : '1px 2px 0px #141414'
              }}
            >
              <button
                onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                style={{
                  width: '100%',
                  background: openFaq === idx ? '#F4EFE6' : '#FFFFFF',
                  border: 'none',
                  color: 'var(--text)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '16px 20px',
                  textAlign: 'left',
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'background 0.15s'
                }}
              >
                <span>{f.q}</span>
                <Icon name={openFaq === idx ? 'close' : 'chevronDown'} size={16} />
              </button>
              {openFaq === idx && (
                <div style={{ padding: '16px 20px', fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.65, borderTop: '1.5px solid var(--border)' }}>
                  {f.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
