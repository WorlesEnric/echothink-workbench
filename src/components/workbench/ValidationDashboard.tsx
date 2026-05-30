import { Loader2, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRunValidation, useValidationReport } from "@/hooks/useEchothink";
import { cn } from "@/lib/utils";
import { showError, showSuccess } from "@/lib/toast";
import { EmptyState, FieldRow, GateStatusIcon } from "./WorkbenchPrimitives";
import { isRequiredGate } from "./workbenchUtils";

export default function ValidationDashboard({
  domainId,
}: {
  domainId: string;
}) {
  const cachedReport = useValidationReport(domainId);
  const runValidation = useRunValidation(domainId);
  const report = runValidation.data ?? cachedReport.data;
  const blockerGates =
    report?.gates.filter(
      (gate) =>
        gate.status === "fail" && isRequiredGate(gate.gate, gate.surfaceType),
    ) ?? [];

  const handleRunValidation = async () => {
    try {
      const result = await runValidation.mutateAsync(undefined);
      showSuccess(
        result.overall === "pass"
          ? "Validation passed."
          : "Validation completed with failures.",
      );
    } catch (error) {
      showError(error);
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-normal">
            Validation Dashboard
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Deterministic governance gates, findings, durations, and promotion
            blockers.
          </p>
        </div>
        <Button
          onClick={handleRunValidation}
          disabled={runValidation.isPending}
        >
          {runValidation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ShieldCheck className="size-4" />
          )}
          Run Validation
        </Button>
      </header>

      {!report ? (
        <EmptyState title="No validation run yet">
          Run validation to populate gate status and promotion blockers.
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card className="rounded-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  Overall
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-sm uppercase",
                    report.overall === "pass"
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "border-destructive/40 bg-destructive/8 text-destructive",
                  )}
                >
                  {report.overall}
                </Badge>
              </CardContent>
            </Card>
            <Card className="rounded-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  Gates
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {report.gates.length}
              </CardContent>
            </Card>
            <Card className="rounded-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  Blockers
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {blockerGates.length}
              </CardContent>
            </Card>
            <Card className="rounded-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  Version
                </CardTitle>
              </CardHeader>
              <CardContent className="font-mono text-sm">
                {report.version}
              </CardContent>
            </Card>
          </div>

          {blockerGates.length ? (
            <Card className="rounded-md border-destructive/30">
              <CardHeader>
                <CardTitle className="text-base text-destructive">
                  Promotion Blockers
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {blockerGates.map((gate) => (
                  <Badge
                    key={`${gate.gate}-${gate.surfaceType ?? "global"}`}
                    variant="outline"
                    className="border-destructive/40 bg-destructive/8 text-destructive"
                  >
                    {gate.gate}
                    {gate.surfaceType ? `:${gate.surfaceType}` : ""}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <Card className="rounded-md">
            <CardHeader>
              <CardTitle className="text-base">Run Metadata</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 md:grid-cols-2">
              <FieldRow label="Run id" value={report.runId} />
              <FieldRow label="Domain" value={report.domainId} />
              <FieldRow label="Created" value={report.createdAt} />
              <FieldRow
                label="Surface profile"
                value={
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(report.surfaceTypeProfile).map(
                      ([surfaceId, type]) => (
                        <Badge key={surfaceId} variant="outline">
                          {surfaceId}: {type}
                        </Badge>
                      ),
                    )}
                  </div>
                }
              />
            </CardContent>
          </Card>

          <div className="space-y-3">
            {report.gates.map((gate) => (
              <Card
                key={`${gate.gate}-${gate.surfaceType ?? "global"}`}
                className="rounded-md"
              >
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <GateStatusIcon status={gate.status} />
                      <div>
                        <div className="font-medium">
                          {gate.gate.replaceAll("-", " ")}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {gate.surfaceType ?? "global"} · {gate.durationMs}ms
                        </div>
                      </div>
                    </div>
                    <Badge variant="outline">
                      {isRequiredGate(gate.gate, gate.surfaceType)
                        ? "blocker if failed"
                        : "conditional"}
                    </Badge>
                  </div>
                  {gate.findings.length ? (
                    <div className="mt-4 space-y-2">
                      {gate.findings.map((finding, index) => (
                        <div
                          key={`${finding.code}-${index}`}
                          className={cn(
                            "rounded-md border px-3 py-2 text-sm",
                            finding.severity === "error"
                              ? "border-destructive/30 bg-destructive/8 text-destructive"
                              : "border-amber-500/30 bg-amber-500/8 text-amber-700 dark:text-amber-300",
                          )}
                        >
                          <div className="font-medium">{finding.code}</div>
                          <div className="mt-1">{finding.message}</div>
                          {finding.file ? (
                            <div className="mt-1 font-mono text-xs opacity-80">
                              {finding.file}
                              {finding.line ? `:${finding.line}` : ""}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
