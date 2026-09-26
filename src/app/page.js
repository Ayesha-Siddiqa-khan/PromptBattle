'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Generate or retrieve persistent player ID for current browser session
  const getPlayerId = () => {
    let id = localStorage.getItem('pb_player_id');
    if (!id) {
      id = 'user_' + Math.random().toString(36).substring(2, 9);
      localStorage.setItem('pb_player_id', id);
    }
    return id;
  };

  const handleCreateRoom = async () => {
    try {
      setIsCreating(true);
      setErrorMessage('');
      const playerId = getPlayerId();

      const res = await fetch('/api/rooms/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId }),
      });

      const data = await res.json();
      if (data.success && data.room) {
        router.push(`/room/${data.room.code}`);
      } else {
        setErrorMessage(data.error || 'Failed to create arena.');
      }
    } catch (err) {
      setErrorMessage('Network error while creating arena.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = async (e) => {
    e.preventDefault();
    if (!joinCode.trim()) return;

    try {
      setIsJoining(true);
      setErrorMessage('');
      const cleanCode = joinCode.trim().toUpperCase();
      const playerId = getPlayerId();

      const res = await fetch('/api/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: cleanCode, playerId }),
      });

      const data = await res.json();
      if (data.success && data.room) {
        router.push(`/room/${cleanCode}`);
      } else {
        setErrorMessage(data.error || 'Arena room not found.');
      }
    } catch (err) {
      setErrorMessage('Network error while joining arena.');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Navbar */}
      <header style={{
        padding: '20px 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{
            fontSize: '1.6rem',
            fontWeight: '800',
            letterSpacing: '-0.02em',
            background: 'linear-gradient(135deg, #00f0ff 0%, #ff2a85 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            PROMPTBATTLE
          </span>
          <span className="status-badge" style={{ color: 'var(--player1-accent)', borderColor: 'rgba(0,240,255,0.3)' }}>
            <span className="badge-pulse-dot" style={{ backgroundColor: 'var(--player1-accent)' }} />
            LIVE ARENA
          </span>
        </div>
      </header>

      {/* Hero Section */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 24px',
        maxWidth: '1000px',
        margin: '0 auto',
        width: '100%',
        textAlign: 'center',
      }}>
        <div className="status-badge" style={{ marginBottom: '24px', color: 'var(--text-secondary)' }}>
          ⚡ 1v1 Real-Time Creative Duel
        </div>

        <h1 style={{
          fontSize: 'clamp(2.5rem, 6vw, 4.2rem)',
          fontWeight: '800',
          lineHeight: '1.1',
          letterSpacing: '-0.03em',
          marginBottom: '20px',
        }}>
          Where AI Prompters <br />
          <span style={{
            background: 'linear-gradient(135deg, #00f0ff 30%, #ff2a85 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            Clash Live in the Arena
          </span>
        </h1>

        <p style={{
          fontSize: '1.2rem',
          color: 'var(--text-secondary)',
          maxWidth: '650px',
          lineHeight: '1.6',
          marginBottom: '40px',
        }}>
          Two creators receive an unexpected theme, craft their AI prompts in real time, and face off side-by-side as spectators vote live.
        </p>

        {/* Action Panel */}
        <div className="glass-panel" style={{
          padding: '36px',
          width: '100%',
          maxWidth: '560px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
        }}>
          {errorMessage && (
            <div style={{
              background: 'rgba(255, 42, 133, 0.15)',
              border: '1px solid rgba(255, 42, 133, 0.4)',
              color: '#ff6ba8',
              padding: '12px 16px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.95rem',
            }}>
              {errorMessage}
            </div>
          )}

          {/* Create Button */}
          <button
            id="btn-create-arena"
            className="btn-primary"
            style={{ width: '100%', padding: '16px 28px', fontSize: '1.1rem' }}
            onClick={handleCreateRoom}
            disabled={isCreating}
          >
            {isCreating ? (
              <>
                <div className="spinner" style={{ width: '18px', height: '18px' }} />
                <span>Creating Battle Arena...</span>
              </>
            ) : (
              <>
                <span>⚔️ Create New Arena</span>
              </>
            )}
          </button>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            color: 'var(--text-muted)',
            fontSize: '0.85rem',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
            <span>OR JOIN EXISTING</span>
            <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
          </div>

          {/* Join Form */}
          <form onSubmit={handleJoinRoom} style={{ display: 'flex', gap: '12px' }}>
            <input
              id="input-room-code"
              type="text"
              placeholder="ENTER ROOM CODE (e.g. 7X9K2A)"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
              style={{
                flex: 1,
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-full)',
                padding: '14px 22px',
                color: '#fff',
                fontSize: '1rem',
                letterSpacing: '0.1em',
                fontWeight: '600',
                textAlign: 'center',
              }}
            />
            <button
              id="btn-join-arena"
              type="submit"
              className="btn-secondary"
              disabled={isJoining || !joinCode.trim()}
            >
              {isJoining ? 'Joining...' : 'Enter'}
            </button>
          </form>
        </div>

        {/* 4 Steps Showcase */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '20px',
          width: '100%',
          marginTop: '60px',
          textAlign: 'left',
        }}>
          <div className="glass-panel" style={{ padding: '24px' }}>
            <div style={{ fontSize: '1.8rem', marginBottom: '12px' }}>🎯</div>
            <h2 style={{ fontSize: '1.05rem', fontWeight: '700', marginBottom: '8px' }}>1. Surprise Theme</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              Both players unlock the challenge prompt simultaneously.
            </p>
          </div>

          <div className="glass-panel" style={{ padding: '24px' }}>
            <div style={{ fontSize: '1.8rem', marginBottom: '12px' }}>✍️</div>
            <h2 style={{ fontSize: '1.05rem', fontWeight: '700', marginBottom: '8px' }}>2. 60s Prompt Race</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              Engineers secretly craft their best AI prompt before time runs out.
            </p>
          </div>

          <div className="glass-panel" style={{ padding: '24px' }}>
            <div style={{ fontSize: '1.8rem', marginBottom: '12px' }}>🎨</div>
            <h2 style={{ fontSize: '1.05rem', fontWeight: '700', marginBottom: '8px' }}>3. Instant AI Render</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              High-speed neural image generation produces side-by-side artworks.
            </p>
          </div>

          <div className="glass-panel" style={{ padding: '24px' }}>
            <div style={{ fontSize: '1.8rem', marginBottom: '12px' }}>🗳️</div>
            <h2 style={{ fontSize: '1.05rem', fontWeight: '700', marginBottom: '8px' }}>4. Live Spectator Vote</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              Spectators vote live without refreshing to crown the arena victor.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
