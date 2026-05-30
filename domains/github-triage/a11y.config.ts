interface AxeRuleSetting {
  enabled: boolean;
}

interface AccessibilityScanTarget {
  surfaceId: string;
  route: string;
  type: "composed" | "custom";
}

interface AccessibilityEvidenceConfig {
  engine: "axe-core";
  rules: Record<string, AxeRuleSetting>;
  surfaces: AccessibilityScanTarget[];
}

export const accessibilityEvidenceConfig: AccessibilityEvidenceConfig = {
  engine: "axe-core",
  rules: {
    "aria-allowed-attr": { enabled: true },
    "button-name": { enabled: true },
    "color-contrast": { enabled: true },
    "image-alt": { enabled: true },
    "label": { enabled: true },
  },
  surfaces: [
    {
      surfaceId: "triage-console",
      route: "/github/triage",
      type: "composed",
    },
  ],
};

export default accessibilityEvidenceConfig;
