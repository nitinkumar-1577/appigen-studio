import { useState } from "react";
import { ShoppingBag, MessageSquare, User, BarChart3, Calendar, Music, Sparkles, ArrowRight } from "lucide-react";

const CATEGORIES = ["All", "E-commerce", "AI", "Personal", "Productivity"];

const TEMPLATES = [
  { name: "E-commerce Storefront", cat: "E-commerce", desc: "Product grid, cart, and checkout flow.", icon: ShoppingBag, hue: 30 },
  { name: "Chatbot Assistant", cat: "AI", desc: "Streaming chat UI with message history.", icon: MessageSquare, hue: 243 },
  { name: "Portfolio", cat: "Personal", desc: "Minimal hero, projects grid, contact form.", icon: User, hue: 280 },
  { name: "Analytics Dashboard", cat: "Productivity", desc: "Charts, KPIs, and filterable tables.", icon: BarChart3, hue: 200 },
  { name: "Booking Calendar", cat: "Productivity", desc: "Event scheduling with time slots.", icon: Calendar, hue: 140 },
  { name: "Music Player", cat: "Personal", desc: "Playlist UI with playback controls.", icon: Music, hue: 320 },
];

export const TemplatesPage = ({ onNavigate }: { onNavigate: (v: any) => void }) => {
  const [cat, setCat] = useState("All");
  const list = TEMPLATES.filter((t) => cat === "All" || t.cat === cat);

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-6xl space-y-6 p-8">
        <header>
          <h1 className="font-display text-3xl font-bold tracking-tight">Templates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Start from a curated, production-ready blueprint.
          </p>
        </header>

        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-smooth ${
                cat === c
                  ? "border-primary/60 bg-primary/15 text-primary"
                  : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((t) => (
            <div
              key={t.name}
              className="glass group overflow-hidden rounded-xl shadow-soft transition-smooth hover:shadow-elevated"
            >
              <div
                className="relative flex h-28 items-center justify-center"
                style={{
                  background: `linear-gradient(135deg, hsl(${t.hue} 70% 28%), hsl(${t.hue + 30} 75% 16%))`,
                }}
              >
                <t.icon className="h-10 w-10 text-white/90" strokeWidth={1.5} />
              </div>
              <div className="p-4">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold">{t.name}</div>
                  <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
                    {t.cat}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{t.desc}</p>
                <button
                  onClick={() => onNavigate("studio")}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary transition-smooth hover:gap-2"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Use Template <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
