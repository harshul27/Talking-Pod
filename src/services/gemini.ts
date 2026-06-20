import { GoogleGenAI, Modality, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface PodcastSegment {
  speaker: string;
  text: string;
}

export interface PodcastEpisode {
  title: string;
  segments: PodcastSegment[];
}

export async function generatePodcastEpisodes(documentText: string): Promise<PodcastEpisode[]> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Analyze the following document and transform it into a professional podcast series. 
    
    MISSION: 
    Your goal is to make the user significantly smarter about this topic by combining their provided content with high-value, reliable external insights.
    
    CRITICAL INSTRUCTIONS:
    1. DYNAMIC STRUCTURE: Analyze the depth of the document and determine the optimal number of episodes (between 1 and 5). Don't stick to a fixed count; if it's a short memo, 1 episode is fine. If it's a long report, do 4-5.
    2. WEB RESEARCH: For each episode topic, use your search tool to find 2-3 specific, reliable facts, statistics, or recent developments that complement (but are NOT in) the original text. 
    3. FACT INTEGRATION: Use Sam (the inquisitive co-host) to bring up these outside facts as "interesting context I found" or "recent news related to this". This makes the podcast feel researched and multi-dimensional.
    4. ACCURACY: Ensure all external information is highly relevant and stems from reliable sources.
    5. PERSONAS:
       - Alex: Professional, lead host, focuses on translating the document's core message.
       - Sam: Inquisitive, brings in the "research" (the outside facts), asks the questions the listener is thinking.
    
    Format the output as a JSON array of objects.
    
    Document:
    ${documentText}`,
    config: {
      tools: [{ googleSearch: {} }] as any,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            segments: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  speaker: { type: Type.STRING },
                  text: { type: Type.STRING },
                },
                required: ["speaker", "text"],
              },
            },
          },
          required: ["title", "segments"],
        },
      },
    },
  });

  return JSON.parse(response.text);
}

export async function generateEpisodeAudio(segments: PodcastSegment[]) {
  const prompt = segments.map(s => `${s.speaker}: ${s.text}`).join("\n");
  
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `TTS the following conversation between Alex and Sam:\n${prompt}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: [
            {
              speaker: 'Alex',
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
            },
            {
              speaker: 'Sam',
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
            },
          ],
        },
      },
    },
  });

  return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
}
