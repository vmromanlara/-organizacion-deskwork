import type { Metadata } from "next";
import { I18nProvider } from "@/i18n";

export const metadata: Metadata = {
  title: "DeskWork",
  description: "Foundation for the DeskWork internal support platform.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // El lang inicial es "es" (default preservado); el provider re-hidrata
  // desde localStorage en cliente y mantiene el lang del <html>
  // sincronizado via un script inline.
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Sincroniza el lang del <html> con el locale persistido antes
            de que React hidrate. Mantiene la accesibilidad y el SEO. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var l=localStorage.getItem('deskwork.locale');if(l==='es'||l==='en'){document.documentElement.lang=l;}}catch(e){}})();",
          }}
        />
      </head>
      <body>
        <I18nProvider initialLocale="es">{children}</I18nProvider>
      </body>
    </html>
  );
}
