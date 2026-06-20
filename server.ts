import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import * as cheerio from "cheerio";
import { YoutubeTranscript } from 'youtube-transcript';
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let aiClient: any = null;
function getAIClient() {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    aiClient = new GoogleGenAI({
      apiKey: apiKey || "",
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/fetch-url", async (req, res) => {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    // Handle YouTube URLs
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      try {
        const transcript = await YoutubeTranscript.fetchTranscript(url);
        const content = transcript.map(t => `[${Math.floor(t.offset / 1000)}s] ${t.text}`).join(' ');
        
        // Fetch title via metadata
        let title = "YouTube Video";
        try {
          const response = await axios.get(`https://noembed.com/embed?url=${url}`);
          title = response.data.title || "YouTube Video";
        } catch (_) {}

        return res.json({ title, content, type: 'video', source: 'youtube' });
      } catch (err: any) {
        console.error("YouTube fetch error:", err);
        
        // Fallback: Fetch metadata via noembed to at least supply the title
        let title = "YouTube Video";
        let author = "";
        try {
          const response = await axios.get(`https://noembed.com/embed?url=${url}`);
          title = response.data.title || "YouTube Video";
          author = response.data.author_name ? ` by ${response.data.author_name}` : "";
        } catch (_) {}

        let content = "";
        let generatedTranscript = false;

        // Proactively reconstruct the video's essential timeline/details using Gemini 3.5 Flash with search tool
        try {
          const ai = getAIClient();
          if (process.env.GEMINI_API_KEY) {
            console.log(`Attempting video reconstruction via Gemini for: "${title}"`);
            const prompt = `Research the YouTube video "${title}"${author} (URL: ${url}) using Google Search.
Search web reports, reviews, blogs, and chapters for this video.
Reconstruct a extremely detailed, chronological summary structure that functions as a transcript.
Provide real or estimated timestamp markers (e.g., [0s], [60s], [120s], [180s], [240s]) marking the transition between distinct topics discussed.
Ensure it is highly informative, accurate to the actual video, and 1200-3000 characters long so the user can easily use it to auto-generate podcast scripts or track timeline-specific concepts.
Format the output as a clean continuous list of prose lines or paragraphs starting with these timestamp [Xs] markers.`;

            const geminiResponse = await ai.models.generateContent({
              model: "gemini-3.5-flash",
              contents: prompt,
              config: {
                tools: [{ googleSearch: {} }] as any
              }
            });

            if (geminiResponse?.text) {
              content = geminiResponse.text;
              generatedTranscript = true;
            }
          }
        } catch (geminiErr) {
          console.error("Failed to reconstruct YouTube context via Gemini:", geminiErr);
        }

        if (!generatedTranscript) {
          content = `[System Notification] YouTube Transcripts are unavailable or disabled on this video: "${title}"${author}.\n\nYou can still paste custom notes or a summary manually into the field below to produce a podcast episode about this topic, and use the Live Assistant helper to explore related details via Google search.`;
        }

        return res.json({ 
          title: generatedTranscript ? `${title} (Reconstructed)` : `${title} (Transcript Disabled)`, 
          content, 
          type: 'video', 
          source: 'youtube',
          warning: "Transcript is disabled on this video. Reconstructed content using Search context."
        });
      }
    }

    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      const $ = cheerio.load(response.data);
      
      // Basic extraction
      $('script, style, nav, footer, header').remove();
      const title = $('title').text().trim();
      let content = '';
      
      const contentSelectors = ['article', 'main', '.content', '.post-content', '#content', '#main'];
      for (const selector of contentSelectors) {
        const found = $(selector).text().trim();
        if (found.length > content.length) {
          content = found;
        }
      }
      
      if (content.length < 500) {
        content = $('body').text().trim();
      }

      content = content.replace(/\s+/g, ' ').substring(0, 50000);

      res.json({ title, content, type: 'article', source: 'web' });
    } catch (error) {
      console.error("Error fetching URL:", error);
      res.status(500).json({ error: "Failed to fetch content from URL" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
