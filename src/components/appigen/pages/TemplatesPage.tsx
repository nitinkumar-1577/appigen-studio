import { useState } from "react";
import { ShoppingBag, MessageSquare, User, BarChart3, Calendar, Music, Sparkles, ArrowRight } from "lucide-react";
import type { ViewKey } from "../Sidebar";

const CATEGORIES = ["All", "E-commerce", "AI", "Personal", "Productivity"];

const TEMPLATES = [
  { name: "SaaS Dashboard", cat: "Productivity", desc: "A polished workspace with KPI cards, usage charts, filters, and a responsive navigation system.", icon: BarChart3, hue: 200, prompt: "Build a production-ready SaaS analytics dashboard with a responsive collapsible sidebar, workspace switcher, date-range filters, revenue and user KPI cards with trends, an interactive time-series chart, a recent activity table with search and sorting, empty states, and a polished accessible dark interface." },
  { name: "E-commerce Store", cat: "E-commerce", desc: "A refined storefront with product discovery, cart interactions, and checkout states.", icon: ShoppingBag, hue: 30, prompt: "Build a premium responsive e-commerce storefront with an editorial hero, searchable product catalog, category and price filters, product detail view, interactive shopping cart with quantity controls, subtotal and checkout state, and thoughtful loading and empty states." },
  { name: "AI Chat Interface", cat: "AI", desc: "A focused AI workspace with conversation history and responsive chat states.", icon: MessageSquare, hue: 243, prompt: "Build a polished AI chat workspace with a collapsible conversation history, new-chat action, message bubbles, editable prompt composer, send and stop controls, simulated streaming response, code-block styling, empty state suggestions, and responsive accessible layout." },
  { name: "Portfolio", cat: "Personal", desc: "A distinctive personal site with selected work, case studies, and contact details.", icon: User, hue: 280, prompt: "Build a distinctive creative developer portfolio with a strong editorial hero, biography, selected project cards with case-study details, skills, responsive navigation, a working contact form with validation and success state, and refined mobile layouts." },
  { name: "Booking Calendar", cat: "Productivity", desc: "An appointment planner with an interactive calendar and available time slots.", icon: Calendar, hue: 140, prompt: "Build a responsive appointment booking app with a monthly calendar, selectable available time slots, booking details form with validation, confirmation state, upcoming appointments list, and clear empty and loading states." },
  { name: "Music Player", cat: "Personal", desc: "A modern listening space with playlists and functional playback controls.", icon: Music, hue: 320, prompt: "Build a polished music player interface with featured playlists, searchable track list, play and pause controls, previous and next track actions, seek and volume sliders, queue panel, and responsive artwork-led layout." },
];

export const TemplatesPage = ({ onNavigate, onUseTemplate }: { onNavigate: (v: ViewKey) => void; onUseTemplate?: (prompt: string) => void }) => {
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
                <t.icon className="h-10 w-10 text-foreground/90" strokeWidth={1.5} />
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
                  onClick={() => onUseTemplate ? onUseTemplate(t.prompt) : onNavigate("studio")}
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
