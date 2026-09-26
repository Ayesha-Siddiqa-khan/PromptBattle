import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { hasSupabaseConfigured, getLocalRoom, setLocalRoom } from '@/lib/store';

export async function POST(request) {
  try {
    const { code, playerId } = await request.json();
    if (!code) {
      return NextResponse.json({ success: false, error: 'Room code is required' }, { status: 400 });
    }

    const roomCode = code.toUpperCase();
    const pid = playerId || `usr_${Math.random().toString(36).substring(2, 9)}`;

    if (hasSupabaseConfigured()) {
      const { data: room, error } = await supabaseAdmin
        .from('rooms')
        .select('*')
        .eq('code', roomCode)
        .single();

      if (error || !room) {
        return NextResponse.json({ success: false, error: 'Room not found' }, { status: 404 });
      }

      // If user is already Player 1
      if (room.player1_id === pid) {
        return NextResponse.json({ success: true, room, role: 'player1' });
      }

      // If user is already Player 2
      if (room.player2_id === pid) {
        return NextResponse.json({ success: true, room, role: 'player2' });
      }

      // If room is WAITING and needs Player 2
      if (room.status === 'WAITING' && !room.player2_id) {
        const timerEndsAt = new Date(Date.now() + 10000).toISOString();
        const { data: updatedRoom, error: updateError } = await supabaseAdmin
          .from('rooms')
          .update({
            player2_id: pid,
            status: 'REVEAL',
            timer_ends_at: timerEndsAt,
          })
          .eq('id', room.id)
          .select()
          .single();

        if (!updateError && updatedRoom) {
          return NextResponse.json({ success: true, room: updatedRoom, role: 'player2' });
        }
      }

      // Otherwise spectator
      return NextResponse.json({ success: true, room, role: 'spectator' });
    }

    // Local in-memory fallback
    const room = getLocalRoom(roomCode);
    if (!room) {
      return NextResponse.json({ success: false, error: 'Room not found' }, { status: 404 });
    }

    if (room.player1_id === pid) {
      return NextResponse.json({ success: true, room, role: 'player1' });
    }

    if (room.player2_id === pid) {
      return NextResponse.json({ success: true, room, role: 'player2' });
    }

    if (room.status === 'WAITING' && !room.player2_id) {
      room.player2_id = pid;
      room.status = 'REVEAL';
      room.timer_ends_at = new Date(Date.now() + 10000).toISOString();
      setLocalRoom(roomCode, room);
      return NextResponse.json({ success: true, room, role: 'player2' });
    }

    return NextResponse.json({ success: true, room, role: 'spectator' });
  } catch (error) {
    console.error('Join room error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
