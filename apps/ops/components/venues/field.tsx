import { cn } from '../../lib/utils';

/** A label-and-control pair. Keeps vertical rhythm consistent across forms. */
export function Field({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1.5', className)} {...props} />;
}
