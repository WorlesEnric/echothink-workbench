import { writeFileSync } from "node:fs";
import type { ValidationReport } from "./types.js";

export function writeReport(report: ValidationReport, outPath: string): void {
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

export function summarize(report: ValidationReport): string {
  const failed = report.gates.filter((gate) =>
    gate.findings.some((finding) => finding.severity === "error"),
  );
  const skipped = report.gates.filter((gate) => gate.status === "skip");
  const warningCount = report.gates.reduce(
    (sum, gate) =>
      sum + gate.findings.filter((finding) => finding.severity === "warning").length,
    0,
  );
  const lines = [
    `${report.overall.toUpperCase()}: ${report.domainId}@${report.version} (${report.gates.length} gates, ${failed.length} failed, ${skipped.length} skipped, ${warningCount} warnings)`,
  ];
  for (const gate of failed) {
    const errors = gate.findings.filter((finding) => finding.severity === "error");
    lines.push(`- ${gate.gate}: ${errors.length} error${errors.length === 1 ? "" : "s"}`);
    for (const finding of errors.slice(0, 3)) {
      const location = finding.file
        ? ` (${finding.file}${finding.line ? `:${finding.line}` : ""})`
        : "";
      lines.push(`  ${finding.code}: ${finding.message}${location}`);
    }
    if (errors.length > 3) {
      lines.push(`  ... ${errors.length - 3} more`);
    }
  }
  return lines.join("\n");
}
