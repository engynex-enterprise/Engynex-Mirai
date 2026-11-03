import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-[glimmer_1.6s_ease-in-out_infinite] rounded-lg bg-secondary", className)}
      {...props}
    />
  )
}

export { Skeleton }
