export { approvalQueueTemplate } from "./approval-queue.js";
export { auditLogTemplate } from "./audit-log.js";
export { entityDetailTemplate } from "./entity-detail.js";
export { entityFormTemplate } from "./entity-form.js";
export { entityTableTemplate } from "./entity-table.js";
export {
  importsForTemplate,
  isStandardTemplateId,
  primaryTemplateComponents,
  standardTemplateIds,
  type StandardTemplateId,
} from "./imports.js";
export { settingsTemplate } from "./settings.js";

import { approvalQueueTemplate } from "./approval-queue.js";
import { auditLogTemplate } from "./audit-log.js";
import { entityDetailTemplate } from "./entity-detail.js";
import { entityFormTemplate } from "./entity-form.js";
import { entityTableTemplate } from "./entity-table.js";
import { settingsTemplate } from "./settings.js";

export const surfaceTemplates = [
  entityTableTemplate,
  entityDetailTemplate,
  entityFormTemplate,
  auditLogTemplate,
  approvalQueueTemplate,
  settingsTemplate,
];
