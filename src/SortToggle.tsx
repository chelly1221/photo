import { ArrowDown } from "lucide-react";

export default function SortToggle({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const oldest = value === "oldest";
  const label = oldest ? "오래된순" : "최신순";
  const nextLabel = oldest ? "최신순" : "오래된순";

  return <button className={`sort-toggle${oldest ? " is-oldest" : ""}`}
    aria-label={`사진 정렬: ${label}, ${nextLabel}으로 변경`}
    onClick={() => onChange(oldest ? "newest" : "oldest")}>
    <span key={value} className="sort-toggle-label">{label}</span>
    <ArrowDown size={14} strokeWidth={1.8} aria-hidden="true" />
  </button>;
}
