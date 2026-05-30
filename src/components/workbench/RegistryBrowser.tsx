import { useMemo, useState } from "react";
import { Loader2, PackageSearch } from "lucide-react";
import type {
  RegistryComponent,
  RegistryRecipe,
  SurfaceTemplate,
} from "@/ipc/types";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUiRegistryList, useUiRegistrySearch } from "@/hooks/useEchothink";
import type { SurfaceType } from "./workbenchUtils";
import { EmptyState, FieldRow } from "./WorkbenchPrimitives";

type KindFilter = "all" | RegistryComponent["kind"];
type SurfaceFilter = "all" | SurfaceType;

type RegistryItem =
  | { source: "component"; component: RegistryComponent }
  | { source: "template"; template: SurfaceTemplate }
  | { source: "recipe"; recipe: RegistryRecipe };

const KIND_FILTERS = [
  "all",
  "primitive",
  "block",
  "page-template",
  "recipe",
] as const satisfies readonly KindFilter[];

const SURFACE_FILTERS = [
  "all",
  "standard",
  "composed",
  "custom",
] as const satisfies readonly SurfaceFilter[];

export default function RegistryBrowser() {
  const [text, setText] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [surfaceType, setSurfaceType] = useState<SurfaceFilter>("all");
  const listQuery = useUiRegistryList();
  const searchQuery = useUiRegistrySearch({
    text,
    ...(kind !== "all" && kind !== "recipe" ? { kind } : {}),
    ...(surfaceType !== "all" ? { surfaceType } : {}),
  });

  const items = useMemo<RegistryItem[]>(() => {
    const query = text.trim().toLowerCase();
    const list = listQuery.data;
    const components =
      kind === "recipe" ? [] : (searchQuery.data ?? list?.components ?? []);
    const componentItems = components.map((component) => ({
      source: "component" as const,
      component,
    }));

    const templateItems =
      kind === "all" || kind === "page-template"
        ? (list?.pageTemplates ?? [])
            .filter((template) =>
              surfaceType === "all" || surfaceType === "standard"
                ? matchesText(
                    query,
                    template.id,
                    template.component,
                    JSON.stringify(template.requires),
                  )
                : false,
            )
            .map((template) => ({
              source: "template" as const,
              template,
            }))
        : [];

    const recipeItems =
      kind === "all" || kind === "recipe"
        ? (list?.recipes ?? [])
            .filter((recipe) => {
              if (surfaceType !== "all" && recipe.surfaceType !== surfaceType) {
                return false;
              }
              return matchesText(
                query,
                recipe.id,
                recipe.title,
                recipe.description,
                recipe.components.join(" "),
                recipe.sdkHooks.join(" "),
              );
            })
            .map((recipe) => ({ source: "recipe" as const, recipe }))
        : [];

    return [...componentItems, ...templateItems, ...recipeItems];
  }, [kind, listQuery.data, searchQuery.data, surfaceType, text]);

  const isLoading = listQuery.isLoading || searchQuery.isLoading;

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-2xl font-semibold tracking-normal">
          Echothink-UI Registry Browser
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Search approved primitives, blocks, page templates, recipes, imports,
          bindings, and actions.
        </p>
      </header>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_14rem_14rem]">
        <div className="relative">
          <PackageSearch className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Search registry..."
            className="pl-9"
          />
        </div>
        <Select
          value={kind}
          onValueChange={(value) => {
            if (isKindFilter(value)) {
              setKind(value);
            }
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KIND_FILTERS.map((option) => (
              <SelectItem key={option} value={option}>
                {option === "all" ? "All kinds" : option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={surfaceType}
          onValueChange={(value) => {
            if (isSurfaceFilter(value)) {
              setSurfaceType(value);
            }
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SURFACE_FILTERS.map((option) => (
              <SelectItem key={option} value={option}>
                {option === "all" ? "All surface types" : option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading registry
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="No registry entries matched" />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {items.map((item) => (
            <RegistryItemCard key={itemKey(item)} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function RegistryItemCard({ item }: { item: RegistryItem }) {
  if (item.source === "component") {
    const component = item.component;
    return (
      <Card className="rounded-md">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">{component.id}</CardTitle>
              <div className="mt-1 text-sm text-muted-foreground">
                {component.description}
              </div>
            </div>
            <Badge variant="secondary">{component.kind}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <FieldRow label="Package" value={component.package} />
          <FieldRow label="Import" value={component.import} />
          <FieldRow
            label="Surface types"
            value={<BadgeList values={component.surfaceTypes} />}
          />
          <FieldRow
            label="Data bindings"
            value={<BadgeList values={component.dataBindings ?? []} />}
          />
          <FieldRow
            label="Allowed actions"
            value={<BadgeList values={component.allowedActions ?? []} />}
          />
          <FieldRow
            label="Required props"
            value={<BadgeList values={component.requiredProps ?? []} />}
          />
          <FieldRow
            label="Examples"
            value={<BadgeList values={component.examples ?? []} />}
          />
        </CardContent>
      </Card>
    );
  }

  if (item.source === "template") {
    const template = item.template;
    return (
      <Card className="rounded-md">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle className="text-base">{template.id}</CardTitle>
            <Badge variant="secondary">page-template</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <FieldRow label="Component" value={template.component} />
          <FieldRow
            label="Requires query"
            value={template.requires.query ? "Yes" : "No"}
          />
          <FieldRow
            label="Processes"
            value={String(template.requires.processes ?? 0)}
          />
        </CardContent>
      </Card>
    );
  }

  const recipe = item.recipe;
  return (
    <Card className="rounded-md">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{recipe.title}</CardTitle>
            <div className="mt-1 text-sm text-muted-foreground">
              {recipe.description}
            </div>
          </div>
          <Badge variant="secondary">recipe</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <FieldRow label="Recipe id" value={recipe.id} />
        <FieldRow label="Surface type" value={recipe.surfaceType} />
        <FieldRow
          label="Components"
          value={<BadgeList values={recipe.components} />}
        />
        <FieldRow
          label="SDK hooks"
          value={<BadgeList values={recipe.sdkHooks} />}
        />
        <FieldRow label="Example" value={recipe.exampleRef ?? "n/a"} />
      </CardContent>
    </Card>
  );
}

function BadgeList({ values }: { values: readonly string[] }) {
  if (values.length === 0) {
    return <span className="text-muted-foreground">None</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {values.map((value) => (
        <Badge key={value} variant="outline">
          {value}
        </Badge>
      ))}
    </div>
  );
}

function itemKey(item: RegistryItem): string {
  if (item.source === "component") {
    return `component:${item.component.id}`;
  }
  if (item.source === "template") {
    return `template:${item.template.id}`;
  }
  return `recipe:${item.recipe.id}`;
}

function matchesText(query: string, ...values: string[]): boolean {
  if (!query) {
    return true;
  }
  return values.join(" ").toLowerCase().includes(query);
}

function isKindFilter(value: string | null): value is KindFilter {
  return KIND_FILTERS.includes(value as KindFilter);
}

function isSurfaceFilter(value: string | null): value is SurfaceFilter {
  return SURFACE_FILTERS.includes(value as SurfaceFilter);
}
