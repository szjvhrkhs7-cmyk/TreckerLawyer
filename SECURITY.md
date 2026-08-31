# Security model

## Cloud data

TreckerLawyer stores the working copy in the browser and, after sign-in, synchronizes it to the Supabase table `public.lawyer_store`.

The browser publishable key is intentionally public. It is not a secret and must never be treated as the authorization boundary. The database boundary is Row Level Security (RLS).

Required production policy:

- `anon` has no table privileges on `public.lawyer_store`;
- `authenticated` may `SELECT`, `INSERT`, and `UPDATE` only rows whose `user_id` equals `auth.uid()`;
- the browser role has no table-level `DELETE` privilege because the current sync protocol does not need it;
- both `USING` and `WITH CHECK` are required for updates;
- RLS must be enabled and forced;
- all previously-existing policies on `lawyer_store` must be removed before installing the owner-only policy set, because permissive PostgreSQL policies can otherwise be OR-combined.

The migration in `supabase/migrations/20260831_harden_lawyer_store_rls.sql` implements this contract.

## Authentication session

The current static GitHub Pages architecture stores the Supabase session in browser storage so that a user stays signed in. This means a successful same-origin script injection could potentially access the session token. The application therefore treats prevention of script injection as a high-priority control.

A stronger architecture for highly sensitive or regulated data would put authentication behind a server-side backend and use Secure, HttpOnly cookies. GitHub Pages alone cannot provide that architecture.

## Client-side controls

- restrictive Content Security Policy with `script-src 'self'` and no inline executable JavaScript;
- no third-party executable JavaScript;
- user text is escaped before insertion into HTML templates;
- rich-text notes are reduced to a small allowlist of elements and attributes are removed;
- imported backups are size- and structure-validated;
- cloud responses are accepted only for known tracker storage sections;
- Supabase requests disable HTTP caching, ambient browser credentials, referrer forwarding and unexpected redirects;
- new cloud accounts require a password of at least 12 characters at the client level;
- local data remains available when the network is unavailable.

## Data classification

The tracker is appropriate for personal productivity data when the RLS migration is applied and verified. Do not treat the current static-client architecture as an approved repository for bank secrecy, customer personal data, credentials, authentication secrets, or other information that requires enterprise data-loss-prevention controls unless the deployment has undergone the relevant organizational security review.

## Verification

A temporary GitHub Actions audit on 2026-08-31 queried `lawyer_store` using only the browser publishable key. The API returned zero rows visible to the anonymous role. This is consistent with effective RLS, but does not by itself prove that every authenticated cross-user policy is correct. The SQL migration in this repository defines the intended policies explicitly.
