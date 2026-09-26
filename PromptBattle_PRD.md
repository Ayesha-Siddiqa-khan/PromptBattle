# PRD — PromptBattle: Live AI Image Arena

## Project Goal

Build a website called **PromptBattle — Live AI Image Arena**.

I want to build this project **by myself** and use AI/Copilot only as an assistant. Do not take over the whole development process or make unnecessary changes.

## Required Technology / Deployment

- **Frontend / Website:** Next.js
- **Database:** Supabase
- **Supabase Realtime:** For live game-room updates, player status, countdown clocks, and spectator votes.
- **Supabase Storage:** For storing generated AI images.
- **Deployment:** Vercel
- **CI/CD:** GitHub Actions
- **Repository:** GitHub
- **AI Image Generation:** An image API such as FLUX or Replicate.
- Images should be displayed using Next.js `<Image>` where appropriate.

## Important Development Requirement

I want to create and understand this website **myself**.

Therefore:

- Keep the project beginner-friendly.
- Do not unnecessarily rewrite or restructure the project.
- Do not add unrelated features.
- Do not change the main architecture without asking.
- Make small, understandable changes.
- Explain what is being changed when implementation work is requested.
- Preserve previously working functionality.
- Ask before making major architectural decisions.

## PromptBattle Concept

Two players join a live lobby and receive a creative prompt.

Example:

> "Cyberpunk tea party in 1890"

Both players independently craft their own AI prompts.

The server requests the generated images.

The two generated images are rendered side by side.

Spectators can vote live on which player generated the better image.

The experience should feel like a live AI image competition.

## Core Flow

1. Player joins a live lobby.
2. Another player joins the same lobby.
3. The server provides a creative challenge prompt.
4. Both players create their own AI image prompts.
5. The image-generation request is sent to an image API such as FLUX or Replicate.
6. Generated images are stored in Supabase Storage.
7. Images are displayed side by side.
8. Spectators can vote for either player.
9. Votes update live without requiring a page refresh.
10. Players and spectators can see relevant live game status.

## Game State Machine & Lifecycle

The game operates on a deterministic state machine tracked in Supabase:

| State | Trigger to Enter | Duration | Description |
|---|---|---|---|
| `WAITING` | Room created by Player 1 | Indefinite | Waiting for Player 2 to join via room code. |
| `REVEAL` | Player 2 joins | 10 seconds | Challenge prompt is revealed; players prepare their creative angle. |
| `PROMPTING` | Reveal timer expires | 60 seconds | Both players independently compose and submit their AI prompt. Prompts are kept hidden until generation. |
| `GENERATING` | Both submitted or time expired | API dependent (~5-15s) | Server calls image generation API (FLUX/Replicate) and uploads outputs to Supabase Storage. |
| `VOTING` | Both images stored & ready | 45 seconds | Side-by-side arena opens. Spectators and players view images; spectators cast live votes. |
| `FINISHED` | Voting timer expires | Indefinite | Winner is announced. Displays final vote tally with an option to start a rematch. |

## Database Schema (Supabase)

All tables use standard PostgreSQL types in Supabase. Beginner-friendly SQL setup:

### 1. `rooms` Table
Tracks room lifecycle, players, prompts, generated image URLs, and vote counts:

```sql
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  status text not null default 'WAITING' check (status in ('WAITING', 'REVEAL', 'PROMPTING', 'GENERATING', 'VOTING', 'FINISHED')),
  challenge_prompt text not null,
  player1_id text not null,
  player2_id text,
  player1_prompt text,
  player2_prompt text,
  player1_image_url text,
  player2_image_url text,
  player1_votes integer default 0,
  player2_votes integer default 0,
  winner text, -- 'player1', 'player2', or 'tie'
  timer_ends_at timestamptz,
  created_at timestamptz default now()
);
```

### 2. `votes` Table
Prevents duplicate voting and records spectator ballots:

