// In-memory fallback room store for local development before Supabase keys are configured
const globalRooms = globalThis.__promptBattleRooms || new Map();
if (process.env.NODE_ENV !== 'production') {
  globalThis.__promptBattleRooms = globalRooms;
}

export function getLocalRoom(code) {
  return globalRooms.get(code.toUpperCase());
}

export function setLocalRoom(code, roomData) {
  globalRooms.set(code.toUpperCase(), roomData);
  return roomData;
}

export function hasSupabaseConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(url && key && !url.includes('placeholder') && !url.includes('your-project'));
}
