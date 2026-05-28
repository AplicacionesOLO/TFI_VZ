import type { RouteObject } from "react-router-dom";
import NotFound from "../pages/NotFound";
import Home from "../pages/home/page";
import ComparisonV2Page from "../pages/comparison-v2/page";
import RankingPage from "../pages/ranking/page";
import PendingPage from "../pages/pending/page";

const routes: RouteObject[] = [
  {
    path: "/",
    element: <Home />,
  },
  {
    path: "/comparison-v2",
    element: <ComparisonV2Page />,
  },
  {
    path: "/ranking",
    element: <RankingPage />,
  },
  {
    path: "/pending",
    element: <PendingPage />,
  },
  {
    path: "*",
    element: <NotFound />,
  },
];

export default routes;