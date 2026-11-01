import type { ReactNode } from "react";
import PanelShell from "../components/PanelShell";
export default function ManagerLayout({ children }: { children: ReactNode }) {
  return <PanelShell>{children}</PanelShell>;
}
