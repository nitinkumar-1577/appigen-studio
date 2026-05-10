import { X } from "lucide-react";
import { PricingPage } from "./pages/PricingPage";

export const PricingModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="glass-strong relative h-[88vh] w-[1100px] max-w-[95vw] overflow-hidden rounded-2xl shadow-elevated">
        <button onClick={onClose} className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-lg bg-background/60 text-muted-foreground hover:bg-secondary hover:text-foreground"><X className="h-4 w-4" /></button>
        <div className="h-full overflow-auto"><PricingPage /></div>
      </div>
    </div>
  );
};
