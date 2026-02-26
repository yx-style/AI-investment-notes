import Markdown from "react-markdown";

export default function NotesPanel({ notes, isGenerating }) {
  return (
    <div className="panel notes-panel">
      <h2 className="panel-title">
        结构化笔记
        {isGenerating && <span className="generating-badge">生成中...</span>}
      </h2>
      <div className="panel-content notes-content">
        {!notes ? (
          <p className="placeholder">
            AI 将根据转录内容自动生成结构化笔记。
            <br />
            每 3 分钟自动更新，也可手动点击"立即生成笔记"。
          </p>
        ) : (
          <Markdown>{notes}</Markdown>
        )}
      </div>
    </div>
  );
}
