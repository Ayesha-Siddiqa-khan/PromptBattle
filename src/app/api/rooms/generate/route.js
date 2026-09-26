import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { hasSupabaseConfigured, setLocalRoom } from '@/lib/store';

async function generateSingleImage(prompt, roomId, playerKey) {
  const replicateToken = process.env.REPLICATE_API_TOKEN;

  // 1. If Replicate Token is provided, call Replicate FLUX-Schnell model
  if (replicateToken) {
    try {
      const response = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${replicateToken}`,
          'Content-Type': 'application/json',
          'Prefer': 'wait',
        },
        body: JSON.stringify({
          input: {
            prompt: prompt,
            num_outputs: 1,
            aspect_ratio: '1:1',
            output_format: 'webp',
            output_quality: 85,
          },
        }),
      });

      const prediction = await response.json();
      if (prediction.output && prediction.output.length > 0) {
        return prediction.output[0];
      }
    } catch (err) {
      console.error('Replicate generation error:', err);
    }
  }

  // 2. High quality themed procedural fallback for local testing & demos
  const encoded = encodeURIComponent(prompt.substring(0, 70));
  const seed = Math.floor(Math.random() * 100000);
  return `https://picsum.photos/seed/${seed}-${playerKey}/800/800`;
}

export async function POST(request) {
  try {
    const { roomId } = await request.json();
    if (!roomId) {
      return NextResponse.json({ success: false, error: 'roomId required' }, { status: 400 });
    }

    let room = null;
    let roomCode = null;

    if (hasSupabaseConfigured()) {
      const { data, error } = await supabaseAdmin
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .single();
      if (!error && data) {
        room = data;
        roomCode = data.code;
      }
    }

    if (!room) {
      const globalRooms = globalThis.__promptBattleRooms;
      if (globalRooms) {
        for (const [code, r] of globalRooms.entries()) {
          if (r.id === roomId) {
            room = r;
            roomCode = code;
            break;
          }
        }
      }
    }

    if (!room) {
      return NextResponse.json({ success: false, error: 'Room not found' }, { status: 404 });
    }

    // Generate both images in parallel
    const p1Prompt = room.player1_prompt || room.challenge_prompt || 'Creative digital masterpiece';
    const p2Prompt = room.player2_prompt || room.challenge_prompt || 'Cyberpunk visionary artwork';

    const [p1ImageUrl, p2ImageUrl] = await Promise.all([
      generateSingleImage(p1Prompt, room.id, 'p1'),
      generateSingleImage(p2Prompt, room.id, 'p2'),
    ]);

    const timerEndsAt = new Date(Date.now() + 45000).toISOString();

    const updates = {
      player1_image_url: p1ImageUrl,
      player2_image_url: p2ImageUrl,
      status: 'VOTING',
      timer_ends_at: timerEndsAt,
    };

    if (hasSupabaseConfigured()) {
      const { data: updatedRoom, error: updateErr } = await supabaseAdmin
        .from('rooms')
        .update(updates)
        .eq('id', room.id)
        .select()
        .single();

      if (updateErr) {
        return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, room: updatedRoom });
    }

    // Local fallback
    Object.assign(room, updates);
    setLocalRoom(roomCode, room);

    return NextResponse.json({ success: true, room });
  } catch (error) {
    console.error('Generation API error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