```sql
create table public.votes (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  voter_id text not null,
  voted_for text not null check (voted_for in ('player1', 'player2')),
  created_at timestamptz default now(),
  constraint unique_room_voter unique (room_id, voter_id)
);
```

### 3. Row Level Security (RLS) & Privacy
- Public read access for active room status, timers, image URLs, and vote counts.
- **Prompt Privacy:** During the `PROMPTING` phase, player prompt texts should not be leaked to the opponent client (handled through Next.js server route abstraction so clients only see submission status like `player1_ready: true`).

## Supabase Realtime Architecture

Use Supabase Realtime to keep all connected players and spectators synchronized without manual page reloads.

- **Channel Pattern:** `room:${roomId}`
- **Postgres Changes Listener (Broadcast / CDC):**
  Clients listen to `UPDATE` events on table `rooms` filtered by room ID:
  ```javascript
  supabase
    .channel(`room:${roomId}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'rooms',
      filter: `id=eq.${roomId}`
    }, (payload) => {
      // Synchronize local UI state with updated room data
      handleRoomUpdate(payload.new);
    })
    .subscribe();
  ```
- **Presence Tracking (Spectator & Player Roster):**
  Track active participants in the lobby:
  ```javascript
  const channel = supabase.channel(`presence:${roomId}`);
  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      // Count total connected spectators and player presence
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ userId, role });
      }
    });
  ```
- **Timer Synchronization:**
  Timers rely on the database column `timer_ends_at`. Clients calculate remaining time locally (`timer_ends_at - Date.now()`). This prevents countdown drift or missing ticks over WebSockets.

## Supabase Storage Specification

- **Bucket Name:** `battle-images` (Public bucket)
- **Object Path Convention:**
  ```text
  battle-images/${roomId}/player1_${timestamp}.png
  battle-images/${roomId}/player2_${timestamp}.png
  ```
- **Image Pipeline:**
  1. Next.js API route calls the image generation provider.
  2. Server receives the generated image URL or binary buffer.
  3. Server uploads the image to the `battle-images` bucket using the Supabase Service Role Key.
  4. Server stores the resulting public URLs in `rooms.player1_image_url` and `rooms.player2_image_url`.
- **Display Optimization:**
  Use Next.js `<Image>` component for automatic optimization, responsive sizing, and fast delivery:
  ```jsx
  <Image
    src={player1ImageUrl}
    alt="Player 1 AI Generation"
    width={512}
    height={512}
    className="rounded-xl shadow-md object-cover"
    priority
  />
  ```

## AI Image Generation

The server requests generated images from an image-generation API in a provider-agnostic manner:

- **Supported Providers:**
  - **Replicate** (e.g., `black-forest-labs/flux-schnell` or `stability-ai/sdxl`)
  - **FLUX API** (direct API endpoint)
- **Architecture Requirement:**
  Keep the provider configurable via environment variables (`AI_IMAGE_PROVIDER`) so changing providers requires no changes to core game logic.
- **Generation Trigger:**
  Executed server-side via Next.js API route as soon as both players submit their prompts, or immediately when the 60-second prompting timer expires.

## API Route Specifications (Next.js App Router)

All server logic is handled via Next.js Route Handlers (`app/api/...`):

1. `POST /api/rooms/create`
   - **Body:** `{ playerId: string }`
   - **Action:** Generates a random 6-character room code, selects a creative challenge prompt from a predefined prompt list, and inserts a new row in `rooms` with status `WAITING`.
   - **Response:** `{ success: true, room: { id, code, ... } }`

2. `POST /api/rooms/join`
   - **Body:** `{ code: string, playerId: string }`
   - **Action:** Validates room exists and is in `WAITING` status. Assigns `player2_id`, transitions status to `REVEAL`, sets `timer_ends_at` to `now() + 10s`.
   - **Response:** `{ success: true, room: { ... }, role: 'player2' | 'spectator' }`

3. `POST /api/rooms/submit-prompt`
   - **Body:** `{ roomId: string, playerId: string, promptText: string }`
   - **Action:** Saves prompt for Player 1 or Player 2. If both prompts are now submitted, immediately transitions room to `GENERATING` and initiates image generation.
   - **Response:** `{ success: true, ready: true }`

4. `POST /api/rooms/generate`
   - **Body:** `{ roomId: string }`
   - **Action:** Fetches prompts for both players, sends generation requests in parallel to the configured AI API, uploads resulting images to Supabase Storage `battle-images`, updates image URLs in `rooms`, transitions status to `VOTING`, and sets `timer_ends_at` to `now() + 45s`.
   - **Response:** `{ success: true }`

5. `POST /api/rooms/vote`
   - **Body:** `{ roomId: string, voterId: string, votedFor: 'player1' | 'player2' }`
   - **Action:** Inserts record into `votes` table (ensuring 1 vote per voter per room). Increments `player1_votes` or `player2_votes` on `rooms`. If voting timer has elapsed, marks status as `FINISHED` and assigns `winner`.
   - **Response:** `{ success: true, player1_votes, player2_votes }`

## Environment Variables Reference

Create a `.env.local` file (configured in local development and Vercel dashboard):

```env
# Supabase (Client Side)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Supabase (Server Side - Admin/Service Role)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# AI Image Generation
AI_IMAGE_PROVIDER=replicate
REPLICATE_API_TOKEN=r8_your_token_here
# Optional if using direct FLUX provider:
# FLUX_API_KEY=your_flux_key
```

## Vercel

The website will be deployed to **Vercel**.

The application should be designed to work correctly with Vercel's deployment environment.

## GitHub Actions

GitHub Actions will be used for deployment to Vercel.

### VERY IMPORTANT

**For the GitHub Actions part, create ONLY the required `.yml` workflow file.**

Do not create extra GitHub Actions files.

Do not create shell scripts for deployment.

Do not create Docker files for deployment.

Do not create unrelated CI/CD configuration.

The requested GitHub Actions deliverable is:

```text
.github/workflows/<deployment-workflow>.yml
```

The workflow should handle the Vercel deployment using the appropriate Vercel deployment process and GitHub Secrets/environment variables.

## Development Scope

This PRD is intentionally limited to the requirements written above.

Do not add unrelated functionality such as:

- Payments
- User subscriptions
- Admin dashboards
- Social feeds
- Chat systems
- Unrequested authentication systems
- Leaderboards unless specifically requested later
- Unrequested analytics
- Unrequested moderation systems
- Unrequested mobile apps

Additional features can be discussed and added later.

## Self-Building Requirement

I am building this project myself.

When helping me implement it:

1. Give me clear, small steps.
2. Tell me exactly which file needs to be created or changed.
3. Do not modify unrelated files.
4. Do not refactor working code unless necessary.
5. Keep explanations beginner-friendly.
6. If a requirement is unclear, ask me before making a major decision.
7. Do not silently introduce new technologies.
8. Keep Supabase as the database/backend data platform.
9. Keep Vercel as the deployment platform.
10. Keep GitHub Actions as the deployment automation mechanism.

## Initial Implementation Priority

The project should eventually cover:

1. Next.js website foundation.
2. Supabase database connection.
3. Supabase Realtime game-room functionality.
4. Live two-player lobby.
5. Creative challenge prompt.
6. Player prompt submission.
7. AI image-generation API integration.
8. Supabase Storage for generated images.
9. Side-by-side image arena.
10. Live spectator voting.
11. Vercel deployment.
12. GitHub Actions deployment workflow.

## Deliverable Requested From the AI

Use this PRD as the project specification.

**For the CI/CD/deployment portion, generate ONLY the `.yml` GitHub Actions workflow file requested above.**

Do not generate additional deployment files unless I explicitly ask for them.
