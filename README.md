This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Admin: usage tracking

`/admin` shows who is using the app, when, and which features they use (reviews, practice, AI card generation, grammar help, notebook, imports, ...), so you can see what's worth building on.

To set it up:

1. In the Supabase SQL Editor, run the **Usage tracking + admin** section at the bottom of `src/lib/supabase/schema.sql`. It creates the `activity_events` table and the admin-only reporting functions.
2. Set these environment variables (e.g. in Vercel):
   - `ADMIN_EMAILS`: comma-separated emails allowed to open `/admin`. Everyone else gets a 404.
   - `SUPABASE_SERVICE_ROLE_KEY`: from Supabase → Project Settings → API. Server-only; never prefix it with `NEXT_PUBLIC_`.

Events are logged with `logActivity` from `src/lib/activity.ts`. When you add a feature, add an event name there and log it, and it will show up on the admin page.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
