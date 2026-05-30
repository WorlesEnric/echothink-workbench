import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./root";
import WorkbenchPage from "../pages/workbench";

export const workbenchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/workbench",
  component: WorkbenchPage,
});
