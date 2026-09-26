import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRandomPrompt } from '@/lib/prompts';
import { hasSupabaseConfigured, setLocalRoom } from '@/lib/store';

function generateRoomCode() {
  const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return code;
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const playerId = body.playerId || `p1_${Math.random().toString(36).substring(2, 9)}`;
    const code = generateRoomCode();
    const challengePrompt = getRandomPrompt();

    const newRoom = {
      id: crypto.randomUUID(),
      code,
      status: 'WAITING',
      challenge_prompt: challengePrompt,
      player1_id: playerId,
      player2_id: null,
      player1_prompt: null,
      player2_prompt: null,
      player1_image_url: null,
      player2_image_url: null,
      player1_votes: 0,
      player2_votes: 0,
      winner: null,
      timer_ends_at: null,
      created_at: new Date().toISOString(),
    };

    if (hasSupabaseConfigured()) {
      const { data, error } = await supabaseAdmin
        .from('rooms')
        .insert([newRoom])
        .select()
        .single();

      if (error) {
        console.error('Supabase room create error:', error);
        // Fallback to local
        setLocalRoom(code, newRoom);
        return NextResponse.json({ success: true, room: newRoom, mode: 'local-fallback' });
      }

      return NextResponse.json({ success: true, room: data, mode: 'supabase' });
    }

    setLocalRoom(code, newRoom);
    return NextResponse.json({ success: true, room: newRoom, mode: 'local' });
  } catch (error) {
    console.error('Create room error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
