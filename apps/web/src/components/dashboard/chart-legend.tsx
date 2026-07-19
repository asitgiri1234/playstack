/**
 * Legend for the donut charts. A swatch plus a label plus the value — the value
 * matters because a donut's arc lengths are hard to read precisely, and the
 * number removes the guesswork. aria-hidden on the swatch; the text carries it.
 */
export function ChartLegend({
  items,
}: {
  items: { label: string; value: number; color?: string | undefined }[];
}): React.JSX.Element {
  return (
    <ul className="w-full space-y-1.5 sm:w-40">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2 text-sm">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
            style={{ backgroundColor: item.color }}
            aria-hidden
          />
          <span className="flex-1 truncate text-content-muted">{item.label}</span>
          <span className="tabular font-medium text-content">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}
