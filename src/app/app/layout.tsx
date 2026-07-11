import BottomNav from "@/components/BottomNav";
import { LarikProvider } from "@/lib/store";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <LarikProvider>
      {children}
      <BottomNav />
    </LarikProvider>
  );
}
