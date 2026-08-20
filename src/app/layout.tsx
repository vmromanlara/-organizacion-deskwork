import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DeskWork",
  description: "Foundation for the DeskWork internal support platform.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
