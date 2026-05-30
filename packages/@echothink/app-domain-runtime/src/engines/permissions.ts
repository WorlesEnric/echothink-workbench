import type { PermissionMatrixRow } from "@echothink/domain-manifest";

export interface PermissionDecision {
  allowed: boolean;
  reason: string;
}

export interface PermissionEngine {
  can(
    roles: readonly string[],
    capability: string,
    target: string,
  ): PermissionDecision;
  explain(
    roles: readonly string[],
    capability: string,
    target: string,
  ): PermissionDecision & {
    matchedRows: PermissionMatrixRow[];
    checkedRoles: string[];
  };
}

export class ManifestPermissionEngine implements PermissionEngine {
  private readonly rows: PermissionMatrixRow[];

  constructor(permissionMatrix: readonly PermissionMatrixRow[]) {
    this.rows = [...permissionMatrix];
  }

  can(
    roles: readonly string[],
    capability: string,
    target: string,
  ): PermissionDecision {
    const { allowed, reason } = this.explain(roles, capability, target);
    return { allowed, reason };
  }

  explain(
    roles: readonly string[],
    capability: string,
    target: string,
  ): PermissionDecision & {
    matchedRows: PermissionMatrixRow[];
    checkedRoles: string[];
  } {
    const checkedRoles = uniqueStrings(roles);
    if (checkedRoles.length === 0) {
      return {
        allowed: false,
        reason: "Denied because the actor has no roles.",
        matchedRows: [],
        checkedRoles,
      };
    }

    const matchedRows = this.rows.filter((row) =>
      this.matches(row, capability, target),
    );
    if (matchedRows.length === 0) {
      return {
        allowed: false,
        reason: `Denied because ${capability}:${target} is not declared in the permission matrix.`,
        matchedRows,
        checkedRoles,
      };
    }

    const grantingRows = matchedRows.filter(
      (row) => checkedRoles.includes(row.role) && row.allowed,
    );
    const grantingRow = grantingRows[0];
    if (grantingRow) {
      const permissionLabel = grantingRow.permission
        ? ` through permission ${grantingRow.permission}`
        : "";
      return {
        allowed: true,
        reason: `Allowed because role ${grantingRow.role} grants ${grantingRow.capability}:${grantingRow.target}${permissionLabel}.`,
        matchedRows,
        checkedRoles,
      };
    }

    const deniedRoles = matchedRows
      .filter((row) => checkedRoles.includes(row.role))
      .map((row) => row.role);
    const roleLabel =
      deniedRoles.length > 0 ? deniedRoles.join(", ") : checkedRoles.join(", ");
    return {
      allowed: false,
      reason: `Denied because none of the actor roles (${roleLabel}) grant ${capability}:${target}.`,
      matchedRows,
      checkedRoles,
    };
  }

  private matches(
    row: PermissionMatrixRow,
    capability: string,
    target: string,
  ): boolean {
    if (capability === "permission") {
      return row.permission === target;
    }
    return row.capability === capability && row.target === target;
  }
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}
