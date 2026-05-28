# Legal

Legal is a Vite/React application backed by Supabase and Supabase Edge Functions.
Model calls are routed through OpenRouter.

## Local Development

```sh
npm install
cp .env.example .env.local
npm run dev
```

Required frontend variables are documented in `.env.example`.

## Supabase

The database schema and storage policies live in `supabase/migrations`.
Edge Functions live in `supabase/functions`.

For a new Supabase project:

```sh
supabase login
supabase link --project-ref <project-ref>
supabase db push --password <database-password>
supabase secrets set --env-file <path-to-edge-function-env>
supabase functions deploy --project-ref <project-ref>
```

## Vercel

Use the Vite framework preset.

- Build command: `npm run build`
- Output directory: `dist`
- Production env: set the `VITE_*` variables from `.env.example`

GitHub Actions workflows in `.github/workflows` run CI and deploy Supabase +
Vercel when changes land on `main`. See `docs/deployment.md` for the required
secrets, repository variables, and Supabase Auth settings.
