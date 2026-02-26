import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";

let deepgram = null;

function getClient() {
  if (!deepgram) {
    if (!process.env.DEEPGRAM_API_KEY) {
      throw new Error("DEEPGRAM_API_KEY is not set. Check your .env file.");
    }
    deepgram = createClient(process.env.DEEPGRAM_API_KEY);
  }
  return deepgram;
}

export function createDeepgramConnection({ language, onTranscript, onError, onClose }) {
  const connection = getClient().listen.live({
    model: "nova-3",
    language: language || "multi",
    smart_format: true,
    punctuate: true,
    interim_results: true,
    utterance_end_ms: 1500,
    vad_events: true,
    encoding: "linear16",
    sample_rate: 16000,
  });

  connection.on(LiveTranscriptionEvents.Open, () => {
    console.log("Deepgram connection opened");
  });

  connection.on(LiveTranscriptionEvents.Transcript, (data) => {
    const transcript = data.channel?.alternatives?.[0];
    if (!transcript) return;

    const text = transcript.transcript?.trim();
    if (!text) return;

    onTranscript({
      type: "transcript",
      text,
      is_final: data.is_final,
      speech_final: data.speech_final,
      confidence: transcript.confidence,
      start: data.start,
      duration: data.duration,
    });
  });

  connection.on(LiveTranscriptionEvents.Error, (err) => {
    onError(err);
  });

  connection.on(LiveTranscriptionEvents.Close, () => {
    onClose();
  });

  return {
    send: (audioData) => {
      if (connection.getReadyState() === 1) {
        connection.send(audioData);
      }
    },
    close: () => {
      connection.requestClose();
    },
  };
}
