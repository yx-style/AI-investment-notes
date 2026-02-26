import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import cors from "cors";
import { createDeepgramConnection } from "./deepgram.js";
import { generateStructuredNotes } from "./claude.js";

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Track active sessions
const sessions = new Map();

server.on("upgrade", (request, socket, head) => {
  if (request.url === "/ws") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on("connection", (ws) => {
  console.log("Client connected");

  const session = {
    transcriptBuffer: [],
    allTranscripts: [],
    deepgramConnection: null,
    lastNoteTime: Date.now(),
    previousNotes: null,
    isGeneratingNotes: false,
  };
  sessions.set(ws, session);

  ws.on("message", async (message) => {
    try {
      // Check if it's a control message (JSON) or audio data (binary)
      if (typeof message === "string" || (message instanceof Buffer && message[0] === 0x7b)) {
        const text = typeof message === "string" ? message : message.toString();
        const data = JSON.parse(text);

        if (data.type === "start") {
          console.log("Starting transcription, language:", data.language || "multi");
          session.transcriptBuffer = [];
          session.allTranscripts = [];
          session.previousNotes = null;
          session.lastNoteTime = Date.now();

          try {
            session.deepgramConnection = createDeepgramConnection({
              language: data.language || "multi",
              onTranscript: (transcript) => {
              if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify(transcript));
              }
              if (transcript.is_final && transcript.text) {
                session.transcriptBuffer.push(transcript.text);
                session.allTranscripts.push(transcript.text);
              }
            },
            onError: (error) => {
              console.error("Deepgram error:", error);
              if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({ type: "error", message: error.message }));
              }
            },
            onClose: () => {
              console.log("Deepgram connection closed");
            },
          });
          } catch (dgErr) {
            console.error("Deepgram connection failed:", dgErr.message);
            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify({ type: "error", message: dgErr.message }));
            }
          }
        } else if (data.type === "stop") {
          console.log("Stopping transcription");
          if (session.deepgramConnection) {
            session.deepgramConnection.close();
            session.deepgramConnection = null;
          }
          // Generate final notes
          if (session.allTranscripts.length > 0) {
            await triggerNoteGeneration(ws, session, true);
          }
        } else if (data.type === "generate_notes") {
          await triggerNoteGeneration(ws, session, false);
        }
      } else {
        // Binary audio data - forward to Deepgram
        if (session.deepgramConnection) {
          session.deepgramConnection.send(message);
        }
      }
    } catch (err) {
      console.error("Error processing message:", err);
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
    if (session.deepgramConnection) {
      session.deepgramConnection.close();
    }
    sessions.delete(ws);
  });
});

async function triggerNoteGeneration(ws, session, isFinal) {
  if (session.isGeneratingNotes) return;
  if (session.transcriptBuffer.length === 0 && !isFinal) return;

  session.isGeneratingNotes = true;
  const transcriptText = isFinal
    ? session.allTranscripts.join("\n")
    : session.transcriptBuffer.join("\n");

  try {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: "notes_generating" }));
    }

    const notes = await generateStructuredNotes(
      transcriptText,
      session.previousNotes,
      isFinal
    );

    session.previousNotes = notes;
    if (!isFinal) {
      session.transcriptBuffer = [];
    }
    session.lastNoteTime = Date.now();

    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: "notes_update", notes, isFinal }));
    }
  } catch (err) {
    console.error("Error generating notes:", err);
    if (ws.readyState === ws.OPEN) {
      ws.send(
        JSON.stringify({ type: "notes_error", message: err.message })
      );
    }
  } finally {
    session.isGeneratingNotes = false;
  }
}

// Auto-generate notes periodically (every 3 minutes of new content)
setInterval(() => {
  for (const [ws, session] of sessions) {
    const timeSinceLastNote = Date.now() - session.lastNoteTime;
    if (
      session.transcriptBuffer.length > 0 &&
      timeSinceLastNote >= 3 * 60 * 1000 &&
      !session.isGeneratingNotes
    ) {
      triggerNoteGeneration(ws, session, false);
    }
  }
}, 30_000);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(
    `Deepgram API Key: ${process.env.DEEPGRAM_API_KEY ? "configured" : "MISSING"}`
  );
  console.log(
    `Anthropic API Key: ${process.env.ANTHROPIC_API_KEY ? "configured" : "MISSING"}`
  );
});
