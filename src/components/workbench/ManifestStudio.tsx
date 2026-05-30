import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import { FileDown, Loader2, Save, Wrench } from "lucide-react";
import type {
  CompileManifestResult,
  DomainDetail,
  SaveManifestResult,
} from "@/ipc/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useCompileManifest,
  useGenerateArtifacts,
  useSaveManifest,
} from "@/hooks/useEchothink";
import { showError, showSuccess } from "@/lib/toast";
import { useTheme } from "@/contexts/ThemeContext";
import { DiagnosticList, EmptyState, FieldRow } from "./WorkbenchPrimitives";

export default function ManifestStudio({
  domainId,
  domain,
}: {
  domainId: string;
  domain: DomainDetail;
}) {
  const { isDarkMode } = useTheme();
  const [yaml, setYaml] = useState(domain.manifestYaml ?? "");
  const [saveResult, setSaveResult] = useState<SaveManifestResult | null>(null);
  const [compileResult, setCompileResult] =
    useState<CompileManifestResult | null>(null);
  const saveManifest = useSaveManifest(domainId);
  const compileManifest = useCompileManifest(domainId);
  const generateArtifacts = useGenerateArtifacts(domainId);

  useEffect(() => {
    setYaml(domain.manifestYaml ?? "");
    setSaveResult(null);
    setCompileResult(null);
  }, [domain.id, domain.manifestYaml]);

  const handleSave = async () => {
    try {
      const result = await saveManifest.mutateAsync(yaml);
      setSaveResult(result);
      showSuccess(
        result.ok ? "Manifest saved." : "Manifest saved with errors.",
      );
    } catch (error) {
      showError(error);
    }
  };

  const handleCompile = async () => {
    try {
      const result = await compileManifest.mutateAsync();
      setCompileResult(result);
      showSuccess(
        result.diagnostics.some((diagnostic) => diagnostic.severity === "error")
          ? "Compile completed with diagnostics."
          : "Manifest compiled.",
      );
    } catch (error) {
      showError(error);
    }
  };

  const handleGenerateArtifacts = async () => {
    try {
      const result = await generateArtifacts.mutateAsync();
      showSuccess(`Generated ${result.files.length} artifact files.`);
    } catch (error) {
      showError(error);
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-normal">
            Manifest Studio
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Structured YAML editor for the App-Domain kernel contract.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={handleSave}
            disabled={saveManifest.isPending}
          >
            {saveManifest.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Save
          </Button>
          <Button
            variant="outline"
            onClick={handleCompile}
            disabled={compileManifest.isPending}
          >
            {compileManifest.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Wrench className="size-4" />
            )}
            Compile
          </Button>
          <Button
            onClick={handleGenerateArtifacts}
            disabled={generateArtifacts.isPending}
          >
            {generateArtifacts.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FileDown className="size-4" />
            )}
            Generate Artifacts
          </Button>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="overflow-hidden rounded-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">domain.manifest.yaml</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="h-[calc(100vh-18rem)] min-h-[34rem] border-t">
              <Editor
                language="yaml"
                value={yaml}
                theme={isDarkMode ? "vs-dark" : "light"}
                onChange={(value) => setYaml(value ?? "")}
                options={{
                  minimap: { enabled: false },
                  fontSize: 12,
                  lineNumbersMinChars: 3,
                  scrollBeyondLastLine: false,
                  wordWrap: "on",
                }}
              />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card className="rounded-md">
            <CardHeader>
              <CardTitle className="text-base">Save Diagnostics</CardTitle>
            </CardHeader>
            <CardContent>
              {saveResult ? (
                <DiagnosticList diagnostics={saveResult.diagnostics} />
              ) : (
                <EmptyState title="No save run yet">
                  Save the manifest to see schema and semantic diagnostics.
                </EmptyState>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-md">
            <CardHeader>
              <CardTitle className="text-base">Compile Output</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {compileResult ? (
                <>
                  <FieldRow
                    label="Manifest digest"
                    value={
                      <span className="font-mono text-xs">
                        {compileResult.manifestDigest || "n/a"}
                      </span>
                    }
                  />
                  <FieldRow
                    label="Permission rows"
                    value={String(compileResult.permissionMatrixRows.length)}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(compileResult.capabilityCounts).map(
                      ([name, count]) => (
                        <div
                          key={name}
                          className="rounded-md border bg-muted/30 px-3 py-2"
                        >
                          <div className="text-xs capitalize text-muted-foreground">
                            {name}
                          </div>
                          <div className="text-lg font-semibold">{count}</div>
                        </div>
                      ),
                    )}
                  </div>
                  <DiagnosticList diagnostics={compileResult.diagnostics} />
                </>
              ) : (
                <EmptyState title="No compile run yet">
                  Compile to generate the kernel digest, capability counts, and
                  permission matrix.
                </EmptyState>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-md">
            <CardHeader>
              <CardTitle className="text-base">Generated Artifacts</CardTitle>
            </CardHeader>
            <CardContent>
              {generateArtifacts.data?.files.length ? (
                <ul className="max-h-64 space-y-1 overflow-auto font-mono text-xs">
                  {generateArtifacts.data.files.map((file) => (
                    <li key={file} className="rounded bg-muted/40 px-2 py-1">
                      {file}
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No artifact run yet">
                  Generated file paths will also appear in Diff and Patch
                  Review.
                </EmptyState>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
