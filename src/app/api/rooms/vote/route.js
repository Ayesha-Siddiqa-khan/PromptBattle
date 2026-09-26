import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { hasSupabaseConfigured, setLocalRoom } from '@/lib/store';

export async function POST(request) {
  try {
    const { roomId, voterId, votedFor } = await request.json();
    if (!roomId || !voterId || !['player1', 'player2'].includes(votedFor)) {
      return NextResponse.json({ success: false, error: 'Invalid vote payload' }, { status: 400 });
    }

    if (hasSupabaseConfigured()) {
      // 1. Check if voter already voted
      const { data: existingVote } = await supabaseAdmin
        .from('votes')
        .select('id')
        .eq('room_id', roomId)
        .eq('voter_id', voterId)
        .maybeSingle();

      if (existingVote) {
        return NextResponse.json({ success: false, error: 'You have already voted in this round' }, { status: 400 });
      }

      // 2. Insert vote
      await supabaseAdmin.from('votes').insert([{
        room_id: roomId,
        voter_id: voterId,
        voted_for: votedFor,
      }]);

      // 3. Fetch current counts
      const { data: room } = await supabaseAdmin
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .single();

      const newP1Votes = votedFor === 'player1' ? (room.player1_votes || 0) + 1 : (room.player1_votes || 0);
      const newP2Votes = votedFor === 'player2' ? (room.player2_votes || 0) + 1 : (room.player2_votes || 0);

      const { data: updatedRoom, error: updateErr } = await supabaseAdmin
        .from('rooms')
        .update({
          player1_votes: newP1Votes,
          player2_votes: newP2Votes,
        })
        .eq('id', roomId)
        .select()
        .single();

      if (updateErr) {
        return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, room: updatedRoom });
    }

    // Local in-memory fallback
    const globalRooms = globalThis.__promptBattleRooms;
    let room = null;
    let roomCode = null;
    if (globalRooms) {
      for (const [code, r] of globalRooms.entries()) {
        if (r.id === roomId) {
          room = r;
          roomCode = code;
          break;
        }
      }
    }

    if (!room) {
      return NextResponse.json({ success: false, error: 'Room not found' }, { status: 404 });
    }

    if (!room.voters) {
      room.voters = new Set();
    }
    if (room.voters.has(voterId)) {
      return NextResponse.json({ success: false, error: 'You have already voted' }, { status: 400 });
    }

    room.voters.add(voterId);
    if (votedFor === 'player1') {
      room.player1_votes = (room.player1_votes || 0) + 1;
    } else {
      room.player2_votes = (room.player2_votes || 0) + 1;
    }

    setLocalRoom(roomCode, room);
    return NextResponse.json({ success: true, room });
  } catch (error) {
    console.error('Vote error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
