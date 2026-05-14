import { SWRProvider } from "@/components/swr-config";
import { ToastProvider } from "@/components/toast";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SWRProvider>
      <ToastProvider>{children}</ToastProvider>
    </SWRProvider>
  );
}
