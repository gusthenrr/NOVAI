import type { ReactNode } from "react";
import PanelShell from "../components/PanelShell";
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <PanelShell>{children}</PanelShell>;
}
