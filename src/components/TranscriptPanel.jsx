import { useEffect, useRef } from "react";
import { formatTime } from "../utils/formatTime.js";

export default function TranscriptPanel({ transcripts, interimText }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts, interimText]);

  return (
    <div className="panel transcript-panel">
      <h2 className="panel-title">实时转录</h2>
      <div className="panel-content">
        {transcripts.length === 0 && !interimText && (
          <p className="placeholder">点击"开始录音"后，转录内容将在这里实时显示...</p>
        )}
        {transcripts.map((item, i) => (
          <div key={i} className="transcript-line">
            <span className="timestamp">[{item.time}]</span>
            <span className="text">{item.text}</span>
          </div>
        ))}
        {interimText && (
          <div className="transcript-line interim">
            <span className="timestamp">[{formatTime()}]</span>
            <span className="text">{interimText}</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
