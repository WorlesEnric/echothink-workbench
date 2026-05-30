import { FormEvent, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Loader2, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCreateDomain, useDomains } from "@/hooks/useEchothink";
import { showError, showSuccess } from "@/lib/toast";
import { formatDateTime } from "@/components/workbench/workbenchUtils";
import {
  EmptyState,
  FieldRow,
  StatusBadge,
} from "@/components/workbench/WorkbenchPrimitives";

const EMPTY_FORM = {
  id: "",
  name: "",
  owner: "",
  brief: "",
};

export default function WorkbenchPage() {
  const navigate = useNavigate();
  const domainsQuery = useDomains();
  const createDomain = useCreateDomain();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);

  const domains = domainsQuery.data ?? [];
  const filteredDomains = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return domains;
    }
    return domains.filter((domain) =>
      [domain.id, domain.name, domain.owner ?? "", domain.brief ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [domains, search]);

  const openDomain = (domainId: string) => {
    navigate({
      to: "/workbench/domain",
      search: { domainId },
    });
  };

  const handleCreateDomain = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const id = form.id.trim();
    const name = form.name.trim();

    if (!id || !name) {
      showError("Domain id and name are required.");
      return;
    }

    try {
      const domain = await createDomain.mutateAsync({
        id,
        name,
        ...(form.owner.trim() ? { owner: form.owner.trim() } : {}),
        ...(form.brief.trim() ? { brief: form.brief.trim() } : {}),
      });
      showSuccess(`Created App Domain ${domain.name}.`);
      setForm(EMPTY_FORM);
      setIsDialogOpen(false);
      openDomain(domain.id);
    } catch (error) {
      showError(error);
    }
  };

  return (
    <div className="h-full w-full overflow-auto px-8 py-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-normal">
              Workbench
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Governed App-Domain creation, validation, preview, and promotion.
            </p>
          </div>
          <Button onClick={() => setIsDialogOpen(true)}>
            <Plus className="size-4" />
            New App Domain
          </Button>
        </header>

        <div className="relative max-w-xl">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search domains..."
            className="pl-9"
          />
        </div>

        {domainsQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading domains
          </div>
        ) : domainsQuery.error ? (
          <EmptyState title="Could not load App Domains">
            {domainsQuery.error.message}
          </EmptyState>
        ) : filteredDomains.length === 0 ? (
          <EmptyState
            title={domains.length === 0 ? "No App Domains yet" : "No matches"}
          >
            Use the new domain flow to capture a brief and seed a governed
            manifest.
          </EmptyState>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {filteredDomains.map((domain) => (
              <Card key={domain.id} className="overflow-hidden rounded-md">
                <CardHeader className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="truncate text-lg">
                        {domain.name}
                      </CardTitle>
                      <div className="mt-1 font-mono text-xs text-muted-foreground">
                        {domain.id}
                      </div>
                    </div>
                    <StatusBadge status={domain.status} />
                  </div>
                  {domain.brief ? (
                    <p className="line-clamp-3 text-sm text-muted-foreground">
                      {domain.brief}
                    </p>
                  ) : null}
                </CardHeader>
                <CardContent className="space-y-3">
                  <FieldRow
                    label="Owner"
                    value={domain.owner ?? "Unassigned"}
                  />
                  <FieldRow
                    label="Active version"
                    value={domain.activeVersion ?? "None"}
                  />
                  <FieldRow
                    label="Updated"
                    value={formatDateTime(domain.updatedAt)}
                  />
                  <FieldRow
                    label="Workspace"
                    value={
                      <span className="font-mono text-xs">
                        {domain.workspacePath}
                      </span>
                    }
                  />
                  <div className="pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openDomain(domain.id)}
                    >
                      Open
                      <ArrowRight className="size-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <form onSubmit={handleCreateDomain} className="space-y-4">
            <DialogHeader>
              <DialogTitle>New App Domain</DialogTitle>
              <DialogDescription>
                Capture the domain brief and seed the manifest workspace.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="domain-id">Domain id</Label>
                <Input
                  id="domain-id"
                  value={form.id}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      id: event.target.value,
                    }))
                  }
                  placeholder="github-triage"
                  pattern="[a-z][a-z0-9-]*"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="domain-name">Name</Label>
                <Input
                  id="domain-name"
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="GitHub Triage"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="domain-owner">Owner</Label>
              <Input
                id="domain-owner"
                value={form.owner}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    owner: event.target.value,
                  }))
                }
                placeholder="domain-owner"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="domain-brief">Domain brief</Label>
              <Textarea
                id="domain-brief"
                value={form.brief}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    brief: event.target.value,
                  }))
                }
                placeholder="Goals, users, entities, workflows, approval paths..."
                className="min-h-32"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createDomain.isPending}>
                {createDomain.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
