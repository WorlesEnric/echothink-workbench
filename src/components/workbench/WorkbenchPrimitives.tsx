import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, CircleSlash, XCircle } from "lucide-react";
import type {
  PromotionState,
  SemanticDiagnostic,
  ValidationReport,
} from "@/ipc/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { prettyJson } from "./workbenchUtils";

export function StatusBadge({ status }: { status: PromotionState | string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "capitalize",
        status === "production" &&
          "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        status === "canary" &&
          "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
        status === "approved" &&
          "border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
        status === "release-candidate" &&
          "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        status === "rolled-back" &&
          "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
      )}
    >
      {status.replaceAll("-", " ")}
    </Badge>
  );
}

export function RiskBadge({
  label,
  tone,
}: {
  label: string;
  tone: "low" | "medium" | "high";
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        tone === "low" &&
          "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        tone === "medium" &&
          "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        tone === "high" &&
          "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
      )}
    >
      {label}
    </Badge>
  );
}

export function GateStatusIcon({
  status,
}: {
  status: ValidationReport["gates"][number]["status"];
}) {
  if (status === "pass") {
    return <CheckCircle2 className="size-4 text-emerald-500" />;
  }
  if (status === "fail") {
    return <XCircle className="size-4 text-destructive" />;
  }
  return <CircleSlash className="size-4 text-muted-foreground" />;
}

export function DiagnosticList({
  diagnostics,
}: {
  diagnostics: readonly SemanticDiagnostic[];
}) {
  if (diagnostics.length === 0) {
    return (
      <div className="rounded-md border border-emerald-500/20 bg-emerald-500/8 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
        No diagnostics.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {diagnostics.map((diagnostic, index) => (
        <div
          key={`${diagnostic.code}-${diagnostic.path}-${index}`}
          className={cn(
            "rounded-md border px-3 py-2 text-sm",
            diagnostic.severity === "error"
              ? "border-destructive/30 bg-destructive/8 text-destructive"
              : "border-amber-500/30 bg-amber-500/8 text-amber-700 dark:text-amber-300",
          )}
        >
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle className="size-4" />
            {diagnostic.code}
          </div>
          <div className="mt-1 text-xs opacity-80">{diagnostic.path}</div>
          <div className="mt-1">{diagnostic.message}</div>
        </div>
      ))}
    </div>
  );
}

export function JsonBlock({
  value,
  className,
}: {
  value: unknown;
  className?: string;
}) {
  return (
    <pre
      className={cn(
        "max-h-80 overflow-auto rounded-md border bg-muted/40 p-3 text-xs leading-relaxed",
        className,
      )}
    >
      {prettyJson(value)}
    </pre>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-md border border-dashed p-6 text-center">
      <div className="text-sm font-medium">{title}</div>
      {children ? (
        <div className="mt-2 text-sm text-muted-foreground">{children}</div>
      ) : null}
    </div>
  );
}

export function FieldRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3 text-sm">
      <div className="text-muted-foreground">{label}</div>
      <div className="min-w-0 break-words">{value}</div>
    </div>
  );
}
