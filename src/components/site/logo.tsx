import { cn } from "@/lib/utils";

/** Monogram + wordmark. The name comes from Settings → Agency. */
export function Logo({ name, className, inverted }: { name: string; className?: string; inverted?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        aria-hidden
        className={cn(
          "grid size-8 place-items-center rounded-[10px] text-[15px] font-semibold leading-none tracking-tight",
          inverted ? "bg-white/90 text-[#1f4d3d]" : "bg-accent text-accent-ink",
        )}
      >
        {name.charAt(0).toLowerCase()}
      </span>
      <Wordmark name={name} />
    </span>
  );
}

/** Joined names ("DestinoCalamuchita") read better with a weight change at the second capital. */
function Wordmark({ name }: { name: string }) {
  const parts = /^(\p{Lu}\p{Ll}+)(\p{Lu}.*)$/u.exec(name);
  return (
    <span className="text-[15px] font-semibold tracking-[-0.02em] min-[360px]:text-[17px]">
      {parts ? (
        <>
          {parts[1]}
          <span className="font-normal opacity-80">{parts[2]}</span>
        </>
      ) : (
        name
      )}
    </span>
  );
}
