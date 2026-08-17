# Plamenco Dental Co

Dental Clinic Management System foundation for a small clinic workflow.

## Current Audit

- Framework: Vite, React, TypeScript
- Frontend: modular React app under `src/app`, `src/components`, `src/features`, `src/lib`, and `src/pages`
- Backend: none yet
- Database: Supabase client adapter prepared, no active database connection until env values are provided
- Authentication: protected route foundation with local demo sign-in, ready for Supabase Auth integration
- Components: reusable button, input, select, badge, empty state, page scaffold, app layout, and sidebar navigation
- Styling: global CSS design system in `src/index.css`
- Routing: React Router with protected workspace routes and login route
- Environment variables: see `.env.example`
- Utilities: Supabase config helper in `src/lib/supabase.ts`

## Scripts

```bash
npm install
npm run dev
npm run build
npm run lint
```

## Environment

Copy `.env.example` to `.env.local` when Supabase is ready:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

## Part 1 Scope

This part establishes the application shell, design system, routing, auth foundation, database connection placeholder, responsive sidebar, and placeholder pages. It does not implement patient management, appointments, billing, dental records, or the odontogram yet.
