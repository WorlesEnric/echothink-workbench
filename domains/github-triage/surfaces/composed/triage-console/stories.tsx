import { createAppDomainClient, type Transport } from "@echothink/app-domain-sdk";
import { AppDomainProvider } from "@echothink/app-domain-sdk/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TriageConsoleSurface } from "./index";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

const previewTransport: Transport = {
  async call(req) {
    if (req.capability === "entity.query") {
      return { ok: true, data: [] };
    }
    if (req.capability === "permissions.can") {
      return { ok: true, data: true };
    }
    return { ok: true, data: undefined };
  },
};

const previewClient = createAppDomainClient({
  transport: previewTransport,
  descriptor: { id: "github-triage", manifestVersion: "0.4.0" },
  surfaceId: "triage-console",
  identity: { actorId: "preview", tenantId: "org_456", roles: ["reviewer"] },
});

export const Default = () => (
  <QueryClientProvider client={queryClient}>
    <AppDomainProvider client={previewClient}>
      <TriageConsoleSurface />
    </AppDomainProvider>
  </QueryClientProvider>
);

export default {
  title: "App Domains/github-triage/triage-console",
};
