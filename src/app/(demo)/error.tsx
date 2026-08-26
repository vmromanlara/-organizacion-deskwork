"use client";

import { DemoErrorState } from "@/components/demo/demo-error-state";

export default function DemoError({ reset }: { reset: () => void }) {
  return <DemoErrorState reset={reset} />;
}
