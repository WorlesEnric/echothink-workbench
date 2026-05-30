import { describe, expect, it } from "vitest";

import { components } from "./catalog.js";
import { uiRegistry } from "./registry.js";

describe("component catalog", () => {
  it("has unique ids", () => {
    const ids = components.map((component) => component.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("contains the standard factory components with their real packages", () => {
    expect(uiRegistry.find("DataTable")?.package).toBe("@echothink-ui/data");
    expect(uiRegistry.find("TaskApprovalPanel")?.package).toBe(
      "@echothink-ui/task",
    );
    expect(uiRegistry.find("AuditLogTable")?.package).toBe("@echothink-ui/data");
    expect(uiRegistry.find("SchemaForm")?.package).toBe("@echothink-ui/forms");
    expect(uiRegistry.find("AppPageLayout")?.package).toBe(
      "@echothink-ui/layouts",
    );
    expect(uiRegistry.find("PageHeader")?.package).toBe(
      "@echothink-ui/layouts",
    );
  });

  it("searches by text and finds exact ids", () => {
    expect(uiRegistry.find("DataTable")?.import).toBe("DataTable");
    expect(uiRegistry.search("table").map((item) => item.id)).toContain("DataTable");
  });
});
