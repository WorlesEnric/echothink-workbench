import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { CompiledManifest, CapabilityMap } from "@echothink/domain-manifest";
import {
  canonicalJSONStringify,
  sha256OfString,
  type ApprovalRole,
  type PromotionState,
  type SemVer,
  type Sha256,
  type SurfaceType,
} from "@echothink/shared-types";
import type { ChangeKind } from "./promotion.js";
import {
  ReleaseManifestSchema,
  type ReleaseApproval,
  type ReleaseManifest,
} from "./release-manifest.js";

export interface RegistrySurface {
  id: string;
  type: SurfaceType;
  route: string;
}

export interface RegistryRecord {
  domainId: string;
  name: string;
  owner: string;
  status: PromotionState;
  versions: SemVer[];
  activeVersion?: SemVer;
  surfaces: RegistrySurface[];
  capabilities: string[];
  approvals: Record<string, boolean>;
  sdkContractVersion: string;
  runtimeCompatibility: string;
  release?: ReleaseManifest;
  releases?: Record<string, ReleaseManifest>;
  pendingChangeKind?: ChangeKind;
}

export interface BuildRegistryRecordOptions {
  owner: string;
  status: PromotionState;
  runtimeCompatibility?: string;
}

export interface RegistryCompatibility {
  sdkContractVersion: string;
  runtimeCompatibility: string;
}

export interface RegistryStore {
  load(): Promise<RegistryRecord[]>;
  save(records: RegistryRecord[]): Promise<void>;
}

export class RegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistryError";
  }
}

export class AppDomainRegistry {
  private readonly records = new Map<string, RegistryRecord>();

  constructor(records: RegistryRecord[] = []) {
    for (const record of records) {
      this.records.set(record.domainId, cloneRegistryRecord(record));
    }
  }

  register(record: RegistryRecord): RegistryRecord {
    const next = cloneRegistryRecord(record);
    this.records.set(next.domainId, next);
    return cloneRegistryRecord(next);
  }

  get(domainId: string): RegistryRecord | undefined {
    const record = this.records.get(domainId);
    return record ? cloneRegistryRecord(record) : undefined;
  }

  list(): RegistryRecord[] {
    return [...this.records.values()].map((record) => cloneRegistryRecord(record));
  }

  addVersion(domainId: string, version: SemVer): RegistryRecord {
    return this.update(domainId, (record) => ({
      ...record,
      versions: record.versions.includes(version)
        ? [...record.versions]
        : [...record.versions, version],
    }));
  }

  setActiveVersion(domainId: string, version: SemVer): RegistryRecord {
    return this.update(domainId, (record) => {
      if (!record.versions.includes(version)) {
        throw new RegistryError(
          `Cannot activate unknown version ${version} for ${domainId}`,
        );
      }
      return {
        ...record,
        activeVersion: version,
      };
    });
  }

  setStatus(domainId: string, state: PromotionState): RegistryRecord {
    return this.update(domainId, (record) => ({
      ...record,
      status: state,
    }));
  }

  recordApproval(domainId: string, approval: ReleaseApproval): RegistryRecord {
    return this.update(domainId, (record) => ({
      ...record,
      approvals: {
        ...record.approvals,
        [approvalRecordKey(approval.role)]: true,
      },
    }));
  }

  verifySurfaceHash(
    domainId: string,
    surfaceId: string,
    contents: string,
    expected: Sha256,
  ): boolean {
    const record = this.records.get(domainId);
    if (!record?.surfaces.some((surface) => surface.id === surfaceId)) {
      return false;
    }
    return sha256OfString(contents) === expected;
  }

  compatibility(domainId: string): RegistryCompatibility {
    const record = this.required(domainId);
    return {
      sdkContractVersion: record.sdkContractVersion,
      runtimeCompatibility: record.runtimeCompatibility,
    };
  }

  private update(
    domainId: string,
    updater: (record: RegistryRecord) => RegistryRecord,
  ): RegistryRecord {
    const current = this.required(domainId);
    const next = normalizeRegistryRecord(updater(cloneRegistryRecord(current)));
    this.records.set(domainId, next);
    return cloneRegistryRecord(next);
  }

