import { SWRProvider } from "@/components/swr-config";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SWRProvider>{children}</SWRProvider>;
}
