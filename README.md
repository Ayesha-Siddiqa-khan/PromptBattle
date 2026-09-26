# PromptBattle — Live AI Image Arena

PromptBattle is a live, real-time multiplayer AI image competition platform. Two players join an arena, receive a creative challenge prompt, craft their AI image prompts, and spectators vote live on which generated art is the best.

## Tech Stack

- **Framework:** Next.js (App Router, JavaScript)
- **Database & Realtime:** Supabase (PostgreSQL & Realtime channels)
- **Image Storage:** Supabase Storage
- **AI Image Generation:** Configurable provider (FLUX / Replicate)
- **Deployment:** Vercel
- **CI/CD:** GitHub Actions

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up environment variables in `.env.local`:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   AI_IMAGE_PROVIDER=replicate
   REPLICATE_API_TOKEN=your_replicate_token
   ```

3. Run development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.