  private required(domainId: string): RegistryRecord {
    const record = this.records.get(domainId);
    if (!record) {
      throw new RegistryError(`Unknown App Domain ${domainId}`);
    }
    return record;
  }
}

export class InMemoryRegistryStore implements RegistryStore {
  private records: RegistryRecord[];

  constructor(records: RegistryRecord[] = []) {
    this.records = records.map((record) => cloneRegistryRecord(record));
  }

  async load(): Promise<RegistryRecord[]> {
    return this.records.map((record) => cloneRegistryRecord(record));
  }

  async save(records: RegistryRecord[]): Promise<void> {
    this.records = records.map((record) => cloneRegistryRecord(record));
  }
}

export function createInMemoryRegistryStore(
  records: RegistryRecord[] = [],
): RegistryStore {
  return new InMemoryRegistryStore(records);
}

export function createJsonRegistryStore(path: string): RegistryStore {
  return {
    async load(): Promise<RegistryRecord[]> {
      try {
        const text = await readFile(path, "utf8");
        const parsed: unknown = JSON.parse(text);
        if (!Array.isArray(parsed)) {
          throw new RegistryError(`Registry store ${path} must contain an array`);
        }
        return parsed.map((record) => parseRegistryRecord(record));
      } catch (error) {
        if (isNodeError(error) && error.code === "ENOENT") {
          return [];
        }
        throw error;
      }
    },
    async save(records: RegistryRecord[]): Promise<void> {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, canonicalJSONStringify(records), "utf8");
    },
  };
}

export function buildRegistryRecordFromCompiled(
  compiled: CompiledManifest,
  options: BuildRegistryRecordOptions,
): RegistryRecord {
  const version = compiled.manifest.metadata.version;
  return {
    domainId: compiled.manifest.metadata.id,
    name: compiled.manifest.metadata.name,
    owner: options.owner,
    status: options.status,
    versions: [version],
    activeVersion: version,
    surfaces: compiled.surfaceRegistrations.map((surface) => ({
      id: surface.id,
      type: surface.type,
      route: surface.route,
    })),
    capabilities: flattenCapabilities(compiled.capabilityMap),
    approvals: {},
    sdkContractVersion: compiled.manifest.metadata.sdkContractVersion,
    runtimeCompatibility: options.runtimeCompatibility ?? "*",
  };
}

export function cloneRegistryRecord(record: RegistryRecord): RegistryRecord {
  return {
    ...record,
    versions: [...record.versions],
    surfaces: record.surfaces.map((surface) => ({ ...surface })),
    capabilities: [...record.capabilities],
    approvals: { ...record.approvals },
    ...(record.release ? { release: cloneReleaseManifest(record.release) } : {}),
    ...(record.releases
      ? {
          releases: Object.fromEntries(
            Object.entries(record.releases).map(([version, release]) => [
              version,
              cloneReleaseManifest(release),
            ]),
          ),
        }
      : {}),
  };
}

function normalizeRegistryRecord(record: RegistryRecord): RegistryRecord {
  return cloneRegistryRecord(record);
}

function flattenCapabilities(capabilityMap: CapabilityMap): string[] {
  return [
    ...capabilityMap.entities,
    ...capabilityMap.queries,
    ...capabilityMap.processes,
    ...capabilityMap.events,
    ...capabilityMap.effects,
  ];
}

function cloneReleaseManifest(release: ReleaseManifest): ReleaseManifest {
  return {
    ...release,
    surfaceDigests: { ...release.surfaceDigests },
    ...(release.effects ? { effects: { ...release.effects } } : {}),
    approvals: release.approvals.map((approval) => ({ ...approval })),
    ...(release.rollback
      ? {
          rollback: {
            ...release.rollback,
          },
        }
      : {}),
  };
}

