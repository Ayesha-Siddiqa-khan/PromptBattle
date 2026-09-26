'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = params.code ? params.code.toUpperCase() : '';

  const [room, setRoom] = useState(null);
  const [role, setRole] = useState('spectator'); // 'player1' | 'player2' | 'spectator'
  const [playerId, setPlayerId] = useState('');
  const [promptInput, setPromptInput] = useState('');
  const [hasSubmittedPrompt, setHasSubmittedPrompt] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const generationTriggeredRef = useRef(false);

  // Initialize or retrieve persistent player ID
  useEffect(() => {
    let id = localStorage.getItem('pb_player_id');
    if (!id) {
      id = 'user_' + Math.random().toString(36).substring(2, 9);
      localStorage.setItem('pb_player_id', id);
    }
    setPlayerId(id);
  }, []);

  // Fetch initial room & join
  const fetchRoomData = async () => {
    if (!roomCode) return;
    try {
      const res = await fetch(`/api/rooms/${roomCode}`);
      const data = await res.json();
      if (data.success && data.room) {
        setRoom(data.room);
        return data.room;
      } else {
        setErrorMsg(data.error || 'Room not found.');
      }
    } catch (err) {
      console.error('Fetch room error:', err);
    }
    return null;
  };

  useEffect(() => {
    if (!roomCode || !playerId) return;

    // Join room endpoint to establish role
    const joinRoom = async () => {
      try {
        const res = await fetch('/api/rooms/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: roomCode, playerId }),
        });
        const data = await res.json();
        if (data.success) {
          setRoom(data.room);
          setRole(data.role);
          if (data.room.player1_id === playerId && data.room.player1_prompt) {
            setHasSubmittedPrompt(true);
          }
          if (data.room.player2_id === playerId && data.room.player2_prompt) {
            setHasSubmittedPrompt(true);
          }
        }
      } catch (err) {
        console.error('Join error:', err);
      }
    };

    joinRoom();

    // Supabase Realtime channel subscription
    let channel = null;
    try {
      channel = supabase
        .channel(`room:${roomCode}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'rooms',
        }, (payload) => {
          if (payload.new && payload.new.code === roomCode) {
            setRoom(payload.new);
          }
        })
        .subscribe();
    } catch (e) {
      console.log('Realtime fallback active');
    }

    // Polling fallback to keep synchronized
    const interval = setInterval(async () => {
      const updated = await fetchRoomData();
      if (updated) {
        if (updated.player1_id === playerId && updated.player1_prompt) {
          setHasSubmittedPrompt(true);
        }
        if (updated.player2_id === playerId && updated.player2_prompt) {
          setHasSubmittedPrompt(true);
        }
      }
    }, 2500);

    return () => {
      clearInterval(interval);
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [roomCode, playerId]);

  // Synchronized countdown timer based on timer_ends_at
  useEffect(() => {
    if (!room || !room.timer_ends_at) {
      setTimeLeft(null);
      return;
    }

    const updateTimer = () => {
      const endsAt = new Date(room.timer_ends_at).getTime();
      const now = Date.now();
      const diff = Math.max(0, Math.floor((endsAt - now) / 1000));
      setTimeLeft(diff);

      // Automated client trigger for state transitions when timer expires
      if (diff === 0) {
        if (room.status === 'REVEAL') {
          // Transition to PROMPTING
          transitionState('PROMPTING', 60);
        } else if (room.status === 'PROMPTING') {
          // Time ran out for prompting -> start generation
          triggerGeneration();
        }
      }
    };

    updateTimer();
    const timerInterval = setInterval(updateTimer, 1000);
    return () => clearInterval(timerInterval);
  }, [room?.timer_ends_at, room?.status]);

  // Handle auto generation trigger when both submitted or status is GENERATING
  useEffect(() => {
    if (room && room.status === 'GENERATING' && !generationTriggeredRef.current) {
      generationTriggeredRef.current = true;
      triggerGeneration();
    }
  }, [room?.status]);

  const transitionState = async (nextStatus, seconds) => {
    if (!room) return;
    const timerEndsAt = new Date(Date.now() + seconds * 1000).toISOString();
    setRoom((prev) => ({
      ...prev,
      status: nextStatus,
      timer_ends_at: timerEndsAt,
    }));
  };

  const triggerGeneration = async () => {
    if (!room || isGenerating) return;
    setIsGenerating(true);
    try {
      const res = await fetch('/api/rooms/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: room.id }),
      });
      const data = await res.json();
      if (data.success && data.room) {
        setRoom(data.room);
      }
    } catch (err) {
      console.error('Trigger generation failed:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmitPrompt = async (e) => {
    e.preventDefault();
    if (!promptInput.trim() || !room) return;

    try {
      const res = await fetch('/api/rooms/submit-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: room.id,
          playerId,
          promptText: promptInput.trim(),
        }),
      });

      const data = await res.json();
      if (data.success) {
        setHasSubmittedPrompt(true);
        if (data.room) {
          setRoom(data.room);
        }
      }
    } catch (err) {
      console.error('Submit prompt error:', err);
    }
  };

  const handleVote = async (target) => {
    if (!room || hasVoted) return;

    try {
      const res = await fetch('/api/rooms/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: room.id,
          voterId: playerId,
          votedFor: target,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setHasVoted(true);
        if (data.room) {
          setRoom(data.room);
        }
      }
    } catch (err) {
      console.error('Vote error:', err);
    }
  };

  const handleCopyLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  if (errorMsg) {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="glass-panel" style={{ padding: '36px', textAlign: 'center', maxWidth: '440px' }}>
          <h2 style={{ color: 'var(--player2-accent)', marginBottom: '12px' }}>Arena Error</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>{errorMsg}</p>
          <button className="btn-primary" onClick={() => router.push('/')}>Return to Lobby</button>
        </div>
      </main>
    );
  }

  if (!room) {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <div className="spinner" style={{ width: '36px', height: '36px' }} />
          <p style={{ color: 'var(--text-secondary)' }}>Connecting to Arena {roomCode}...</p>
        </div>
      </main>
    );
  }

  const totalVotes = (room.player1_votes || 0) + (room.player2_votes || 0);
  const p1Percent = totalVotes > 0 ? Math.round(((room.player1_votes || 0) / totalVotes) * 100) : 50;
  const p2Percent = totalVotes > 0 ? 100 - p1Percent : 50;

  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navbar */}
      <header style={{
        padding: '16px 28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() => router.push('/')}
            style={{ background: 'transparent', color: 'var(--text-secondary)', fontSize: '1.2rem', cursor: 'pointer' }}
          >
            ←
          </button>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '1.2rem', fontWeight: '800', letterSpacing: '-0.02em' }}>ARENA</span>
            <span style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--player1-accent)' }}>#{room.code}</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className="status-badge" style={{ color: role === 'spectator' ? 'var(--text-secondary)' : 'var(--player1-accent)' }}>
            Role: {role.toUpperCase()}
          </span>

          <button
            id="btn-copy-room-link"
            className="btn-secondary"
            onClick={handleCopyLink}
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
          >
            {copySuccess ? '✓ Copied' : '🔗 Share Code'}
          </button>
        </div>
      </header>

      {/* Main Arena Viewport */}
      <div style={{
        flex: 1,
        maxWidth: '1200px',
        margin: '0 auto',
        width: '100%',
        padding: '32px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
      }}>
        {/* Arena Stage Banner & Theme */}
        <div className="glass-panel" style={{ padding: '24px 32px', textAlign: 'center', position: 'relative' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '10px',
            fontSize: '0.9rem',
            color: 'var(--text-secondary)',
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}>
            <span className="badge-pulse-dot" style={{
              backgroundColor: room.status === 'VOTING' ? 'var(--accent-gold)' : 'var(--player1-accent)'
            }} />
            Round Status: <strong style={{ color: '#fff' }}>{room.status}</strong>
            {timeLeft !== null && (
              <span style={{ marginLeft: '12px', color: 'var(--accent-gold)', fontWeight: '700' }}>
                ⏳ {timeLeft}s remaining
              </span>
            )}
          </div>

          <h2 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#fff', letterSpacing: '-0.01em' }}>
            Theme: &ldquo;<span style={{ color: 'var(--player1-accent)' }}>{room.challenge_prompt}</span>&rdquo;
          </h2>
        </div>

        {/* Phase 1: WAITING for Player 2 */}
        {room.status === 'WAITING' && (
          <div className="glass-panel" style={{ padding: '48px 24px', textAlign: 'center', maxWidth: '600px', margin: '20px auto', width: '100%' }}>
            <div className="spinner" style={{ margin: '0 auto 20px auto', width: '32px', height: '32px' }} />
            <h3 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '12px' }}>Waiting for Opponent</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: '1.5' }}>
              Share this room code with a friend or open a second browser window to duel:
            </p>
            <div style={{
              background: 'rgba(0, 240, 255, 0.1)',
              border: '2px dashed var(--player1-accent)',
              borderRadius: 'var(--radius-md)',
              padding: '16px',
              fontSize: '2rem',
              fontWeight: '800',
              letterSpacing: '0.2em',
              color: 'var(--player1-accent)',
              display: 'inline-block',
              marginBottom: '20px',
            }}>
              {room.code}
            </div>
            <div>
              <button className="btn-primary" onClick={handleCopyLink}>
                {copySuccess ? 'Copied Room URL!' : 'Copy Invite Link'}
              </button>
            </div>
          </div>
        )}

        {/* Phase 2: REVEAL */}
        {room.status === 'REVEAL' && (
          <div className="glass-panel" style={{ padding: '48px 24px', textAlign: 'center', maxWidth: '640px', margin: '20px auto', width: '100%' }}>
            <div style={{ fontSize: '3rem', marginBottom: '16px' }}>⚡</div>
            <h3 style={{ fontSize: '1.8rem', fontWeight: '800', marginBottom: '12px' }}>Opponent Joined!</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '1.1rem' }}>
              Prepare your creative vision. The prompt duel begins in:
            </p>
            <div style={{
              fontSize: '3.5rem',
              fontWeight: '900',
              color: 'var(--accent-gold)',
            }}>
              {timeLeft !== null ? timeLeft : '10'}s
            </div>
          </div>
        )}

        {/* Phase 3: PROMPTING */}
        {room.status === 'PROMPTING' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Player active prompt crafting */}
            {(role === 'player1' || role === 'player2') && (
              <div className="glass-panel" style={{ padding: '28px', maxWidth: '750px', margin: '0 auto', width: '100%' }}>
                <h3 style={{ fontSize: '1.3rem', fontWeight: '700', marginBottom: '8px' }}>
                  Craft Your Prompt ({role === 'player1' ? 'Player 1 - Cyan' : 'Player 2 - Magenta'})
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '20px' }}>
                  Write a detailed AI prompt based on the theme. It will remain confidential until generation!
                </p>

                {hasSubmittedPrompt ? (
                  <div style={{
                    background: 'rgba(0, 240, 255, 0.1)',
                    border: '1px solid var(--player1-accent)',
                    padding: '20px',
                    borderRadius: 'var(--radius-md)',
                    textAlign: 'center',
                    color: 'var(--player1-accent)',
                    fontWeight: '700',
                  }}>
                    ✓ Prompt locked in! Waiting for your opponent to finalize...
                  </div>
                ) : (
                  <form onSubmit={handleSubmitPrompt} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <textarea
                      id="input-prompt-text"
                      rows={4}
                      placeholder={`e.g. Hyperrealistic 8k render of ${room.challenge_prompt}, octane engine, cinematic lighting, vivid colors...`}
                      value={promptInput}
                      onChange={(e) => setPromptInput(e.target.value)}
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)',
                        padding: '16px',
                        color: '#fff',
                        fontSize: '1rem',
                        resize: 'none',
                        lineHeight: '1.5',
                      }}
                    />
                    <button
                      id="btn-submit-prompt"
                      type="submit"
                      className="btn-primary"
                      disabled={!promptInput.trim()}
                      style={{ alignSelf: 'flex-end', padding: '12px 32px' }}
                    >
                      🚀 Lock In Prompt
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* Spectator spectator message */}
            {role === 'spectator' && (
              <div className="glass-panel" style={{ padding: '36px', textAlign: 'center', maxWidth: '600px', margin: '0 auto', width: '100%' }}>
                <h3 style={{ fontSize: '1.4rem', fontWeight: '700', marginBottom: '8px' }}>Duel in Progress</h3>
                <p style={{ color: 'var(--text-secondary)' }}>
                  Both prompters are typing their secret prompts. Voting will commence once images generate!
                </p>
              </div>
            )}
          </div>
        )}

        {/* Phase 4: GENERATING */}
        {(room.status === 'GENERATING' || isGenerating) && (
          <div className="glass-panel" style={{ padding: '56px 24px', textAlign: 'center', maxWidth: '600px', margin: '20px auto', width: '100%' }}>
            <div className="spinner" style={{ margin: '0 auto 24px auto', width: '48px', height: '48px' }} />
            <h3 style={{ fontSize: '1.8rem', fontWeight: '800', marginBottom: '12px' }}>AI Neural Rendering</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', lineHeight: '1.6' }}>
              Synthesizing side-by-side artworks via FLUX / Replicate. Stand by for the voting reveal!
            </p>
          </div>
        )}

        {/* Phase 5 & 6: VOTING & FINISHED (Side by Side Arena) */}
        {(room.status === 'VOTING' || room.status === 'FINISHED') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            {/* Live Voting Bar */}
            <div className="glass-panel" style={{ padding: '20px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontWeight: '700', fontSize: '0.95rem' }}>
                <span style={{ color: 'var(--player1-accent)' }}>Player 1: {room.player1_votes || 0} votes ({p1Percent}%)</span>
                <span style={{ color: 'var(--text-secondary)' }}>Total Votes: {totalVotes}</span>
                <span style={{ color: 'var(--player2-accent)' }}>Player 2: {room.player2_votes || 0} votes ({p2Percent}%)</span>
              </div>
              <div style={{ height: '12px', background: 'rgba(255,255,255,0.08)', borderRadius: 'var(--radius-full)', overflow: 'hidden', display: 'flex' }}>
                <div style={{ width: `${p1Percent}%`, background: 'var(--player1-accent)', transition: 'width 0.4s ease' }} />
                <div style={{ width: `${p2Percent}%`, background: 'var(--player2-accent)', transition: 'width 0.4s ease' }} />
              </div>
            </div>

            {/* Side-by-side Duel Images */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '28px',
            }}>
              {/* Player 1 Card */}
              <div className="glass-panel" style={{
                padding: '24px',
                border: '1px solid rgba(0, 240, 255, 0.3)',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="glow-text-cyan" style={{ fontWeight: '800', fontSize: '1.1rem' }}>PLAYER 1</span>
                  <span className="status-badge" style={{ color: 'var(--player1-accent)' }}>
                    {room.player1_votes || 0} Votes
                  </span>
                </div>

                <div style={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: '1/1',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                  background: '#0d1117',
                }}>
                  {room.player1_image_url ? (
                    <Image
                      src={room.player1_image_url}
                      alt="Player 1 AI Generated Art"
                      fill
                      sizes="(max-width: 768px) 100vw, 500px"
                      style={{ objectFit: 'cover' }}
                      priority
                    />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                      Rendering...
                    </div>
                  )}
                </div>

                {room.player1_prompt && (
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic', background: 'rgba(0,0,0,0.3)', padding: '10px 14px', borderRadius: 'var(--radius-sm)' }}>
                    &ldquo;{room.player1_prompt}&rdquo;
                  </p>
                )}

                {room.status === 'VOTING' && (
                  <button
                    id="btn-vote-player1"
                    className="btn-vote-p1"
                    onClick={() => handleVote('player1')}
                    disabled={hasVoted}
                    style={{ width: '100%', marginTop: 'auto' }}
                  >
                    {hasVoted ? '✓ Vote Recorded' : 'Vote for Player 1'}
                  </button>
                )}
              </div>

              {/* Player 2 Card */}
              <div className="glass-panel" style={{
                padding: '24px',
                border: '1px solid rgba(255, 42, 133, 0.3)',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="glow-text-magenta" style={{ fontWeight: '800', fontSize: '1.1rem' }}>PLAYER 2</span>
                  <span className="status-badge" style={{ color: 'var(--player2-accent)' }}>
                    {room.player2_votes || 0} Votes
                  </span>
                </div>

                <div style={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: '1/1',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                  background: '#0d1117',
                }}>
                  {room.player2_image_url ? (
                    <Image
                      src={room.player2_image_url}
                      alt="Player 2 AI Generated Art"
                      fill
                      sizes="(max-width: 768px) 100vw, 500px"
                      style={{ objectFit: 'cover' }}
                      priority
                    />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                      Rendering...
                    </div>
                  )}
                </div>

                {room.player2_prompt && (
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic', background: 'rgba(0,0,0,0.3)', padding: '10px 14px', borderRadius: 'var(--radius-sm)' }}>
                    &ldquo;{room.player2_prompt}&rdquo;
                  </p>
                )}

                {room.status === 'VOTING' && (
                  <button
                    id="btn-vote-player2"
                    className="btn-vote-p2"
                    onClick={() => handleVote('player2')}
                    disabled={hasVoted}
                    style={{ width: '100%', marginTop: 'auto' }}
                  >
                    {hasVoted ? '✓ Vote Recorded' : 'Vote for Player 2'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
