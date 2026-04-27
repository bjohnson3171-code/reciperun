# RecipeRun — Deploy Guide

**Plan dinner once. Shop smarter everywhere.**

This guide gets RecipeRun live on the internet in about 15 minutes. No terminal, no installs. You'll do everything in your browser.

---

## What you need first (5 min)

1. **GitHub account** — free at https://github.com/signup
2. **Vercel account** — free at https://vercel.com/signup → click "Continue with GitHub"

That's it. Vercel and GitHub do all the heavy lifting.

---

## Step 1: Create the GitHub repo (3 min)

1. Go to https://github.com/new
2. **Repository name:** `reciperun`
3. Set to **Public** (or Private — Vercel works with both on the free tier)
4. **DO NOT** check "Add a README" — leave everything unchecked
5. Click **Create repository**

You'll land on an empty repo page. Keep this tab open.

---

## Step 2: Upload the files (5 min)

1. On your empty repo page, click **"uploading an existing file"** (it's a link in the middle of the page)
2. Open your computer's file browser to wherever you unzipped the RecipeRun folder
3. **Select EVERYTHING inside the folder** (not the folder itself):
   - `index.html`
   - `package.json`
   - `vite.config.js`
   - `vercel.json`
   - `.gitignore`
   - `README.md`
   - `src/` folder (with `App.jsx` and `main.jsx` inside)
4. Drag all of it onto the GitHub upload area
5. Scroll down, type a commit message: `Initial RecipeRun upload`
6. Click **Commit changes**

GitHub will process the upload. Once done, you should see all your files listed.

---

## Step 3: Deploy on Vercel (4 min)

1. Go to https://vercel.com/new
2. You'll see your `reciperun` repo in the list — click **Import** next to it
3. On the configuration screen, **everything should auto-detect**:
   - Framework Preset: **Vite**
   - Build Command: `vite build` (auto)
   - Output Directory: `dist` (auto)
4. **Don't change anything.** Just click **Deploy**.
5. Wait ~60 seconds while Vercel builds the app

When it's done, you'll see confetti and a preview screen. Click **Continue to Dashboard**.

Your live URL will be: **https://reciperun.vercel.app** (or `reciperun-radd.vercel.app` if the first one is taken)

---

## Step 4: Test it (2 min)

1. Open the URL on your phone
2. Tap "Add to Home Screen" (Safari: share button → Add to Home Screen)
3. The app installs like a real iOS/Android app — full screen, no browser bar
4. Try the "Tuscan Garlic Chicken" demo recipe to confirm the flow works end-to-end

---

## What's working right now

✅ Recipe import (text paste + demo recipes)
✅ Ingredient extraction (uses local parser as fallback)
✅ Store assignment across Publix / Harris Teeter / Lidl / Sam's Club
✅ Shopping flow with check-off + substitutions
✅ Pantry (manual add)
✅ Trip history
✅ **Data persists** between sessions (localStorage)

## What's NOT working yet (next phase)

⚠️ **AI extraction from URLs** — needs a backend. Currently uses local parsing.
⚠️ **Photo / Scan My Fridge** — needs a backend. Will fail silently in browser.
⚠️ **AI substitutions** — falls back to a small built-in list.

Why? Because the Anthropic API can't be called directly from the browser (CORS blocks it, and it would expose your API key to anyone who views the page source). We need a tiny backend function to handle that. **This is the next thing we build.**

---

## Custom domain (optional, $10-12/year)

Once you're happy with the app, you can add a real domain like `reciperun.app` or `reciperun.com`:

1. Buy the domain at Namecheap, Porkbun, or Cloudflare
2. In Vercel: Project → Settings → Domains → Add Domain
3. Vercel gives you DNS records to copy into your registrar
4. Live in 5-10 minutes

---

## Updating the app later

When you want to change something, you have two options:

**Easy way (browser only):**
1. Go to your GitHub repo
2. Click any file → pencil icon → edit → commit
3. Vercel auto-redeploys in ~60 seconds

**Better way (when you're ready):**
- Install GitHub Desktop (free, no terminal)
- Clone the repo locally
- Edit files in any code editor
- Push changes → Vercel auto-deploys

---

## Troubleshooting

**"Build failed" on Vercel**
→ Check that `package.json` is in the root of the repo, not inside a folder.

**App loads but is blank**
→ Open browser console (F12). If you see "Failed to load module," the `src/` folder didn't upload. Re-upload it on GitHub.

**Pantry/trips don't save**
→ You're probably in private/incognito browsing — localStorage is disabled there.

---

Built by Brandon "Radd" Johnson · RecipeRun · 2026
