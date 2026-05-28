# Deployment Runbook

## GitHub

Set the repository remote to `https://github.com/karlstuke1/legal.git`.

Repository secrets:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF`
- `SUPABASE_DB_PASSWORD`
- `OPENROUTER_API_KEY`
- `FIRECRAWL_API_KEY`
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

Repository variables:

- `APP_BASE_URL=https://<production-domain>`
- `CORS_ALLOWED_ORIGINS=https://<production-domain>,http://localhost:5173,http://localhost:8080`
- `VITE_SUPABASE_PROJECT_ID=<supabase-project-ref>`
- `VITE_SUPABASE_URL=https://<supabase-project-ref>.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY=<supabase-publishable-or-anon-key>`
- `VITE_APP_BASE_URL=https://<production-domain>`

## Supabase

The deploy workflow runs:

```sh
supabase link --project-ref "$SUPABASE_PROJECT_REF"
supabase db push --password "$SUPABASE_DB_PASSWORD"
supabase secrets set ...
supabase functions deploy --project-ref "$SUPABASE_PROJECT_REF"
```

Configure Auth in the Supabase dashboard:

- Site URL: `https://<production-domain>`
- Redirect URLs: `https://<production-domain>`, `https://<production-domain>/auth`, `http://localhost:5173`, `http://localhost:8080`
- Google OAuth callback: `https://<supabase-project-ref>.supabase.co/auth/v1/callback`

## Vercel

Use the Vite preset.

- Build command: `npm run build`
- Output directory: `dist`

Set production environment variables in Vercel:

- `VITE_SUPABASE_PROJECT_ID`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_APP_BASE_URL`

The GitHub Actions Vercel job pulls the production Vercel environment before building.
