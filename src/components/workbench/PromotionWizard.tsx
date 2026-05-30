import { useEffect, useMemo, useState } from "react";
import { Loader2, Rocket, Stamp } from "lucide-react";
import type {
  ApprovalRole,
  ChangeKind,
  PromotionState,
  ReleaseManifest,
} from "@/ipc/types";
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
import {
  useBuildRelease,
  usePromote,
  useRecordApproval,
  useRegistryRecord,
  useReleaseManifest,
} from "@/hooks/useEchothink";
import { cn } from "@/lib/utils";
import { showError, showSuccess } from "@/lib/toast";
import {
  EmptyState,
  FieldRow,
  JsonBlock,
  StatusBadge,
} from "./WorkbenchPrimitives";
import {
  CHANGE_KIND_LABELS,
  CHANGE_KINDS,
  PROMOTION_STATES,
  PROMOTION_TRANSITIONS,
  REQUIRED_APPROVALS,
} from "./workbenchUtils";

export default function PromotionWizard({ domainId }: { domainId: string }) {
  const registryRecord = useRegistryRecord(domainId);
  const cachedRelease = useReleaseManifest(domainId);
  const buildRelease = useBuildRelease(domainId);
  const recordApproval = useRecordApproval(domainId);
  const promote = usePromote(domainId);
  const [release, setRelease] = useState<ReleaseManifest | null>(null);
  const [changeKind, setChangeKind] = useState<ChangeKind>("standard-copy");
  const [approver, setApprover] = useState("");
  const [promotionError, setPromotionError] = useState<string | null>(null);

  useEffect(() => {
    if (cachedRelease.data && !release) {
      setRelease(cachedRelease.data);
    }
  }, [cachedRelease.data, release]);

  const currentStatus = registryRecord.data?.status ?? "draft";
  const nextStates = PROMOTION_TRANSITIONS[currentStatus];
  const requiredRoles = REQUIRED_APPROVALS[changeKind];
  const approvedRoles = useMemo(
    () => new Set((release?.approvals ?? []).map((approval) => approval.role)),
    [release?.approvals],
  );

  const handleBuildRelease = async () => {
    try {
      const result = await buildRelease.mutateAsync();
      setRelease(result);
      setPromotionError(null);
      showSuccess("Release manifest built.");
    } catch (error) {
      showError(error);
    }
  };

  const handleRecordApproval = async (role: ApprovalRole) => {
    if (!release) {
      showError("Build a release manifest before recording approvals.");
      return;
    }
    if (!approver.trim()) {
      showError("Approver user is required.");
      return;
    }
    try {
      await recordApproval.mutateAsync({
        version: release.version,
        role,
        user: approver.trim(),
      });
      const approval = {
        role,
        user: approver.trim(),
        timestamp: new Date().toISOString(),
      };
      setRelease((current) =>
        current
          ? {
              ...current,
              approvals: [
                ...current.approvals.filter((entry) => entry.role !== role),
                approval,
              ],
            }
          : current,
      );
      showSuccess(`Recorded ${role} approval.`);
    } catch (error) {
      showError(error);
    }
  };

  const handlePromote = async (to: PromotionState) => {
    setPromotionError(null);
    const evidenceChangeKind =
      to === "production"
        ? "production-promotion"
        : to === "rolled-back"
          ? "emergency-rollback"
          : changeKind;
    try {
      await promote.mutateAsync({
        to,
        evidence: {
          changeKind: evidenceChangeKind,
          ...(release ? { release } : {}),
        },
      });
      showSuccess(`Promoted to ${to}.`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Promotion failed.";
      setPromotionError(message);
      showError(error);
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-normal">
            Promotion Wizard
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Build release evidence, collect approvals, and move through the
            governed lifecycle.
          </p>
        </div>
        <Button onClick={handleBuildRelease} disabled={buildRelease.isPending}>
          {buildRelease.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Rocket className="size-4" />
          )}
          Build Release
        </Button>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-5">
          <Card className="rounded-md">
            <CardHeader>
              <CardTitle className="text-base">Lifecycle</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {PROMOTION_STATES.map((state) => (
                  <div
                    key={state}
                    className={cn(
                      "rounded-md border px-3 py-2 text-sm",
                      currentStatus === state
                        ? "border-primary bg-primary/8 text-primary"
                        : "bg-muted/30 text-muted-foreground",
                    )}
                  >
                    {state.replaceAll("-", " ")}
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {nextStates.length ? (
                  nextStates.map((state) => (
                    <Button
                      key={state}
                      variant="outline"
                      onClick={() => handlePromote(state)}
                      disabled={promote.isPending}
                    >
                      {promote.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Stamp className="size-4" />
                      )}
                      Promote to {state.replaceAll("-", " ")}
                    </Button>
                  ))
                ) : (
                  <div className="text-sm text-muted-foreground">
                    No legal outgoing transitions.
                  </div>
                )}
              </div>
              {promotionError ? (
                <Alert variant="destructive">
                  <AlertTitle>Promotion blocked</AlertTitle>
                  <AlertDescription>{promotionError}</AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>

          <Card className="rounded-md">
            <CardHeader>
              <CardTitle className="text-base">Release Manifest</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {release ? (
                <>
                  <div className="grid gap-3 md:grid-cols-2">
                    <FieldRow label="Domain" value={release.domainId} />
                    <FieldRow label="Version" value={release.version} />
                    <FieldRow
                      label="Manifest digest"
                      value={
                        <span className="font-mono text-xs">
                          {release.manifestDigest}
                        </span>
                      }
                    />
                    <FieldRow label="SDK" value={release.sdkContractVersion} />
                    <FieldRow
                      label="Runtime"
                      value={release.runtimeCompatibility}
                    />
                    <FieldRow
                      label="Effects"
                      value={String(Object.keys(release.effects ?? {}).length)}
                    />
                  </div>
                  <JsonBlock value={release} className="max-h-[30rem]" />
                </>
              ) : (
                <EmptyState title="No release manifest built">
                  Build Release to compute digests, versions, effects, rollback,
                  and validation evidence.
                </EmptyState>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="rounded-md">
            <CardHeader>
              <CardTitle className="text-base">Registry</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {registryRecord.data ? (
                <>
                  <FieldRow
                    label="Status"
                    value={<StatusBadge status={registryRecord.data.status} />}
                  />
                  <FieldRow
                    label="Active"
                    value={registryRecord.data.activeVersion ?? "n/a"}
                  />
                  <FieldRow
                    label="Versions"
                    value={String(registryRecord.data.versions.length)}
                  />
                  <FieldRow
                    label="Capabilities"
                    value={String(registryRecord.data.capabilities.length)}
                  />
                </>
              ) : registryRecord.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading registry
                </div>
              ) : (
                <EmptyState title="No registry record" />
              )}
            </CardContent>
          </Card>

          <Card className="rounded-md">
            <CardHeader>
              <CardTitle className="text-base">Approvals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Change kind</Label>
                <Select
                  value={changeKind}
                  onValueChange={(value) => {
                    if (isChangeKind(value)) {
                      setChangeKind(value);
                    }
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHANGE_KINDS.map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {CHANGE_KIND_LABELS[kind]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="approver-user">Approver user</Label>
                <Input
                  id="approver-user"
                  value={approver}
                  onChange={(event) => setApprover(event.target.value)}
                  placeholder="u_123 or email"
                />
              </div>
              <div className="space-y-2">
                {requiredRoles.map((role) => {
                  const approved = approvedRoles.has(role);
                  return (
                    <div
                      key={role}
                      className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                    >
                      <div>
                        <div className="text-sm font-medium">{role}</div>
                        <div className="text-xs text-muted-foreground">
                          {approved ? "Recorded" : "Required"}
                        </div>
                      </div>
                      {approved ? (
                        <Badge
                          variant="outline"
                          className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        >
                          approved
                        </Badge>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRecordApproval(role)}
                          disabled={recordApproval.isPending || !release}
                        >
                          Record
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function isChangeKind(value: string | null): value is ChangeKind {
  return CHANGE_KINDS.includes(value as ChangeKind);
}
