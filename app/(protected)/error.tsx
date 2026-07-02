"use client";

export default function ProtectedError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background p-8 text-center">
      <p className="text-lg font-semibold text-foreground">
        Something went wrong
      </p>
      <p className="max-w-sm text-sm text-muted-foreground">
        An unexpected error occurred. You can try again or reload the page.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
