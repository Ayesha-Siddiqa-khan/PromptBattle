import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { hasSupabaseConfigured, getLocalRoom, setLocalRoom } from '@/lib/store';

export async function POST(request) {
  try {
    const { roomId, playerId, promptText } = await request.json();
    if (!roomId || !playerId || !promptText) {
      return NextResponse.json({ success: false, error: 'Missing required parameters' }, { status: 400 });
    }

    if (hasSupabaseConfigured()) {
      const { data: room, error: fetchErr } = await supabaseAdmin
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .single();

      if (fetchErr || !room) {
        return NextResponse.json({ success: false, error: 'Room not found' }, { status: 404 });
      }

      const updates = {};
      if (room.player1_id === playerId) {
        updates.player1_prompt = promptText.trim();
      } else if (room.player2_id === playerId) {
        updates.player2_prompt = promptText.trim();
      } else {
        return NextResponse.json({ success: false, error: 'You are not a player in this room' }, { status: 403 });
      }

      const isP1Done = updates.player1_prompt || room.player1_prompt;
      const isP2Done = updates.player2_prompt || room.player2_prompt;

      if (isP1Done && isP2Done) {
        updates.status = 'GENERATING';
        updates.timer_ends_at = null;
      }

      const { data: updatedRoom, error: updateErr } = await supabaseAdmin
        .from('rooms')
        .update(updates)
        .eq('id', roomId)
        .select()
        .single();

      if (updateErr) {
        return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, room: updatedRoom });
    }

    // Local in-memory fallback
    let matchedRoom = null;
    let roomCode = null;
    const globalRooms = globalThis.__promptBattleRooms;
    if (globalRooms) {
      for (const [code, r] of globalRooms.entries()) {
        if (r.id === roomId) {
          matchedRoom = r;
          roomCode = code;
          break;
        }
      }
    }

    if (!matchedRoom) {
      return NextResponse.json({ success: false, error: 'Room not found' }, { status: 404 });
    }

    if (matchedRoom.player1_id === playerId) {
      matchedRoom.player1_prompt = promptText.trim();
    } else if (matchedRoom.player2_id === playerId) {
      matchedRoom.player2_prompt = promptText.trim();
    } else {
      return NextResponse.json({ success: false, error: 'You are not a player in this room' }, { status: 403 });
    }

    if (matchedRoom.player1_prompt && matchedRoom.player2_prompt) {
      matchedRoom.status = 'GENERATING';
      matchedRoom.timer_ends_at = null;
    }

    setLocalRoom(roomCode, matchedRoom);
    return NextResponse.json({ success: true, room: matchedRoom });
  } catch (error) {
    console.error('Submit prompt error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
