import { useEffect, useMemo, useState } from "react";
import { Loader2, Play, RefreshCw, ShieldQuestion, Zap } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  usePreviewExplainPermission,
  usePreviewForceFailure,
  usePreviewInspect,
  usePreviewRunProcess,
  usePreviewSetPersona,
  usePreviewStart,
} from "@/hooks/useEchothink";
import { showError, showSuccess } from "@/lib/toast";
import { EmptyState, FieldRow, JsonBlock } from "./WorkbenchPrimitives";
import type { ManifestSummary } from "./workbenchUtils";
import { isRecord, labelFromRecord } from "./workbenchUtils";

type FailureChoice = "none" | "permission" | "effect" | "runtime";

const FAILURE_CHOICES = [
  "none",
  "permission",
  "effect",
  "runtime",
] as const satisfies readonly FailureChoice[];

const CAPABILITY_CHOICES = [
  "process.run",
  "entity.query",
  "entity.get",
  "event.subscribe",
  "effect.invoke",
] as const;

export default function PreviewRuntime({
  domainId,
  manifest,
}: {
  domainId: string;
  manifest: ManifestSummary;
}) {
  const previewStart = usePreviewStart(domainId);
  const setPersona = usePreviewSetPersona(domainId);
  const runProcess = usePreviewRunProcess(domainId);
  const explainPermission = usePreviewExplainPermission(domainId);
  const inspect = usePreviewInspect(domainId, Boolean(previewStart.data));
  const forceFailure = usePreviewForceFailure(domainId);
  const [selectedPersonaId, setSelectedPersonaId] = useState("");
  const [processId, setProcessId] = useState("");
  const [processInput, setProcessInput] = useState("{}");
  const [capability, setCapability] = useState("process.run");
  const [permissionTarget, setPermissionTarget] = useState("");
  const [failureChoice, setFailureChoice] =
    useState<FailureChoice>("permission");

  const personas = useMemo(
    () =>
      (previewStart.data?.personas ?? [])
        .filter(isRecord)
        .map((persona, index) => {
          const id = labelFromRecord(persona, ["id"], `persona-${index + 1}`);
          return {
            id,
            label: labelFromRecord(persona, ["label", "name", "id"], id),
            role: labelFromRecord(persona, ["role"], "unknown-role"),
            invalid: persona.invalid === true,
          };
        }),
    [previewStart.data?.personas],
  );

  useEffect(() => {
    if (!selectedPersonaId && personas[0]) {
      setSelectedPersonaId(personas[0].id);
    }
  }, [personas, selectedPersonaId]);

  useEffect(() => {
    if (!processId && manifest.processes[0]) {
      setProcessId(manifest.processes[0]);
      setPermissionTarget(manifest.processes[0]);
    }
  }, [manifest.processes, processId]);

  const handlePersonaChange = async (value: string | null) => {
    if (!value) {
      return;
    }
    setSelectedPersonaId(value);
    try {
      await setPersona.mutateAsync(value);
      showSuccess("Preview persona updated.");
    } catch (error) {
      showError(error);
    }
  };

  const handleRunProcess = async () => {
    if (!processId.trim()) {
      showError("Select or enter a process id first.");
      return;
    }
    try {
      const input = processInput.trim() ? JSON.parse(processInput) : {};
      await runProcess.mutateAsync({
        processId: processId.trim(),
        input,
      });
      showSuccess("Preview process executed.");
    } catch (error) {
      showError(
        error instanceof SyntaxError
          ? `Invalid JSON input: ${error.message}`
          : error,
      );
    }
  };

  const handleExplainPermission = async () => {
    if (!capability.trim() || !permissionTarget.trim()) {
      showError("Capability and target are required.");
      return;
    }
    try {
      await explainPermission.mutateAsync({
        capability: capability.trim(),
        target: permissionTarget.trim(),
      });
    } catch (error) {
      showError(error);
    }
  };

  const handleForceFailure = async () => {
    try {
      await forceFailure.mutateAsync(
        failureChoice === "none" ? null : failureChoice,
      );
      showSuccess("Preview failure mode updated.");
    } catch (error) {
      showError(error);
    }
  };

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-2xl font-semibold tracking-normal">
          Preview Runtime
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Persona simulation, process debugging, permission explanation, and
          audit/event inspection.
        </p>
      </header>

      {previewStart.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Starting preview runtime
        </div>
      ) : previewStart.error ? (
        <EmptyState title="Preview runtime could not start">
          {previewStart.error.message}
        </EmptyState>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="space-y-5">
            <Card className="rounded-md">
              <CardHeader>
                <CardTitle className="text-base">Persona Switcher</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {personas.length ? (
                  <>
                    <Select
                      value={selectedPersonaId}
                      onValueChange={handlePersonaChange}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {personas.map((persona) => (
                          <SelectItem key={persona.id} value={persona.id}>
                            {persona.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex flex-wrap gap-2">
                      {personas.map((persona) => (
                        <Badge
                          key={persona.id}
                          variant="outline"
                          className={
                            persona.invalid
                              ? "border-destructive/40 bg-destructive/8 text-destructive"
                              : undefined
                          }
                        >
                          {persona.label}: {persona.role}
                        </Badge>
                      ))}
                    </div>
                  </>
                ) : (
                  <EmptyState title="No personas returned" />
                )}
              </CardContent>
            </Card>

            <Card className="rounded-md">
              <CardHeader>
                <CardTitle className="text-base">Process Runner</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="process-id">Process</Label>
                    {manifest.processes.length ? (
                      <Select
                        value={processId}
                        onValueChange={(value) => {
                          if (!value) {
                            return;
                          }
                          setProcessId(value);
                          setPermissionTarget(value);
                        }}
                      >
                        <SelectTrigger id="process-id" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {manifest.processes.map((process) => (
                            <SelectItem key={process} value={process}>
                              {process}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id="process-id"
                        value={processId}
                        onChange={(event) => setProcessId(event.target.value)}
                        placeholder="process.id"
                      />
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="permission-target">Permission target</Label>
                    <Input
                      id="permission-target"
                      value={permissionTarget}
                      onChange={(event) =>
                        setPermissionTarget(event.target.value)
                      }
                      placeholder="process.id"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="process-input">Input JSON</Label>
                  <Textarea
                    id="process-input"
                    value={processInput}
                    onChange={(event) => setProcessInput(event.target.value)}
                    className="min-h-36 font-mono"
                  />
                </div>
                <Button
                  onClick={handleRunProcess}
                  disabled={runProcess.isPending}
                >
                  {runProcess.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Play className="size-4" />
                  )}
                  Run
                </Button>
                {runProcess.data ? (
                  runProcess.data.ok ? (
                    <JsonBlock value={runProcess.data.data} />
                  ) : (
                    <Alert variant="destructive">
                      <AlertTitle>{runProcess.data.error.kind}</AlertTitle>
                      <AlertDescription>
                        <div>{runProcess.data.error.message}</div>
                        {runProcess.data.error.details ? (
                          <JsonBlock
                            value={runProcess.data.error.details}
                            className="mt-2 border-destructive/30 bg-background text-foreground"
                          />
                        ) : null}
                      </AlertDescription>
                    </Alert>
                  )
                ) : null}
              </CardContent>
            </Card>

            <Card className="rounded-md">
              <CardHeader>
                <CardTitle className="text-base">
                  Permission Explainer
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Capability</Label>
                    <Select
                      value={capability}
                      onValueChange={(value) => {
                        if (value) {
                          setCapability(value);
                        }
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CAPABILITY_CHOICES.map((choice) => (
                          <SelectItem key={choice} value={choice}>
                            {choice}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="explainer-target">Target</Label>
                    <Input
                      id="explainer-target"
                      value={permissionTarget}
                      onChange={(event) =>
                        setPermissionTarget(event.target.value)
                      }
                      placeholder="issue.assign"
                    />
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={handleExplainPermission}
                  disabled={explainPermission.isPending}
                >
                  {explainPermission.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ShieldQuestion className="size-4" />
                  )}
                  Explain Permission
                </Button>
                {explainPermission.data ? (
                  <Alert>
                    <AlertTitle>
                      {explainPermission.data.allowed ? "Allowed" : "Denied"}
                    </AlertTitle>
                    <AlertDescription>
                      {explainPermission.data.reason}
                    </AlertDescription>
                  </Alert>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-5">
            <Card className="rounded-md">
              <CardHeader>
                <CardTitle className="text-base">Preview Session</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <FieldRow
                  label="Session"
                  value={
                    <span className="font-mono text-xs">
                      {previewStart.data?.sessionId ?? "n/a"}
                    </span>
                  }
                />
                <FieldRow
                  label="Surfaces"
                  value={String(previewStart.data?.surfaces.length ?? 0)}
                />
                <FieldRow label="Personas" value={String(personas.length)} />
              </CardContent>
            </Card>

            <Card className="rounded-md">
              <CardHeader>
                <CardTitle className="text-base">
                  Error Boundary Preview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Select
                  value={failureChoice}
                  onValueChange={(value) => {
                    if (isFailureChoice(value)) {
                      setFailureChoice(value);
                    }
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FAILURE_CHOICES.map((choice) => (
                      <SelectItem key={choice} value={choice}>
                        {choice}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  onClick={handleForceFailure}
                  disabled={forceFailure.isPending}
                >
                  {forceFailure.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Zap className="size-4" />
                  )}
                  Force Failure
                </Button>
              </CardContent>
            </Card>

            <Card className="rounded-md">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base">Audit Inspector</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => inspect.refetch()}
                    disabled={inspect.isFetching}
                  >
                    <RefreshCw className="size-4" />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <JsonBlock value={inspect.data?.audit ?? []} />
              </CardContent>
            </Card>

            <Card className="rounded-md">
              <CardHeader>
                <CardTitle className="text-base">Event Inspector</CardTitle>
              </CardHeader>
              <CardContent>
                <JsonBlock value={inspect.data?.events ?? []} />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function isFailureChoice(value: string | null): value is FailureChoice {
  return FAILURE_CHOICES.includes(value as FailureChoice);
}
