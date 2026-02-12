import { Geist } from "next/font/google";
import { headers } from "next/headers";

import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { resolveAuthWithLdapFallback } from "@/lib/auth";
import { checkLdapConnectionCached, ldapConfig } from "@/lib/ldap";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, ShieldX } from "lucide-react";

const geist = Geist({ subsets: ["latin"] });

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const auth = await resolveAuthWithLdapFallback(await headers());

  if (!auth.isAuthorized && !auth.user) {
    return (
      <html lang="es">
        <body className={geist.className}>
          <div className="flex min-h-screen items-center justify-center bg-background">
            <p className="text-foreground">Redirigiendo al login...</p>
          </div>
        </body>
      </html>
    );
  }

  if (auth.user && !auth.isAuthorized) {
    const user = auth.user
    const requiredGroup = "sp_admin"  

    return (
      <html lang="es">
        <body className={geist.className}>
          <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <Card className="w-full max-w-md border-destructive/20">
              <CardContent className="pt-8 pb-8">
                <div className="flex flex-col items-center text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 mb-6">
                    <ShieldX className="h-8 w-8 text-destructive" />
                  </div>

                  <h1 className="text-2xl font-semibold text-foreground mb-3">
                    Acceso denegado
                  </h1>

                  <p className="text-muted-foreground leading-relaxed mb-6">
                    Tu usuario{" "}
                    <span className="font-medium text-foreground">{user}</span>{" "}
                    no pertenece al grupo{" "}
                    <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-sm font-medium text-primary">
                      {requiredGroup}
                    </span>{" "}
                    requerido para administrar el LDAP.
                  </p>

                  <div className="w-full pt-2 border-t border-border">
                    <p className="text-sm text-muted-foreground mt-4 mb-4">
                      Contacta con tu administrador si necesitas acceso.
                    </p>

                    <Button
                      asChild
                      className="w-full bg-primary hover:bg-primary/90"
                    >
                      <a href="https://srv-enodl-des-03.larioja.org:444/" className="flex align-center justify-center">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Volver al Hub
                      </a>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </body>
      </html>
    );
  }

  const ldapConnected = await checkLdapConnectionCached();
  const ldapHost = (() => {
    try {
      return new URL(ldapConfig.url).hostname;
    } catch {
      return "ldap";
    }
  })();

  return (
    <html lang="es">
      <body className={`${geist.className} h-screen overflow-hidden`}>
        <div className="flex h-screen overflow-hidden bg-background text-foreground">
          <Sidebar
            user={auth.user}
            email={auth.email}
            ldapHost={ldapHost}
            ldapConnected={ldapConnected}
            isAuthorized={auth.isAuthorized}
          />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}
