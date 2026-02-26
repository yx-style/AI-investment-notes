import { formatDuration } from "../utils/formatTime.js";

export default function RecordingControls({
  isRecording,
  duration,
  onStart,
  onStop,
  onGenerateNotes,
  isGeneratingNotes,
  disabled,
}) {
  return (
    <div className="recording-controls">
      <div className="controls-left">
        {!isRecording ? (
          <button className="btn btn-start" onClick={onStart} disabled={disabled}>
            <span className="btn-icon">&#9679;</span>
            开始录音
          </button>
        ) : (
          <button className="btn btn-stop" onClick={onStop}>
            <span className="btn-icon">&#9632;</span>
            停止录音
          </button>
        )}
        {isRecording && <span className="duration">{formatDuration(duration)}</span>}
        {isRecording && (
          <span className="recording-indicator">
            <span className="pulse" />
            录音中
          </span>
        )}
      </div>
      <div className="controls-right">
        <button
          className="btn btn-notes"
          onClick={onGenerateNotes}
          disabled={!isRecording || isGeneratingNotes}
        >
          {isGeneratingNotes ? "生成中..." : "立即生成笔记"}
        </button>
      </div>
    </div>
  );
}
