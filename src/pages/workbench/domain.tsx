import { useMemo, useState } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import {
  BadgeCheck,
  Boxes,
  Code2,
  FileCode2,
  GitCompare,
  Loader2,
  PackageSearch,
  PlayCircle,
  Rocket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useDomain } from "@/hooks/useEchothink";
import { cn } from "@/lib/utils";
import ManifestStudio from "@/components/workbench/ManifestStudio";
import SurfaceStudio from "@/components/workbench/SurfaceStudio";
import RegistryBrowser from "@/components/workbench/RegistryBrowser";
import PreviewRuntime from "@/components/workbench/PreviewRuntime";
import ValidationDashboard from "@/components/workbench/ValidationDashboard";
import DiffPatchReview from "@/components/workbench/DiffPatchReview";
import PromotionWizard from "@/components/workbench/PromotionWizard";
import {
  EmptyState,
  FieldRow,
  StatusBadge,
} from "@/components/workbench/WorkbenchPrimitives";
import {
  extractManifestSummary,
  formatDateTime,
} from "@/components/workbench/workbenchUtils";

type WorkbenchScreen =
  | "manifest"
  | "surfaces"
  | "registry"
  | "preview"
  | "validation"
  | "diff"
  | "promotion";

const SCREENS = [
  { id: "manifest", label: "Manifest Studio", icon: FileCode2 },
  { id: "surfaces", label: "Surface Studio", icon: Boxes },
  { id: "registry", label: "Registry Browser", icon: PackageSearch },
  { id: "preview", label: "Preview Runtime", icon: PlayCircle },
  { id: "validation", label: "Validation", icon: BadgeCheck },
  { id: "diff", label: "Diff and Patch", icon: GitCompare },
  { id: "promotion", label: "Promotion", icon: Rocket },
] as const satisfies readonly {
  id: WorkbenchScreen;
  label: string;
  icon: typeof Code2;
}[];

export default function WorkbenchDomainPage() {
  const { domainId } = useSearch({ from: "/workbench/domain" });
  const domainQuery = useDomain(domainId);
  const [screen, setScreen] = useState<WorkbenchScreen>("manifest");

  const manifestSummary = useMemo(
    () => extractManifestSummary(domainQuery.data?.manifestYaml),
    [domainQuery.data?.manifestYaml],
  );

  if (!domainId) {
    return (
      <div className="h-full w-full overflow-auto px-8 py-6">
        <EmptyState title="No App Domain selected">
          <Button as={Link} to="/workbench" variant="outline" className="mt-4">
            Open Workbench
          </Button>
        </EmptyState>
      </div>
    );
  }

  if (domainQuery.isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading domain
      </div>
    );
  }

  if (domainQuery.error || !domainQuery.data) {
    return (
      <div className="h-full w-full overflow-auto px-8 py-6">
        <EmptyState title="Could not load App Domain">
          {domainQuery.error?.message ?? "Unknown domain load error."}
        </EmptyState>
      </div>
    );
  }

  const domain = domainQuery.data;

  return (
    <div className="flex h-full w-full overflow-hidden">
      <aside className="flex w-72 shrink-0 flex-col border-r bg-muted/20">
        <div className="space-y-4 p-4">
          <Button as={Link} to="/workbench" variant="ghost" size="sm">
            Back to domains
          </Button>
          <div>
            <div className="flex items-center justify-between gap-3">
              <h1 className="min-w-0 truncate text-xl font-semibold">
                {domain.name}
              </h1>
              <StatusBadge status={domain.status} />
            </div>
            <div className="mt-1 font-mono text-xs text-muted-foreground">
              {domain.id}
            </div>
          </div>
          <div className="space-y-2">
            <FieldRow label="Owner" value={domain.owner ?? "Unassigned"} />
            <FieldRow
              label="Version"
              value={domain.activeVersion ?? "No active release"}
            />
            <FieldRow
              label="Updated"
              value={formatDateTime(domain.updatedAt)}
            />
            <FieldRow
              label="Surfaces"
              value={String(manifestSummary.surfaces.length)}
            />
          </div>
        </div>
        <Separator />
        <nav className="flex-1 space-y-1 overflow-auto p-2">
          {SCREENS.map((item) => {
            const Icon = item.icon;
            const isActive = screen === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setScreen(item.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                  isActive
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="min-w-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-7xl px-6 py-6">
          {screen === "manifest" && (
            <ManifestStudio domainId={domainId} domain={domain} />
          )}
          {screen === "surfaces" && (
            <SurfaceStudio domainId={domainId} manifest={manifestSummary} />
          )}
          {screen === "registry" && <RegistryBrowser />}
          {screen === "preview" && (
            <PreviewRuntime domainId={domainId} manifest={manifestSummary} />
          )}
          {screen === "validation" && (
            <ValidationDashboard domainId={domainId} />
          )}
          {screen === "diff" && <DiffPatchReview domainId={domainId} />}
          {screen === "promotion" && <PromotionWizard domainId={domainId} />}
        </div>
      </main>
    </div>
  );
}
