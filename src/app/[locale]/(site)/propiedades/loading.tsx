import { Skeleton } from "@/components/ui/feedback";

export default function CatalogLoading() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 pt-[100px] pb-24 sm:px-6 lg:px-10" aria-busy>
      <Skeleton className="h-10 w-64" />
      <Skeleton className="mt-3 h-5 w-96 max-w-full" />
      <div className="mt-8 flex gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-11 w-32 rounded-full" />
        ))}
      </div>
      <div className="mt-12 grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-6 sm:gap-y-12 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i}>
            <Skeleton className="aspect-[4/3] w-full rounded-xl sm:rounded-2xl" />
            <Skeleton className="mt-4 h-5 w-2/3" />
            <Skeleton className="mt-2 h-4 w-1/2" />
            <Skeleton className="mt-3 h-4 w-1/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
