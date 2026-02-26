import { useState, useCallback, useEffect, useRef } from "react";
import RecordingControls from "./components/RecordingControls.jsx";
import TranscriptPanel from "./components/TranscriptPanel.jsx";
import NotesPanel from "./components/NotesPanel.jsx";
import ManualNotes from "./components/ManualNotes.jsx";
import { useAudioCapture } from "./hooks/useAudioCapture.js";
import { useWebSocket } from "./hooks/useWebSocket.js";
import { formatTime } from "./utils/formatTime.js";

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcripts, setTranscripts] = useState([]);
  const [interimText, setInterimText] = useState("");
  const [notes, setNotes] = useState(null);
  const [isGeneratingNotes, setIsGeneratingNotes] = useState(false);
  const [manualNotes, setManualNotes] = useState("");
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(null);
  const startTimeRef = useRef(null);
  const timerRef = useRef(null);

  const ws = useWebSocket();

  // Register WebSocket message handlers
  useEffect(() => {
    ws.on("transcript", (data) => {
      if (data.is_final) {
        setTranscripts((prev) => [
          ...prev,
          { text: data.text, time: formatTime() },
        ]);
        setInterimText("");
      } else {
        setInterimText(data.text);
      }
    });

    ws.on("notes_update", (data) => {
      setNotes(data.notes);
      setIsGeneratingNotes(false);
    });

    ws.on("notes_generating", () => {
      setIsGeneratingNotes(true);
    });

    ws.on("notes_error", (data) => {
      console.error("Notes error:", data.message);
      setIsGeneratingNotes(false);
      setError(`笔记生成失败: ${data.message}`);
      setTimeout(() => setError(null), 5000);
    });

    ws.on("error", (data) => {
      setError(data.message);
      setTimeout(() => setError(null), 5000);
    });
  }, [ws]);

  const handleAudioData = useCallback(
    (audioBuffer) => {
      ws.send(audioBuffer);
    },
    [ws]
  );

  const audio = useAudioCapture(handleAudioData);

  const handleStart = useCallback(async () => {
    try {
      setError(null);
      setTranscripts([]);
      setInterimText("");
      setNotes(null);
      setDuration(0);

      await ws.connect();
      ws.send({ type: "start", language: "multi" });
      await audio.start();

      setIsRecording(true);
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setDuration(Date.now() - startTimeRef.current);
      }, 1000);
    } catch (err) {
      setError(`启动失败: ${err.message}`);
    }
  }, [ws, audio]);

  const handleStop = useCallback(() => {
    audio.stop();
    ws.send({ type: "stop" });
    setIsRecording(false);
    setInterimText("");
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [ws, audio]);

  const handleGenerateNotes = useCallback(() => {
    ws.send({ type: "generate_notes" });
  }, [ws]);

  // Show audio capture errors
  useEffect(() => {
    if (audio.error) {
      setError(audio.error);
    }
  }, [audio.error]);

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">投研访谈助手</h1>
        <RecordingControls
          isRecording={isRecording}
          duration={duration}
          onStart={handleStart}
          onStop={handleStop}
          onGenerateNotes={handleGenerateNotes}
          isGeneratingNotes={isGeneratingNotes}
        />
      </header>

      {error && <div className="error-banner">{error}</div>}

      <main className="main-content">
        <TranscriptPanel transcripts={transcripts} interimText={interimText} />
        <NotesPanel notes={notes} isGenerating={isGeneratingNotes} />
      </main>

      <footer className="app-footer">
        <ManualNotes value={manualNotes} onChange={setManualNotes} />
      </footer>
    </div>
  );
}
