import { useState, useRef, useCallback } from "react";

export function useAudioCapture(onAudioData) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState(null);
  const mediaStreamRef = useRef(null);
  const processorRef = useRef(null);
  const contextRef = useRef(null);

  const start = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      mediaStreamRef.current = stream;

      const audioContext = new AudioContext({ sampleRate: 16000 });
      contextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);

      // Use ScriptProcessor for wider compatibility
      // (AudioWorklet requires serving from HTTPS or localhost)
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const float32 = e.inputBuffer.getChannelData(0);
        // Convert float32 to int16 PCM
        const int16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
          const s = Math.max(-1, Math.min(1, float32[i]));
          int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        onAudioData(int16.buffer);
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      setIsCapturing(true);
    } catch (err) {
      const msg =
        err.name === "NotAllowedError"
          ? "麦克风权限被拒绝，请在浏览器设置中允许麦克风访问"
          : `音频捕获失败: ${err.message}`;
      setError(msg);
      console.error("Audio capture error:", err);
    }
  }, [onAudioData]);

  const stop = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (contextRef.current) {
      contextRef.current.close();
      contextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    setIsCapturing(false);
  }, []);

  return { isCapturing, error, start, stop };
}