function parseRegistryRecord(input: unknown): RegistryRecord {
  if (!isRecord(input)) {
    throw new RegistryError("Registry record must be an object");
  }

  const domainId = requireString(input, "domainId");
  const name = requireString(input, "name");
  const owner = requireString(input, "owner");
  const status = parsePromotionState(input.status);
  const versions = requireStringArray(input, "versions");
  const surfaces = parseSurfaces(input.surfaces);
  const capabilities = requireStringArray(input, "capabilities");
  const approvals = parseApprovals(input.approvals);
  const sdkContractVersion = requireString(input, "sdkContractVersion");
  const runtimeCompatibility = requireString(input, "runtimeCompatibility");
  const activeVersion =
    typeof input.activeVersion === "string" ? input.activeVersion : undefined;
  const release =
    input.release === undefined
      ? undefined
      : ReleaseManifestSchema.parse(input.release);
  const releases =
    input.releases === undefined ? undefined : parseReleases(input.releases);
  const pendingChangeKind =
    input.pendingChangeKind === undefined
      ? undefined
      : parseChangeKind(input.pendingChangeKind);

  return normalizeRegistryRecord({
    domainId,
    name,
    owner,
    status,
    versions,
    ...(activeVersion ? { activeVersion } : {}),
    surfaces,
    capabilities,
    approvals,
    sdkContractVersion,
    runtimeCompatibility,
    ...(release ? { release } : {}),
    ...(releases ? { releases } : {}),
    ...(pendingChangeKind ? { pendingChangeKind } : {}),
  });
}

function parseSurfaces(input: unknown): RegistrySurface[] {
  if (!Array.isArray(input)) {
    throw new RegistryError("Registry record surfaces must be an array");
  }
  return input.map((surface) => {
    if (!isRecord(surface)) {
      throw new RegistryError("Registry surface must be an object");
    }
    return {
      id: requireString(surface, "id"),
      type: parseSurfaceType(surface.type),
      route: requireString(surface, "route"),
    };
  });
}

function parseApprovals(input: unknown): Record<string, boolean> {
  if (!isRecord(input)) {
    throw new RegistryError("Registry approvals must be an object");
  }
  const approvals: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value !== "boolean") {
      throw new RegistryError(`Registry approval ${key} must be a boolean`);
    }
    approvals[key] = value;
  }
  return approvals;
}

function parseReleases(input: unknown): Record<string, ReleaseManifest> {
  if (!isRecord(input)) {
    throw new RegistryError("Registry releases must be an object");
  }
  return Object.fromEntries(
    Object.entries(input).map(([version, release]) => [
      version,
      ReleaseManifestSchema.parse(release),
    ]),
  );
}

function requireString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new RegistryError(`Registry field ${key} must be a non-empty string`);
  }
  return value;
}

function requireStringArray(
  input: Record<string, unknown>,
  key: string,
): string[] {
  const value = input[key];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new RegistryError(`Registry field ${key} must be a string array`);
  }
  return [...value];
}

function parsePromotionState(input: unknown): PromotionState {
  if (
    input === "draft" ||
    input === "validated-draft" ||
    input === "release-candidate" ||
    input === "approved" ||
    input === "canary" ||
    input === "production" ||
    input === "deprecated" ||
    input === "rolled-back"
  ) {
    return input;
  }
  throw new RegistryError("Registry status must be a known promotion state");
}

function parseSurfaceType(input: unknown): SurfaceType {
  if (input === "standard" || input === "composed" || input === "custom") {
    return input;
  }
  throw new RegistryError("Registry surface type must be known");
}

function parseChangeKind(input: unknown): ChangeKind {
  if (
    input === "standard-copy" ||
    input === "entity-schema" ||
    input === "permission" ||
    input === "process-mutation" ||
    input === "state-transition" ||
    input === "new-effect" ||
    input === "new-dependency" ||
    input === "composed-release" ||
    input === "custom-release" ||
    input === "production-promotion" ||
    input === "emergency-rollback"
  ) {
    return input;
  }
  throw new RegistryError("Registry pendingChangeKind must be known");
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

export function approvalRecordKey(role: ApprovalRole): string {
  return role;
}
