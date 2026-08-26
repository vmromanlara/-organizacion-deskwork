import { DemoShell } from "@/components/demo/demo-shell";
import { DemoStateProvider } from "@/components/demo/demo-state";
import "./demo.css";

export default function DemoLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <DemoStateProvider><DemoShell>{children}</DemoShell></DemoStateProvider>;
}
