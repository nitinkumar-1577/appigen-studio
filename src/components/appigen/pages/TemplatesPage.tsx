import { useState } from "react";
import {
  BarChart3, ShoppingBag, MessageSquare, User, Calendar, Music, Sparkles,
  Utensils, Dumbbell, Plane, Wallet, GraduationCap, Home, CloudSun, Ticket,
  BookOpen, Rocket, Users, Package, Smartphone, Camera, ArrowRight,
} from "lucide-react";
import type { ViewKey } from "../Sidebar";

const CATEGORIES = ["All", "E-commerce", "AI", "Personal", "Productivity", "Business", "Lifestyle", "Education"] as const;
const photo = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1000&q=82`;

const TEMPLATES = [
  { name: "SaaS Analytics", cat: "Productivity", desc: "A premium workspace with KPI cards, usage charts, filters, and a responsive navigation system.", icon: BarChart3, hue: 205, image: photo("photo-1460925895917-afdab827c52f"), prompt: "Build a premium SaaS analytics dashboard with a responsive collapsible sidebar, workspace switcher, date filters, revenue and user KPI cards with trends, interactive time-series charts, searchable sortable activity table, empty states, and a polished accessible dark interface." },
  { name: "E-commerce Store", cat: "E-commerce", desc: "An editorial storefront with product discovery, cart interactions, and checkout states.", icon: ShoppingBag, hue: 30, image: photo("photo-1441986300917-64674bd600d8"), prompt: "Build a premium responsive e-commerce storefront with a striking editorial hero, image-led product catalog, category and price filters, product detail view, interactive cart with quantity controls, subtotal and checkout flow, and loading and empty states." },
  { name: "AI Chat Workspace", cat: "AI", desc: "A focused AI workspace with conversation history and a refined message composer.", icon: MessageSquare, hue: 250, image: photo("photo-1677442136019-21780ecad995"), prompt: "Build a polished AI chat workspace with collapsible conversation history, new chat, message bubbles, editable prompt composer, send and stop controls, streaming-style response, code block styling, suggested prompts, and responsive layout." },
  { name: "Creative Portfolio", cat: "Personal", desc: "A distinctive personal site with selected work, case studies, and contact details.", icon: User, hue: 285, image: photo("photo-1500648767791-00dcc994a43e"), prompt: "Build a distinctive creative portfolio with editorial hero, biography, selected project cards, case study detail views, skills, testimonials, contact form with validation, and responsive visual storytelling." },
  { name: "Project Planner", cat: "Productivity", desc: "A visual project board with milestones, owners, status, and progress tracking.", icon: Calendar, hue: 190, image: photo("photo-1611224923853-80b023f02d71"), prompt: "Build a polished project management workspace with Kanban columns, draggable task cards, owners, priority labels, due dates, filters, project progress, task detail modal, and responsive layout." },
  { name: "Restaurant Website", cat: "Business", desc: "A food-led restaurant experience with menu, reservations, and location details.", icon: Utensils, hue: 20, image: photo("photo-1517248135467-4c7edcad34c4"), prompt: "Build an elegant restaurant website with full-bleed food photography, story-led hero, menu categories, dish cards, reservation form with validation, opening hours, location section, and mobile navigation." },
  { name: "Fitness Tracker", cat: "Lifestyle", desc: "A motivating fitness dashboard with goals, activity, and weekly progress.", icon: Dumbbell, hue: 145, image: photo("photo-1534438327276-14e5300c3a48"), prompt: "Build a fitness tracking dashboard with daily activity rings, workout planner, exercise library, weekly charts, personal goals, progress history, and responsive mobile-first design." },
  { name: "Travel Explorer", cat: "Lifestyle", desc: "A visual travel discovery site with destinations, itineraries, and saved trips.", icon: Plane, hue: 205, image: photo("photo-1464822759023-fed622ff2c3b"), prompt: "Build an image-rich travel discovery website with destination search, featured destinations, filters, trip detail pages, itinerary builder, saved places, and responsive navigation." },
  { name: "Personal Finance", cat: "Productivity", desc: "A clear finance dashboard for budgets, spending categories, and savings goals.", icon: Wallet, hue: 150, image: photo("photo-1579621970563-ebec7560ff3e"), prompt: "Build a personal finance dashboard with account summary, budget categories, spending charts, transaction search and filters, savings goals, monthly insights, and accessible responsive layout." },
  { name: "Learning Platform", cat: "Education", desc: "A course discovery and learning experience with lessons and progress tracking.", icon: GraduationCap, hue: 220, image: photo("photo-1503676260728-1c00da094a0b"), prompt: "Build a modern online learning platform with course catalog, search and category filters, course detail pages, lesson player layout, progress tracking, bookmarks, and responsive design." },
  { name: "Music Library", cat: "Lifestyle", desc: "A music discovery interface with playlists, albums, and listening controls.", icon: Music, hue: 285, image: photo("photo-1511379938547-c1f69419868d"), prompt: "Build a polished music discovery app with featured albums, artist pages, searchable library, playlist creation, favorite tracks, playback controls with real UI state, and responsive layout." },
  { name: "Real Estate Listings", cat: "Business", desc: "An image-led property marketplace with filters, details, and saved homes.", icon: Home, hue: 35, image: photo("photo-1600596542815-ffad4c1539a9"), prompt: "Build a premium real estate marketplace with image-led property cards, location and price filters, property detail pages, saved listings, agent contact form, and responsive layout." },
  { name: "Weather Dashboard", cat: "Productivity", desc: "A clean weather experience with forecasts, conditions, and location search.", icon: CloudSun, hue: 200, image: photo("photo-1504608524841-42fe6f032b4b"), prompt: "Build a modern weather dashboard with location search, current conditions, hourly and weekly forecast cards, weather metric charts, saved locations, and responsive layout. Clearly label sample data if no live API is connected." },
  { name: "Event Discover", cat: "Lifestyle", desc: "A vibrant event directory with categories, schedules, and ticket details.", icon: Ticket, hue: 320, image: photo("photo-1492684223066-81342ee5ff30"), prompt: "Build an event discovery platform with featured events, category and date filters, search, event detail pages, schedule, venue information, and a working ticket selection UI with clear sample checkout state." },
  { name: "Editorial Blog", cat: "Personal", desc: "A magazine-style reading experience with featured stories and topic pages.", icon: BookOpen, hue: 25, image: photo("photo-1499750310107-5fef28a66643"), prompt: "Build a premium editorial blog with an immersive featured story, topic navigation, image-led article cards, article reading page, author profiles, search, bookmarks, and responsive typography." },
  { name: "Product Launch", cat: "Business", desc: "A conversion-focused launch page with product storytelling and pricing.", icon: Rocket, hue: 255, image: photo("photo-1500530855697-b586d89ba3ee"), prompt: "Build a high-converting product launch website with bold hero, benefit sections, product screenshots, feature grid, testimonials, pricing comparison, FAQ accordion, and functional signup CTA." },
  { name: "Community Hub", cat: "Personal", desc: "A welcoming community space with groups, posts, and member profiles.", icon: Users, hue: 175, image: photo("photo-1529156069898-49953e39b3ac"), prompt: "Build a community hub with member profiles, group directory, post feed, likes and comments using real local state, search, topic filters, and responsive layout." },
  { name: "Inventory Manager", cat: "Business", desc: "A practical inventory workspace with stock levels, search, and item details.", icon: Package, hue: 35, image: photo("photo-1586528116311-ad8dd3c8310d"), prompt: "Build an inventory management dashboard with stock summary, product table, search and filters, add/edit item forms, low-stock alerts, category management, and responsive layout." },
  { name: "Mobile App Landing", cat: "Business", desc: "A mobile-first product page with feature highlights and app previews.", icon: Smartphone, hue: 225, image: photo("photo-1512499617640-c74ae3a79d37"), prompt: "Build a premium mobile app landing page with device mockup, strong headline, feature storytelling, app screenshots, testimonials, FAQ, and clear app-store CTA buttons." },
  { name: "Photography Gallery", cat: "Personal", desc: "A minimal visual portfolio with collections, filters, and image details.", icon: Camera, hue: 285, image: photo("photo-1503602642458-232111445657"), prompt: "Build an elegant photography portfolio with a masonry image gallery, collection filters, lightbox viewer, photographer biography, contact form, and responsive layout." },
] as const;

function TemplateCover({ image, name, hue, icon: Icon }: { image: string; name: string; hue: number; icon: typeof Sparkles }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="relative aspect-[16/9] overflow-hidden bg-secondary" style={{ background: `linear-gradient(135deg, hsl(${hue} 68% 28%), hsl(${(hue + 55) % 360} 72% 14%))` }}>
      {!failed && <img src={image} alt={`${name} template preview`} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" onError={() => setFailed(true)} />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      <div className="absolute bottom-3 left-3 flex h-9 w-9 items-center justify-center rounded-xl border border-white/25 bg-black/30 text-white backdrop-blur"><Icon className="h-4.5 w-4.5" /></div>
      <span className="absolute right-3 top-3 rounded-full border border-white/25 bg-black/35 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur">Template preview</span>
    </div>
  );
}

export const TemplatesPage = ({ onNavigate, onUseTemplate }: { onNavigate: (view: ViewKey) => void; onUseTemplate?: (prompt: string) => void }) => {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("All");
  const filtered = category === "All" ? TEMPLATES : TEMPLATES.filter((template) => template.cat === category);

  const handleUseTemplate = (prompt: string) => {
    if (onUseTemplate) onUseTemplate(prompt);
    else onNavigate("studio");
  };

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-7xl space-y-6 p-6 md:p-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"><Sparkles className="h-3.5 w-3.5" /> 20 ready-to-build starting points</div>
            <h1 className="font-display text-3xl font-bold tracking-tight">Template Gallery</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Choose a polished starting point. AppiGen will adapt the layout, design, and interactions to your prompt.</p>
          </div>
          <button onClick={() => onNavigate("studio")} className="inline-flex items-center gap-2 rounded-xl border border-border bg-background/60 px-4 py-2.5 text-sm font-semibold transition-colors hover:border-primary/40 hover:bg-primary/5">Start from scratch <ArrowRight className="h-4 w-4" /></button>
        </header>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter templates by category">
          {CATEGORIES.map((item) => <button key={item} onClick={() => setCategory(item)} aria-pressed={category === item} className={`rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors ${category === item ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background/50 text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}>{item}</button>)}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((template) => {
            const Icon = template.icon;
            return <article key={template.name} className="group overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-elevated">
              <TemplateCover image={template.image} name={template.name} hue={template.hue} icon={Icon} />
              <div className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">{template.cat}</span><span className="text-[10px] text-muted-foreground">Responsive</span></div>
                <div><h2 className="text-base font-semibold tracking-tight">{template.name}</h2><p className="mt-1.5 min-h-10 text-xs leading-relaxed text-muted-foreground">{template.desc}</p></div>
                <button onClick={() => handleUseTemplate(template.prompt)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary px-3 py-2.5 text-xs font-semibold text-primary-foreground shadow-glow transition-all hover:brightness-110">Use template <ArrowRight className="h-3.5 w-3.5" /></button>
              </div>
            </article>;
          })}
        </div>
        <p className="text-center text-xs text-muted-foreground">Showing {filtered.length} of {TEMPLATES.length} templates</p>
      </div>
    </div>
  );
};
