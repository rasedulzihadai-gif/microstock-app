const LABELS = {
  done: "Ready",
  error: "Failed",
  processing: "Working",
  pending: "Queued",
};

export function StatusDot({ status, pill = false, label }) {
  const key = LABELS[status] ? status : "pending";
  return (
    <span className={`status status--${key}${pill ? " status--pill" : ""}`}>
      <span className="status__dot" />
      {label ?? LABELS[key]}
    </span>
  );
}
