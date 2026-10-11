import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <AlertCircle className="h-6 w-6 text-danger" aria-hidden="true" />
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {description && <p className="max-w-md break-words text-sm text-muted-foreground">{description}</p>}
      {onRetry && <Button variant="secondary" onClick={onRetry}><RefreshCw aria-hidden="true" /> Retry</Button>}
    </div>
  );
}