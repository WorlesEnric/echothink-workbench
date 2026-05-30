import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ipc } from "@/ipc/types";
import type {
  ApprovalRole,
  DomainDetail,
  DomainSummary,
  GateId,
  HarnessRunResult,
  PromotionEvidence,
  PromotionState,
  RegistryComponent,
  RegistryRecord,
  ReleaseManifest,
  SaveManifestResult,
  CompileManifestResult,
  SdkResponse,
  SurfaceRegistration,
  UiRegistryList,
  ValidationReport,
} from "@/ipc/types";
import { queryKeys } from "@/lib/queryKeys";

export interface CreateDomainInput {
  id: string;
  name: string;
  owner?: string;
  brief?: string;
}

export interface GeneratedArtifactsResult {
  files: string[];
}

export interface UiRegistryFilters {
  text?: string;
  kind?: RegistryComponent["kind"];
  surfaceType?: SurfaceRegistration["type"];
}

export interface PromoteInput {
  to: PromotionState;
  evidence?: PromotionEvidence;
}

export interface RecordApprovalInput {
  version: string;
  role: ApprovalRole;
  user: string;
}

export interface PreviewRunProcessInput {
  processId: string;
  input: unknown;
}

export interface PreviewExplainPermissionInput {
  capability: string;
  target: string;
}

export interface HarnessRunInput {
  prompt: string;
  surfaceId?: string;
  maxIterations?: number;
}

type PreviewFailureKind = "permission" | "effect" | "runtime" | null;

function requireDomainId(domainId: string | null | undefined): string {
  if (!domainId) {
    throw new Error("A domainId is required for this workbench action.");
  }
  return domainId;
}

export function useDomains() {
  return useQuery<DomainSummary[]>({
    queryKey: queryKeys.echothink.domains,
    queryFn: () => ipc.echothink.listDomains(),
    meta: { showErrorToast: true },
  });
}

export function useDomain(domainId: string | null | undefined) {
  const normalizedDomainId = domainId ?? null;
  return useQuery<DomainDetail>({
    queryKey: queryKeys.echothink.domain({ domainId: normalizedDomainId }),
    queryFn: () =>
      ipc.echothink.getDomain({
        domainId: requireDomainId(normalizedDomainId),
      }),
    enabled: Boolean(normalizedDomainId),
    meta: { showErrorToast: true },
  });
}

export function useCreateDomain() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDomainInput) => ipc.echothink.createDomain(input),
    onSuccess: (domain) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.echothink.domains });
      queryClient.setQueryData(
        queryKeys.echothink.domain({ domainId: domain.id }),
        domain,
      );
    },
    meta: { showErrorToast: true },
  });
}

export function useSaveManifest(domainId: string | null | undefined) {
  const queryClient = useQueryClient();
  const normalizedDomainId = domainId ?? null;
  return useMutation<SaveManifestResult, Error, string>({
    mutationFn: (yaml) =>
      ipc.echothink.saveManifest({
        domainId: requireDomainId(normalizedDomainId),
        yaml,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.echothink.domain({
          domainId: normalizedDomainId,
        }),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.echothink.domains });
      queryClient.removeQueries({
        queryKey: queryKeys.echothink.previewStart({
          domainId: normalizedDomainId,
        }),
      });
    },
    meta: { showErrorToast: true },
  });
}

export function useCompileManifest(domainId: string | null | undefined) {
  const normalizedDomainId = domainId ?? null;
  return useMutation<CompileManifestResult, Error, void>({
    mutationFn: () =>
      ipc.echothink.compileManifest({
        domainId: requireDomainId(normalizedDomainId),
      }),
    meta: { showErrorToast: true },
  });
}

export function useGeneratedArtifacts(domainId: string | null | undefined) {
  const normalizedDomainId = domainId ?? null;
  return useQuery<GeneratedArtifactsResult>({
    queryKey: queryKeys.echothink.generatedArtifacts({
      domainId: normalizedDomainId,
    }),
    queryFn: async () => ({ files: [] }),
    enabled: false,
    initialData: { files: [] },
    staleTime: Infinity,
  });
}

