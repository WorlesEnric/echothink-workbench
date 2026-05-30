import { createRoute } from "@tanstack/react-router";
import { z } from "zod";
import { rootRoute } from "./root";
import WorkbenchDomainPage from "../pages/workbench/domain";

export const workbenchDomainRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/workbench/domain",
  component: WorkbenchDomainPage,
  validateSearch: z.object({
    domainId: z.string().optional(),
  }),
});
