# Gemini Podcast Studio Integration Suite

This directory contains the files for the **Gemini Companion Chrome Extension** alongside step-by-step deployment structures for publishing your primary **Gemini Podcast Studio** application to **Vercel** or other cloud servers.

---

## 🚀 Part 1: How to Deploy the Podcast Studio Web App to Vercel

Since this application is a full-stack, real-time application powered by **Express** and a **Vite React template**, Vercel requires a specific serverless entry configuration to run both the front-end SPA and the back-end API proxy (e.g., YouTube transcript scraping or Gemini TTS orchestration).

### Option A: Standard Full-Stack Vercel Setup (Serverless Functions)

1. **Install Vercel CLI**:
   ```bash
   npm install -g vercel
   ```

2. **Add `vercel.json` in the Root Directory**:
   Create a file named `vercel.json` in the project's root folder with the following configuration:
   ```json
   {
     "version": 2,
     "builds": [
       {
         "src": "package.json",
         "use": "@vercel/node"
       }
     ],
     "routes": [
       {
         "src": "/api/(.*)",
         "dest": "server.ts"
       },
       {
         "src": "/(.*)",
         "dest": "/index.html"
       }
     ]
   }
   ```

3. **Deploy with CLI**:
   Run the following command in your terminal inside the project root and follow the prompts:
   ```bash
   vercel
   ```
   *Make sure to add your secret `GEMINI_API_KEY` in the Vercel Dashboard under **Project Settings > Environment Variables**.*

### Option B: High-Performance Full-Stack Hosting (Highly Recommended)
Because this application uses real-time WebSockets and streaming audio via the **Gemini Live API Modality**, serverless functions (like Vercel Hobby) can sometimes timeout on connections lasting longer than 10-60 seconds. For a completely uninterrupted live audio feedback experience, we recommend registering on hosting platforms built for persistent servers:

*   **Render** (https://render.com)
*   **Railway** (https://railway.app)
*   **Google Cloud Run** (Cloud Run container orchestration is already running this app perfectly)

To deploy to Render or Railway:
1. Connect your Git repository.
2. Select **Web Service**.
3. Set the build command: `npm run build`.
4. Set the start command: `npm run start`.
5. Add your `GEMINI_API_KEY` in your environment variables.

---

## 🔌 Part 2: How to Load and Test the Chrome Companion Extension

The companion extension sits in your browser to scrape Web or YouTube contexts, monitor media progression, and synchronize data live with your Podcast Studio.

### Step-by-Step Installation:
1. Open Google Chrome and navigate to: `chrome://extensions/`
2. In the top-right corner, toggle **Developer mode** to **ON**.
3. In the top-left, click **Load unpacked**.
4. In the file explorer, select the `/chrome-extension` directory inside this project workspace.
5. The **Gemini Podcast Studio Companion** extension is now active in your extensions drawer! Pin it to your toolbar for fast access.

### How to use the extension:
1. **Set the App Target**: Open the extension popup, paste your live Web App URL (e.g. `https://your-app.vercel.app` or your development url) into the **Studio Target URL** field.
2. **Scrape Web articles & YouTube**: Open any article or YouTube video (e.g. `https://www.youtube.com/watch?v=KRAbSnrcVX0`). Open the extension popup, and click **Sync Page to Studio**.
3. **Experience Real-Time Sync**: Go back to your Studio App's **External Monitor** tab. You'll see the extracted transcript automatically ingested!
4. **Playback Matching**: Play the YouTube video on its tab. The active segment in the Podcast Studio Monitor tab will glow/outline highlighting exactly what paragraph matches the current playing duration in your browser!
5. **Interactive Help**: Ask the live Studio Assistant, *"Hey buddy, summarized what happened at the last video section"* — it has real-time playback awareness of your browsing context and will answer perfectly.
