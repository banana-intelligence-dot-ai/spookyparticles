/**
 * A number that rolls digit by digit when it changes. First paint shows the value as is;
 * motion only explains a change (a total that grows while receipts are read).
 * Reduce Motion swaps the roll for an instant change (globals.css).
 */
export function Ticker({ value, className = "" }: { value: string; className?: string }) {
  const chars = value.split("");
  return (
    <span className={`inline-flex ${className}`}>
      <span className="sr-only">{value}</span>
      {chars.map((ch, i) => {
        const fromRight = chars.length - i;
        if (!/\d/.test(ch)) {
          return (
            <span key={`c${fromRight}`} aria-hidden>
              {ch}
            </span>
          );
        }
        return <Digit key={`d${fromRight}`} d={Number(ch)} delay={(fromRight - 1) * 30} />;
      })}
    </span>
  );
}

function Digit({ d, delay }: { d: number; delay: number }) {
  return (
    <span aria-hidden className="relative inline-block h-[1em] overflow-hidden leading-none">
      <span className="invisible">0</span>
      <span
        className="ticker-col absolute inset-x-0 top-0 flex flex-col"
        style={{ transform: `translateY(-${d * 10}%)`, transitionDelay: `${delay}ms` }}
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <span key={n} className="h-[1em] leading-none">
            {n}
          </span>
        ))}
      </span>
    </span>
  );
}
