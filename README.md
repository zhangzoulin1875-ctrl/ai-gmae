# WWI Multiplayer Strategy Game Monorepo

A complete, full-stack monorepo for a World War I turn-based multiplayer strategy game.

## Project Structure

```
wwi-strategy-game/
├── package.json                 # Monorepo root with npm workspaces
├── README.md
├── .gitignore
└── packages/
    ├── shared/                  # Common TypeScript types and constants
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    │       ├── index.ts
    │       ├── constants/
    │       │   └── countries.ts # 50+ WWI historical nations
    │       └── types/
    │           ├── game.ts      # Core game domain models
    │           ├── ai.ts        # AI engine & fallback chain types
    │           └── admin.ts     # Admin panel data structures
    │
    ├── client/                  # React + Vite frontend SPA
    │   ├── package.json
    │   ├── tsconfig.json
    │   ├── vite.config.ts       # API & Socket proxy settings
    │   ├── index.html
    │   └── src/
    │       ├── main.tsx
    │       ├── App.tsx          # React Router setup
    │       ├── pages/           # Login, Lobby, Game, Admin pages
    │       └── styles/          # Global styles
    │
    └── server/                  # Node.js + Express + Socket.IO + Prisma backend
        ├── package.json
        ├── tsconfig.json
        ├── src/
        │   ├── index.ts         # Server entry point (port 3001)
        │   ├── middleware/      # JWT authentication middleware
        │   ├── routes/          # Auth & Admin REST endpoints
        │   ├── services/        # Discord OAuth, AI Resolution, Turn Scheduler
        │   └── sockets/         # Real-time game state handlers
        └── prisma/
            └── schema.prisma    # Database schemas
```

## Features

- **npm Workspaces**: Shared type definitions across client and server.
- **Discord OAuth2**: Secure user authentication.
- **Admin Portal**: Password-protected configuration and game management.
- **AI Turn Resolution Engine**: Multi-provider fallback chain (OpenAI, Anthropic, Custom LLM) with deterministic resolution fallback.
- **Automated Turn Scheduler**: Cron-based turn resolution executing every 2 hours with configurable quiet hours (00:00 - 08:00 UTC+8 Taiwan time).
- **Socket.IO Real-time Synchronization**: Live updates for game order submissions, room status, and turn resolutions.
- **Comprehensive Historical Data**: 50+ WWI nations with historical alignments, colors, and stats.

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0

### Environment Setup

Create a `.env` file in `packages/server/.env`:

```env
PORT=3001
JWT_SECRET=super-secret-jwt-key
ADMIN_PASSWORD=change-this-admin-password
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
DISCORD_REDIRECT_URI=http://localhost:3001/api/auth/discord/callback
CLIENT_URL=http://localhost:5173
DATABASE_URL=file:./dev.db
```

### Installation & Development

```bash
# Install dependencies across all workspaces
npm install

# Build shared package first
npm run build:shared

# Run development servers concurrently
npm run dev
```

The client will be running on `http://localhost:5173` and the server on `http://localhost:3001`.
