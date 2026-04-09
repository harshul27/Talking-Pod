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
    contents: `Analyze the following document and transform it into a 3-episode podcast series. 
    Each episode should have a title and a conversational script between Alex and Sam.
    Alex is the lead host, Sam is the inquisitive co-host.
    Format the output as a JSON array of objects, each with 'title' and 'segments' (array of {speaker, text}).
    
    Document:
    ${documentText}`,
    config: {
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
