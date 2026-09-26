import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { hasSupabaseConfigured, getLocalRoom } from '@/lib/store';

export async function GET(request, { params }) {
  try {
    const { code } = await params;
    const roomCode = code.toUpperCase();

    if (hasSupabaseConfigured()) {
      const { data, error } = await supabaseAdmin
        .from('rooms')
        .select('*')
        .eq('code', roomCode)
        .single();

      if (data) {
        return NextResponse.json({ success: true, room: data });
      }
    }

    const localRoom = getLocalRoom(roomCode);
    if (localRoom) {
      return NextResponse.json({ success: true, room: localRoom });
    }

    return NextResponse.json({ success: false, error: 'Room not found' }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
