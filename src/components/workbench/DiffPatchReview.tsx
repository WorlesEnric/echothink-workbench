import { useEffect, useState } from "react";
import { Bot, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useGeneratedArtifacts,
  useHarnessResult,
  useHarnessRun,
} from "@/hooks/useEchothink";
import { cn } from "@/lib/utils";
import { showError, showSuccess } from "@/lib/toast";
import { EmptyState, FieldRow, JsonBlock } from "./WorkbenchPrimitives";

export default function DiffPatchReview({ domainId }: { domainId: string }) {
  const generatedArtifacts = useGeneratedArtifacts(domainId);
  const harnessResult = useHarnessResult(domainId);
  const harnessRun = useHarnessRun(domainId);
  const files = generatedArtifacts.data.files;
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [prompt, setPrompt] = useState(
    "Repair validation failures without changing governed platform files.",
  );
  const [maxIterations, setMaxIterations] = useState(3);

  useEffect(() => {
    if (!selectedFile && files[0]) {
      setSelectedFile(files[0]);
    }
  }, [files, selectedFile]);

  const handleHarnessRun = async () => {
    if (!prompt.trim()) {
      showError("A Codex repair prompt is required.");
      return;
    }
    try {
      const result = await harnessRun.mutateAsync({
        prompt: prompt.trim(),
        maxIterations,
      });
      showSuccess(
        result.ok
          ? "Codex repair completed."
          : "Codex repair completed with blockers.",
      );
    } catch (error) {
      showError(error);
    }
  };

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-2xl font-semibold tracking-normal">
          Diff and Patch Review
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Generated file paths, read-only review, and controlled Codex repair.
        </p>
      </header>

      <div className="grid gap-5 xl:grid-cols-[20rem_minmax(0,1fr)]">
        <Card className="rounded-md">
          <CardHeader>
            <CardTitle className="text-base">Generated Files</CardTitle>
          </CardHeader>
          <CardContent>
            {files.length === 0 ? (
              <EmptyState title="No generated files cached">
                Run Generate Artifacts in Manifest Studio or Surface Studio.
              </EmptyState>
            ) : (
              <div className="max-h-[32rem] space-y-1 overflow-auto">
                {files.map((file) => (
                  <button
                    key={file}
                    type="button"
                    onClick={() => setSelectedFile(file)}
                    className={cn(
                      "w-full rounded-md px-3 py-2 text-left font-mono text-xs transition-colors",
                      selectedFile === file
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-muted",
                    )}
                  >
                    {file}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-md">
          <CardHeader>
            <CardTitle className="text-base">Read-only Viewer</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedFile ? (
              <pre className="min-h-72 overflow-auto rounded-md border bg-muted/40 p-4 font-mono text-xs leading-relaxed">
                {`Path: ${selectedFile}\n\nFile contents are not returned by the current IPC contract. The backend returned generated path metadata only.`}
              </pre>
            ) : (
              <EmptyState title="Select a generated file" />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-md">
        <CardHeader>
          <CardTitle className="text-base">Codex Repair</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_10rem]">
            <div className="space-y-2">
              <Label htmlFor="codex-repair-prompt">Prompt</Label>
              <Textarea
                id="codex-repair-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                className="min-h-28"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="codex-max-iterations">Max iterations</Label>
              <Input
                id="codex-max-iterations"
                type="number"
                min={1}
                max={8}
                value={maxIterations}
                onChange={(event) =>
                  setMaxIterations(Number(event.target.value) || 1)
                }
              />
            </div>
          </div>
          <Button onClick={handleHarnessRun} disabled={harnessRun.isPending}>
            {harnessRun.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Bot className="size-4" />
            )}
            Run Codex Repair
          </Button>

          {harnessResult.data ? (
            <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
              <div className="space-y-2">
                <FieldRow
                  label="Result"
                  value={harnessResult.data.ok ? "ok" : "blocked"}
                />
                <FieldRow
                  label="Iterations"
                  value={String(harnessResult.data.iterations)}
                />
                <FieldRow
                  label="Blocked"
                  value={String(harnessResult.data.blockedActions.length)}
                />
              </div>
              <JsonBlock
                value={{
                  blockedActions: harnessResult.data.blockedActions,
                  report: harnessResult.data.report,
                }}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
