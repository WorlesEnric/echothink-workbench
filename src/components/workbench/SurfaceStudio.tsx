import { useMemo, useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGenerateArtifacts } from "@/hooks/useEchothink";
import { cn } from "@/lib/utils";
import { showError, showSuccess } from "@/lib/toast";
import { EmptyState, FieldRow, RiskBadge } from "./WorkbenchPrimitives";
import type { ManifestSummary, SurfaceType } from "./workbenchUtils";
import {
  GATE_IDS,
  SURFACE_GATE_MATRIX,
  SURFACE_MODE_DETAILS,
  SURFACE_TYPES,
} from "./workbenchUtils";

export default function SurfaceStudio({
  domainId,
  manifest,
}: {
  domainId: string;
  manifest: ManifestSummary;
}) {
  const [activeMode, setActiveMode] = useState<SurfaceType>("standard");
  const generateArtifacts = useGenerateArtifacts(domainId);
  const surfacesByMode = useMemo(
    () =>
      Object.fromEntries(
        SURFACE_TYPES.map((type) => [
          type,
          manifest.surfaces.filter((surface) => surface.type === type),
        ]),
      ) as Record<SurfaceType, ManifestSummary["surfaces"]>,
    [manifest.surfaces],
  );
  const mode = SURFACE_MODE_DETAILS[activeMode];
  const activeSurfaces = surfacesByMode[activeMode];

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
            Surface Studio
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Standard to Composed to Custom lanes for the same App Domain.
          </p>
        </div>
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
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        {SURFACE_TYPES.map((type, index) => {
          const details = SURFACE_MODE_DETAILS[type];
          const isActive = activeMode === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => setActiveMode(type)}
              className={cn(
                "rounded-md border p-4 text-left transition-colors",
                isActive
                  ? "border-primary bg-primary/8"
                  : "bg-card hover:bg-muted/40",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium text-muted-foreground">
                  Mode {index + 1}
                </div>
                <RiskBadge label={details.riskLabel} tone={details.riskTone} />
              </div>
              <div className="mt-3 text-base font-semibold">{details.lane}</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {details.label}
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                {surfacesByMode[type].length} surface
                {surfacesByMode[type].length === 1 ? "" : "s"}
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Card className="rounded-md">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-base">{mode.lane} surfaces</CardTitle>
              <RiskBadge label={mode.riskLabel} tone={mode.riskTone} />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{mode.summary}</p>
            {activeSurfaces.length === 0 ? (
              <EmptyState title={`No ${mode.lane} surfaces`}>
                Add surfaces to the manifest, then generate artifacts.
              </EmptyState>
            ) : (
              <div className="space-y-3">
                {activeSurfaces.map((surface) => (
                  <div key={surface.id} className="rounded-md border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{surface.id}</div>
                        <div className="mt-1 font-mono text-xs text-muted-foreground">
                          {surface.route || "No route"}
                        </div>
                      </div>
                      <Badge variant="secondary">{surface.type}</Badge>
                    </div>
                    <div className="mt-4 grid gap-2">
                      <FieldRow
                        label="Page/template"
                        value={surface.page ?? "n/a"}
                      />
                      <FieldRow label="Query" value={surface.query ?? "n/a"} />
                      <FieldRow label="Entry" value={surface.entry ?? "n/a"} />
                      <FieldRow
                        label="Isolation"
                        value={surface.isolation ?? "default"}
                      />
                      <FieldRow
                        label="Permissions"
                        value={
                          surface.requiredPermissions.length ? (
                            <div className="flex flex-wrap gap-1">
                              {surface.requiredPermissions.map((permission) => (
                                <Badge key={permission} variant="outline">
                                  {permission}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            "None declared"
                          )
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card className="rounded-md">
            <CardHeader>
              <CardTitle className="text-base">
                Validation Requirements
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="space-y-2 text-sm text-muted-foreground">
                {mode.validationSummary.map((item) => (
                  <li key={item} className="rounded-md bg-muted/40 px-3 py-2">
                    {item}
                  </li>
                ))}
              </ul>
              <div className="max-h-80 overflow-auto rounded-md border">
                {GATE_IDS.map((gate) => {
                  const applicability = SURFACE_GATE_MATRIX[activeMode][gate];
                  return (
                    <div
                      key={gate}
                      className="grid grid-cols-[1fr_auto] items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0"
                    >
                      <span>{gate.replaceAll("-", " ")}</span>
                      <Badge
                        variant="outline"
                        className={cn(
                          applicability === "required" &&
                            "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                          applicability === "conditional" &&
                            "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
                          applicability === "skip" && "text-muted-foreground",
                        )}
                      >
                        {applicability}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-md">
            <CardHeader>
              <CardTitle className="text-base">Promotion Requirement</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {mode.promotionRequirement}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