export function useGenerateArtifacts(domainId: string | null | undefined) {
  const queryClient = useQueryClient();
  const normalizedDomainId = domainId ?? null;
  return useMutation<GeneratedArtifactsResult, Error, void>({
    mutationFn: () =>
      ipc.echothink.generateArtifacts({
        domainId: requireDomainId(normalizedDomainId),
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(
        queryKeys.echothink.generatedArtifacts({
          domainId: normalizedDomainId,
        }),
        result,
      );
      queryClient.invalidateQueries({
        queryKey: queryKeys.echothink.domain({
          domainId: normalizedDomainId,
        }),
      });
    },
    meta: { showErrorToast: true },
  });
}

export function useValidationReport(domainId: string | null | undefined) {
  const normalizedDomainId = domainId ?? null;
  return useQuery<ValidationReport | null>({
    queryKey: queryKeys.echothink.validation({
      domainId: normalizedDomainId,
    }),
    queryFn: async () => null,
    enabled: false,
    initialData: null,
    staleTime: Infinity,
  });
}

export function useRunValidation(domainId: string | null | undefined) {
  const queryClient = useQueryClient();
  const normalizedDomainId = domainId ?? null;
  return useMutation<ValidationReport, Error, GateId[] | undefined>({
    mutationFn: (gates) =>
      ipc.echothink.runValidation({
        domainId: requireDomainId(normalizedDomainId),
        gates,
      }),
    onSuccess: (report) => {
      queryClient.setQueryData(
        queryKeys.echothink.validation({
          domainId: normalizedDomainId,
        }),
        report,
      );
      queryClient.invalidateQueries({
        queryKey: queryKeys.echothink.domain({
          domainId: normalizedDomainId,
        }),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.echothink.domains });
    },
    meta: { showErrorToast: true },
  });
}

export function usePreviewStart(domainId: string | null | undefined) {
  const normalizedDomainId = domainId ?? null;
  return useQuery({
    queryKey: queryKeys.echothink.previewStart({
      domainId: normalizedDomainId,
    }),
    queryFn: () =>
      ipc.echothink.previewStart({
        domainId: requireDomainId(normalizedDomainId),
      }),
    enabled: Boolean(normalizedDomainId),
    meta: { showErrorToast: true },
  });
}

export function usePreviewSetPersona(domainId: string | null | undefined) {
  const queryClient = useQueryClient();
  const normalizedDomainId = domainId ?? null;
  return useMutation<{ ok: true }, Error, string>({
    mutationFn: (personaId) =>
      ipc.echothink.previewSetPersona({
        domainId: requireDomainId(normalizedDomainId),
        personaId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.echothink.previewInspect({
          domainId: normalizedDomainId,
        }),
      });
    },
    meta: { showErrorToast: true },
  });
}

export function usePreviewRunProcess(domainId: string | null | undefined) {
  const queryClient = useQueryClient();
  const normalizedDomainId = domainId ?? null;
  return useMutation<SdkResponse, Error, PreviewRunProcessInput>({
    mutationFn: ({ processId, input }) =>
      ipc.echothink.previewRunProcess({
        domainId: requireDomainId(normalizedDomainId),
        processId,
        input,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.echothink.previewInspect({
          domainId: normalizedDomainId,
        }),
      });
    },
    meta: { showErrorToast: true },
  });
}

export function usePreviewExplainPermission(
  domainId: string | null | undefined,
) {
  const normalizedDomainId = domainId ?? null;
  return useMutation<
    { allowed: boolean; reason: string },
    Error,
    PreviewExplainPermissionInput
  >({
    mutationFn: ({ capability, target }) =>
      ipc.echothink.previewExplainPermission({
        domainId: requireDomainId(normalizedDomainId),
        capability,
        target,
      }),
    meta: { showErrorToast: true },
  });
}

export function usePreviewInspect(
  domainId: string | null | undefined,
  enabled: boolean,
) {
  const normalizedDomainId = domainId ?? null;
  return useQuery({
    queryKey: queryKeys.echothink.previewInspect({
      domainId: normalizedDomainId,
    }),
    queryFn: () =>
      ipc.echothink.previewInspect({
        domainId: requireDomainId(normalizedDomainId),
      }),
    enabled: Boolean(normalizedDomainId) && enabled,
    meta: { showErrorToast: true },
  });
}

export function usePreviewForceFailure(domainId: string | null | undefined) {
  const queryClient = useQueryClient();
  const normalizedDomainId = domainId ?? null;
  return useMutation<{ ok: true }, Error, PreviewFailureKind>({
    mutationFn: (kind) =>
      ipc.echothink.previewForceFailure({
        domainId: requireDomainId(normalizedDomainId),
        kind,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.echothink.previewInspect({
          domainId: normalizedDomainId,
        }),
      });
    },
    meta: { showErrorToast: true },
  });
}

export function useUiRegistryList() {
  return useQuery<UiRegistryList>({
    queryKey: queryKeys.echothink.uiRegistryList,
    queryFn: () => ipc.echothink.uiRegistryList(),
    staleTime: 5 * 60 * 1000,
    meta: { showErrorToast: true },
  });
}

