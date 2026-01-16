# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/e6b9dfaa-3b8f-4777-9bd0-33aebe194a32

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/e6b9dfaa-3b8f-4777-9bd0-33aebe194a32) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/e6b9dfaa-3b8f-4777-9bd0-33aebe194a32) and click on Share -> Publish.

## Web-only Deployment (Cloudflare Pages + Workers)

This project is now web-only (no Electron). The API runs as a stateless Worker.

### Local development

Frontend:

```sh
npm run dev
```

API (local adapters: filesystem + SQLite):

```sh
npm run dev:api
```

The frontend proxies `/api` to `http://localhost:8787`.

### Cloudflare Pages (frontend)

Build settings:

```sh
# Build command
npm run build

# Output directory
dist
```

Routing:

- Ensure `public/_redirects` contains `/* /index.html 200` for client-side routing.
- Set `VITE_API_BASE_URL` in Pages environment variables to your Worker URL (e.g. `https://damage-assessor-api.<account>.workers.dev`).

### Cloudflare Workers (API)

1. Configure `wrangler.toml`:
   - Replace `database_id` with your D1 database ID.
   - Create the R2 bucket named in `bucket_name`.
2. Deploy the Worker:

```sh
npx wrangler deploy
```

API routes:

- `POST /api/upload` (multipart form, field `file`)
- `POST /api/assessments` (body: `{ damageId, approval?, metrics? }`)
- `GET /api/assessments`
- `GET /api/assessments/:id`
- `PUT /api/assessments/:id`

### Portability to AWS/Azure

- Object storage adapter: Cloudflare R2 now; replace with S3 or Azure Blob later.
- SQL adapter: Cloudflare D1 now; replace with Postgres/MySQL later.
- The adapters live in `worker/adapters/` and are isolated from the handler.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/tips-tricks/custom-domain#step-by-step-guide)
