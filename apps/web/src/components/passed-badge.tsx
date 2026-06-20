export function PassedBadge({ passed }: { passed: boolean }) {
  const cls = passed
    ? "bg-green-100 text-green-700"
    : "bg-red-100 text-red-700";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {passed ? "Passed" : "Failed"}
    </span>
  );
}