export function useUiRegistrySearch(filters: UiRegistryFilters) {
  const text = filters.text?.trim() ?? "";
  const kind = filters.kind ?? "";
  const surfaceType = filters.surfaceType ?? "";
  return useQuery<RegistryComponent[]>({
    queryKey: queryKeys.echothink.uiRegistrySearch({
      text,
      kind,
      surfaceType,
    }),
    queryFn: () =>
      ipc.echothink.uiRegistrySearch({
        ...(text ? { text } : {}),
        ...(filters.kind ? { kind: filters.kind } : {}),
        ...(filters.surfaceType ? { surfaceType: filters.surfaceType } : {}),
      }),
    staleTime: 60 * 1000,
    meta: { showErrorToast: true },
  });
}

export function useRegistryList() {
  return useQuery<RegistryRecord[]>({
    queryKey: queryKeys.echothink.registryList,
    queryFn: () => ipc.echothink.registryList(),
    meta: { showErrorToast: true },
  });
}

export function useRegistryRecord(domainId: string | null | undefined) {
  const normalizedDomainId = domainId ?? null;
  return useQuery<RegistryRecord | null>({
    queryKey: queryKeys.echothink.registry({
      domainId: normalizedDomainId,
    }),
    queryFn: () =>
      ipc.echothink.registryGet({
        domainId: requireDomainId(normalizedDomainId),
      }),
    enabled: Boolean(normalizedDomainId),
    meta: { showErrorToast: true },
  });
}

export function useReleaseManifest(domainId: string | null | undefined) {
  const normalizedDomainId = domainId ?? null;
  return useQuery<ReleaseManifest | null>({
    queryKey: queryKeys.echothink.release({
      domainId: normalizedDomainId,
    }),
    queryFn: async () => null,
    enabled: false,
    initialData: null,
    staleTime: Infinity,
  });
}

export function useBuildRelease(domainId: string | null | undefined) {
  const queryClient = useQueryClient();
  const normalizedDomainId = domainId ?? null;
  return useMutation<ReleaseManifest, Error, void>({
    mutationFn: () =>
      ipc.echothink.buildRelease({
        domainId: requireDomainId(normalizedDomainId),
      }),
    onSuccess: (release) => {
      queryClient.setQueryData(
        queryKeys.echothink.release({
          domainId: normalizedDomainId,
        }),
        release,
      );
      queryClient.invalidateQueries({
        queryKey: queryKeys.echothink.registry({
          domainId: normalizedDomainId,
        }),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.echothink.domains });
    },
    meta: { showErrorToast: true },
  });
}

export function usePromote(domainId: string | null | undefined) {
  const queryClient = useQueryClient();
  const normalizedDomainId = domainId ?? null;
  return useMutation<RegistryRecord, Error, PromoteInput>({
    mutationFn: ({ to, evidence }) =>
      ipc.echothink.promote({
        domainId: requireDomainId(normalizedDomainId),
        to,
        evidence,
      }),
    onSuccess: (record) => {
      queryClient.setQueryData(
        queryKeys.echothink.registry({
          domainId: normalizedDomainId,
        }),
        record,
      );
      queryClient.invalidateQueries({
        queryKey: queryKeys.echothink.domain({
          domainId: normalizedDomainId,
        }),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.echothink.domains });
    },
    meta: { showErrorToast: true },
  });
}

export function useRecordApproval(domainId: string | null | undefined) {
  const queryClient = useQueryClient();
  const normalizedDomainId = domainId ?? null;
  return useMutation<{ ok: true }, Error, RecordApprovalInput>({
    mutationFn: ({ version, role, user }) =>
      ipc.echothink.recordApproval({
        domainId: requireDomainId(normalizedDomainId),
        version,
        role,
        user,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.echothink.registry({
          domainId: normalizedDomainId,
        }),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.echothink.domains });
    },
    meta: { showErrorToast: true },
  });
}

export function useHarnessResult(domainId: string | null | undefined) {
  const normalizedDomainId = domainId ?? null;
  return useQuery<HarnessRunResult | null>({
    queryKey: queryKeys.echothink.harness({
      domainId: normalizedDomainId,
    }),
    queryFn: async () => null,
    enabled: false,
    initialData: null,
    staleTime: Infinity,
  });
}

export function useHarnessRun(domainId: string | null | undefined) {
  const queryClient = useQueryClient();
  const normalizedDomainId = domainId ?? null;
  return useMutation<HarnessRunResult, Error, HarnessRunInput>({
    mutationFn: ({ prompt, surfaceId, maxIterations }) =>
      ipc.echothink.harnessRun({
        domainId: requireDomainId(normalizedDomainId),
        prompt,
        ...(surfaceId ? { surfaceId } : {}),
        ...(maxIterations ? { maxIterations } : {}),
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(
        queryKeys.echothink.harness({
          domainId: normalizedDomainId,
        }),
        result,
      );
      queryClient.invalidateQueries({
        queryKey: queryKeys.echothink.validation({
          domainId: normalizedDomainId,
        }),
      });
    },
    meta: { showErrorToast: true },
  });
}
