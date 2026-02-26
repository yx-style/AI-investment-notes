export default function ManualNotes({ value, onChange }) {
  return (
    <div className="manual-notes">
      <textarea
        className="manual-notes-input"
        placeholder="随手记几个关键词或想法..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
