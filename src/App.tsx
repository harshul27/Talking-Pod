/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useCallback } from 'react';
import { Mic, Play, Pause, Upload, MessageSquare, Radio, Volume2, Loader2, Sparkles, FileText, ChevronRight, Headphones, X, Save, History, Download, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useDropzone } from 'react-dropzone';
import { cn } from './lib/utils';
import { generatePodcastEpisodes, generateEpisodeAudio, PodcastEpisode } from './services/gemini';
import { GoogleGenAI } from "@google/genai";

interface SavedSession {
  id: string;
  timestamp: number;
  transcript: { role: 'user' | 'assistant', text: string }[];
  title: string;
}

export default function App() {
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [episodes, setEpisodes] = useState<PodcastEpisode[]>([]);
  const [currentEpisodeIndex, setCurrentEpisodeIndex] = useState<number | null>(null);
  const [episodeAudios, setEpisodeAudios] = useState<Record<number, string>>({});
  const [isLoadingAudio, setIsLoadingAudio] = useState<number | null>(null);
  
  const [isLive, setIsLive] = useState(false);
  const [liveStatus, setLiveStatus] = useState<'idle' | 'listening' | 'speaking'>('idle');
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [currentTranscript, setCurrentTranscript] = useState<{ role: 'user' | 'assistant', text: string }[]>([]);
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>(() => {
    const saved = localStorage.getItem('podcast_studio_sessions');
    return saved ? JSON.parse(saved) : [];
  });
  const [showHistory, setShowHistory] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const liveSessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  const pcmToWav = (pcmBase64: string, sampleRate: number) => {
    const binary = atob(pcmBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const header = new ArrayBuffer(44);
    const view = new DataView(header);

    // RIFF identifier
    view.setUint32(0, 0x52494646, false);
    // file length
    view.setUint32(4, 36 + bytes.length, true);
    // RIFF type
    view.setUint32(8, 0x57415645, false);
    // format chunk identifier
    view.setUint32(12, 0x666d7420, false);
    // format chunk length
    view.setUint16(16, 16, true);
    // sample format (PCM)
    view.setUint16(20, 1, true);
    // channel count (Mono)
    view.setUint16(22, 1, true);
    // sample rate
    view.setUint32(24, sampleRate, true);
    // byte rate (sample rate * block align)
    view.setUint32(28, sampleRate * 2, true);
    // block align (channel count * bytes per sample)
    view.setUint16(32, 2, true);
    // bits per sample
    view.setUint16(34, 16, true);
    // data chunk identifier
    view.setUint32(36, 0x64617461, false);
    // data chunk length
    view.setUint32(40, bytes.length, true);

    const blob = new Blob([header, bytes], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result;
        if (typeof text === 'string') {
          setInputText(text);
        }
      };
      reader.readAsText(file);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    accept: { 'text/plain': ['.txt'] },
    multiple: false
  });

  const handleGenerate = async () => {
    if (!inputText.trim()) return;
    setIsGenerating(true);
    try {
      const generatedEpisodes = await generatePodcastEpisodes(inputText);
      setEpisodes(generatedEpisodes);
      setCurrentEpisodeIndex(0);
    } catch (error) {
      console.error("Failed to generate podcast:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const loadEpisodeAudio = async (index: number) => {
    if (episodeAudios[index]) return;
    setIsLoadingAudio(index);
    try {
      const audioData = await generateEpisodeAudio(episodes[index].segments);
      if (audioData) {
        // Gemini TTS returns 24kHz PCM
        const wavUrl = pcmToWav(audioData, 24000);
        setEpisodeAudios(prev => ({ ...prev, [index]: wavUrl }));
      }
    } catch (error) {
      console.error("Failed to load audio:", error);
    } finally {
      setIsLoadingAudio(null);
    }
  };

  const saveCurrentSession = async () => {
    if (currentTranscript.length === 0 && audioChunksRef.current.length === 0) return;
    
    let audioUrl = '';
    if (audioChunksRef.current.length > 0) {
      const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      // In a real app, we'd upload this. For now, we'll use a local URL.
      // Note: This won't persist across refreshes if we just store the URL.
      // But we can store the blob in IndexedDB if we wanted true persistence.
      // For this demo, we'll just provide the download.
      audioUrl = URL.createObjectURL(blob);
    }

    const newSession: SavedSession = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      transcript: currentTranscript,
      title: `Session ${new Date().toLocaleString()}`
    };
    
    const updated = [newSession, ...savedSessions];
    setSavedSessions(updated);
    localStorage.setItem('podcast_studio_sessions', JSON.stringify(updated));
    
    // If there's audio, trigger a download automatically or keep it in memory
    if (audioUrl) {
      const a = document.createElement('a');
      a.href = audioUrl;
      a.download = `Session-Audio-${newSession.id}.webm`;
      // a.click(); // Optional: auto-download
    }

    setCurrentTranscript([]);
    audioChunksRef.current = [];
  };

  const deleteSession = (id: string) => {
    const updated = savedSessions.filter(s => s.id !== id);
    setSavedSessions(updated);
    localStorage.setItem('podcast_studio_sessions', JSON.stringify(updated));
  };

  const downloadTranscript = (session: SavedSession) => {
    const text = session.transcript.map(t => `${t.role.toUpperCase()}: ${t.text}`).join('\n\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${session.title.replace(/[/\\?%*:|"<>]/g, '-')}.txt`;
    a.click();
  };

  const toggleLive = async () => {
    if (isLive) {
      setIsLive(false);
      liveSessionRef.current?.close();
      
      // Stop Recording
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
      }
      
      // Save session automatically if there's content
      saveCurrentSession();
      
      // Resume podcast if it was playing
      if (audioRef.current && pausedAt !== null) {
        audioRef.current.play();
        setPausedAt(null);
      }
      return;
    }

    // Reset transcript for new session
    setCurrentTranscript([]);

    // Pause podcast if it's playing
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      setPausedAt(audioRef.current.currentTime);
    }

    setIsLive(true);
    setLiveStatus('listening');
    
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      }
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      // Setup Recording
      destinationRef.current = audioContextRef.current.createMediaStreamDestination();
      mediaRecorderRef.current = new MediaRecorder(destinationRef.current.stream);
      audioChunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mediaRecorderRef.current.start();
      setIsRecording(true);

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
      
      const sessionPromise = ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          systemInstruction: `You are the "Studio Assistant". You are a single persona, NOT Alex or Sam. 
          ${episodes.length > 0 ? `You have access to the following podcast episodes: ${episodes.map(e => e.title).join(', ')}.` : ''}
          
          Listen for the wake word 'Hey buddy'. Once heard, answer questions about the podcast content or the original document. 
          Be friendly, concise, and speak with a single consistent voice. 
          If the user hasn't said 'Hey buddy', do not respond. 
          Do not simulate multiple people talking.`,
          responseModalities: ["AUDIO" as any],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } }
          }
        },
        callbacks: {
          onmessage: async (message: any) => {
            // Handle Audio
            if (message.serverContent?.modelTurn?.parts?.[0]?.inlineData) {
              setLiveStatus('speaking');
              const audioData = message.serverContent.modelTurn.parts[0].inlineData.data;
              playLiveAudio(audioData);
            }
            
            // Handle Text Transcript (if provided by model)
            const textPart = message.serverContent?.modelTurn?.parts?.find((p: any) => p.text);
            if (textPart) {
              setCurrentTranscript(prev => [...prev, { role: 'assistant', text: textPart.text }]);
            }
          },
          onclose: () => {
            setIsLive(false);
            setLiveStatus('idle');
          },
          onerror: (err) => {
            console.error("Live error:", err);
            setIsLive(false);
          }
        }
      });

      sessionPromise.then(async (session) => {
        liveSessionRef.current = session;
        
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        await audioContextRef.current!.audioWorklet.addModule(
          URL.createObjectURL(new Blob([`
            class AudioProcessor extends AudioWorkletProcessor {
              process(inputs) {
                const input = inputs[0][0];
                if (input) {
                  const pcm = new Int16Array(input.length);
                  for (let i = 0; i < input.length; i++) {
                    pcm[i] = Math.max(-1, Math.min(1, input[i])) * 0x7FFF;
                  }
                  this.port.postMessage(pcm.buffer, [pcm.buffer]);
                }
                return true;
              }
            }
            registerProcessor('audio-processor', AudioProcessor);
          `], { type: 'application/javascript' }))
        );

        const source = audioContextRef.current!.createMediaStreamSource(stream);
        const processor = new AudioWorkletNode(audioContextRef.current!, 'audio-processor');
        
        // Connect mic to recording destination
        if (destinationRef.current) {
          source.connect(destinationRef.current);
        }
        
        processor.port.onmessage = (e) => {
          const buffer = e.data;
          const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
          session.sendRealtimeInput({
            audio: { data: base64, mimeType: 'audio/pcm;rate=16000' }
          });
        };

        source.connect(processor);
        workletNodeRef.current = processor;
      });

    } catch (error) {
      console.error("Live session failed:", error);
      setIsLive(false);
    }
  };

  const playLiveAudio = async (base64: string) => {
    try {
      if (!audioContextRef.current) return;
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      
      const float32 = new Float32Array(bytes.length / 2);
      for (let i = 0; i < float32.length; i++) {
        const int16 = (bytes[i * 2 + 1] << 8) | bytes[i * 2];
        float32[i] = (int16 >= 0x8000 ? int16 - 0x10000 : int16) / 32768;
      }

      const buffer = audioContextRef.current.createBuffer(1, float32.length, 24000);
      buffer.getChannelData(0).set(float32);
      
      const source = audioContextRef.current.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContextRef.current.destination);
      if (destinationRef.current) {
        source.connect(destinationRef.current);
      }
      
      // Schedule playback with a tiny offset to allow state update to propagate
      const startTime = audioContextRef.current.currentTime + 0.05;
      
      source.onended = () => {
        setLiveStatus('listening');
      };

      source.start(startTime);
    } catch (error) {
      console.error("Error playing live audio:", error);
      setLiveStatus('listening');
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0502] text-[#e0d8d0] font-sans selection:bg-[#ff4e00]/30">
      {/* Background Atmosphere */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-[#ff4e00]/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-[#3a1510]/30 blur-[120px]" />
      </div>

      <main className="relative z-10 max-w-7xl mx-auto px-6 py-12 grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Left Column: Input & Controls */}
        <div className="lg:col-span-4 space-y-8">
          <header className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[#ff4e00] font-mono text-xs tracking-[0.2em] uppercase">
                <Radio className="w-4 h-4 animate-pulse" />
                Gemini 3.5 Studio
              </div>
              <button 
                onClick={() => setShowHistory(true)}
                className="p-2 rounded-xl bg-[#151619] border border-[#2a2b2e] text-[#8e9299] hover:text-white transition-all flex items-center gap-2 text-xs font-mono uppercase tracking-widest"
              >
                <History className="w-4 h-4" />
                History
              </button>
            </div>
            <h1 className="text-6xl font-light tracking-tight text-white leading-none">
              PodCast <span className="italic font-serif">Studio</span>
            </h1>
            <p className="text-[#8e9299] text-sm max-w-md leading-relaxed">
              Transform documents into immersive multi-episode podcasts with interactive AI hosting.
            </p>
          </header>

          <div className="space-y-4">
            <div 
              {...getRootProps()} 
              className={cn(
                "border-2 border-dashed rounded-3xl p-8 text-center transition-all cursor-pointer",
                isDragActive ? "border-[#ff4e00] bg-[#ff4e00]/5" : "border-[#2a2b2e] hover:border-[#4a4b4e] bg-[#151619]/50"
              )}
            >
              <input {...getInputProps()} />
              <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[#1a1b1e] flex items-center justify-center text-[#8e9299]">
                  <Upload className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-white">Upload Document</p>
                  <p className="text-xs text-[#8e9299]">Drag & drop or click to upload (.txt)</p>
                </div>
              </div>
            </div>

            <div className="relative group">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Or paste your content here..."
                className="w-full h-48 bg-[#151619] border border-[#2a2b2e] rounded-3xl p-6 text-sm focus:outline-none focus:border-[#ff4e00]/50 transition-all resize-none placeholder:text-[#4a4b4e]"
              />
            </div>

            <button 
              onClick={handleGenerate}
              disabled={isGenerating || !inputText.trim()}
              className="w-full py-4 bg-[#ff4e00] text-white rounded-2xl text-sm font-bold flex items-center justify-center gap-3 hover:bg-[#ff6a26] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xl shadow-[#ff4e00]/20"
            >
              {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
              Generate 3-Episode Series
            </button>
          </div>

          {/* Live Agent Hardware Widget */}
          <div className="bg-[#151619] border border-[#2a2b2e] rounded-3xl p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="text-[10px] font-mono uppercase tracking-widest text-[#8e9299]">Interactive Host</div>
                <div className="flex items-center gap-2">
                  <div className={cn("w-2 h-2 rounded-full", isLive ? "bg-green-500 animate-pulse" : "bg-red-500")} />
                  <span className="text-[10px] font-mono uppercase tracking-widest">
                    {isLive ? "Live Session Active" : "Session Offline"}
                  </span>
                </div>
              </div>
              <button 
                onClick={toggleLive}
                className={cn(
                  "p-4 rounded-2xl border transition-all flex flex-col items-center gap-2",
                  isLive 
                    ? "bg-[#ff4e00]/10 border-[#ff4e00] text-[#ff4e00]" 
                    : "bg-[#1a1b1e] border-[#2a2b2e] text-[#8e9299] hover:border-[#4a4b4e]"
                )}
              >
                <Mic className="w-5 h-5" />
              </button>
            </div>
            
            {isLive && (
              <div className="p-4 bg-[#0a0502] rounded-2xl border border-[#2a2b2e] space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1 h-3 items-end">
                    {[...Array(4)].map((_, i) => (
                      <motion.div 
                        key={i}
                        animate={{ height: liveStatus === 'idle' ? 2 : [2, 12, 2] }}
                        transition={{ repeat: Infinity, duration: 0.5, delay: i * 0.1 }}
                        className="w-1 bg-[#ff4e00] rounded-full"
                      />
                    ))}
                  </div>
                  <span className="text-[10px] font-mono text-[#ff4e00] uppercase tracking-widest">
                    {liveStatus === 'listening' ? 'Listening for "Hey Buddy"' : 'Speaking...'}
                  </span>
                </div>
                <p className="text-[11px] text-[#8e9299] leading-relaxed">
                  Ask Alex and Sam anything about the episodes.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Episodes & Player */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-[#151619]/50 backdrop-blur-xl border border-[#2a2b2e] rounded-[2.5rem] overflow-hidden flex flex-col h-[calc(100vh-6rem)]">
            <div className="p-8 border-b border-[#2a2b2e] flex items-center justify-between bg-[#1a1b1e]/50">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-[#ff4e00]/10 flex items-center justify-center text-[#ff4e00]">
                  <Headphones className="w-7 h-7" />
                </div>
                <div>
                  <h2 className="text-xl font-medium text-white">Episode Library</h2>
                  <p className="text-xs font-mono text-[#8e9299] uppercase tracking-widest">Production Monitor</p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-hide">
              {episodes.length > 0 ? (
                <div className="grid grid-cols-1 gap-6">
                  {episodes.map((episode, idx) => (
                    <motion.div 
                      key={idx}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className={cn(
                        "group p-6 rounded-3xl border transition-all",
                        currentEpisodeIndex === idx 
                          ? "bg-[#ff4e00]/5 border-[#ff4e00]/30" 
                          : "bg-[#1a1b1e] border-[#2a2b2e] hover:border-[#4a4b4e]"
                      )}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="space-y-1">
                          <div className="text-[10px] font-mono text-[#ff4e00] uppercase tracking-[0.2em]">Episode {idx + 1}</div>
                          <h3 className="text-lg font-medium text-white group-hover:text-[#ff4e00] transition-colors">{episode.title}</h3>
                        </div>
                        <button 
                          onClick={() => {
                            setCurrentEpisodeIndex(idx);
                            loadEpisodeAudio(idx);
                          }}
                          disabled={isLoadingAudio === idx}
                          className={cn(
                            "w-12 h-12 rounded-2xl flex items-center justify-center transition-all",
                            currentEpisodeIndex === idx && episodeAudios[idx]
                              ? "bg-[#ff4e00] text-white shadow-lg shadow-[#ff4e00]/20"
                              : "bg-[#2a2b2e] text-[#8e9299] hover:bg-[#3a3b3e] hover:text-white"
                          )}
                        >
                          {isLoadingAudio === idx ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : currentEpisodeIndex === idx && episodeAudios[idx] ? (
                            <Pause className="w-5 h-5 fill-current" />
                          ) : (
                            <Play className="w-5 h-5 fill-current" />
                          )}
                        </button>
                      </div>

                      {currentEpisodeIndex === idx && (
                        <motion.div 
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          className="space-y-4 pt-4 border-t border-[#2a2b2e]"
                        >
                          <div className="space-y-6 max-h-64 overflow-y-auto pr-4 scrollbar-hide">
                            {episode.segments.map((seg, sIdx) => (
                              <div key={sIdx} className="space-y-1">
                                <div className="text-[10px] font-mono uppercase tracking-widest text-[#8e9299]">{seg.speaker}</div>
                                <p className="text-sm text-[#e0d8d0] leading-relaxed">{seg.text}</p>
                              </div>
                            ))}
                          </div>
                          {episodeAudios[idx] && (
                            <div className="pt-4">
                              <audio 
                                ref={audioRef} 
                                src={episodeAudios[idx]} 
                                className="w-full accent-[#ff4e00]" 
                                controls 
                                autoPlay
                              />
                            </div>
                          )}
                        </motion.div>
                      )}
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-20">
                  <div className="w-24 h-24 rounded-full border-2 border-dashed border-[#4a4b4e] flex items-center justify-center">
                    <Radio className="w-10 h-10" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xl font-serif italic">No Signal Detected</p>
                    <p className="text-sm max-w-xs">Upload a document to begin the multi-episode production process.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Session History Modal */}
      <AnimatePresence>
        {showHistory && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[#0a0502]/90 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#151619] border border-[#2a2b2e] rounded-[2.5rem] w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden shadow-2xl"
            >
              <div className="p-8 border-b border-[#2a2b2e] flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-[#ff4e00]/10 flex items-center justify-center text-[#ff4e00]">
                    <History className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-medium text-white">Session History</h2>
                    <p className="text-xs font-mono text-[#8e9299] uppercase tracking-widest">Saved Transcripts</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowHistory(false)}
                  className="p-2 rounded-xl hover:bg-[#1a1b1e] text-[#8e9299] hover:text-white transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-6 scrollbar-hide">
                {savedSessions.length > 0 ? (
                  savedSessions.map((session) => (
                    <div key={session.id} className="p-6 rounded-3xl bg-[#1a1b1e] border border-[#2a2b2e] space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <h3 className="text-sm font-medium text-white">{session.title}</h3>
                          <p className="text-[10px] font-mono text-[#8e9299] uppercase tracking-widest">
                            {session.transcript.length} Messages
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => downloadTranscript(session)}
                            className="p-2 rounded-lg bg-[#2a2b2e] text-[#8e9299] hover:text-white transition-all"
                            title="Download Transcript"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => deleteSession(session.id)}
                            className="p-2 rounded-lg bg-[#2a2b2e] text-red-400/50 hover:text-red-400 transition-all"
                            title="Delete Session"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <div className="space-y-3 max-h-32 overflow-y-auto pr-2 scrollbar-hide text-[11px] leading-relaxed text-[#8e9299]">
                        {session.transcript.slice(0, 3).map((t, i) => (
                          <div key={i} className="flex gap-2">
                            <span className="font-mono uppercase text-[#ff4e00] opacity-50">{t.role === 'user' ? 'U' : 'A'}:</span>
                            <span className="line-clamp-1">{t.text}</span>
                          </div>
                        ))}
                        {session.transcript.length > 3 && (
                          <p className="text-[9px] italic opacity-50">+ {session.transcript.length - 3} more messages...</p>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="h-48 flex flex-col items-center justify-center text-center space-y-4 opacity-20">
                    <History className="w-12 h-12" />
                    <p className="text-sm">No saved sessions yet.</p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
