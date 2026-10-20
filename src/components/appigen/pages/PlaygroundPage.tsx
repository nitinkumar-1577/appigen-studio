import { useState } from "react";
import { ArrowUpRight, FileImage, Gamepad2, Swords, Trophy } from "lucide-react";
import { FightArena } from "./FightArena";
import { LudoArena } from "./LudoArena";
import { PngToDocx } from "./PngToDocx";
import { ArcadeGames } from "./ArcadeGames";
import "./playground.css";

type ToolKey = "ludo" | "fight" | "convert" | "arcade";

const tools: { key: ToolKey; label: string; eyebrow: string; icon: typeof Trophy; color: string }[] = [
  { key: "ludo", label: "Ludo", eyebrow: "Board game", icon: Gamepad2, color: "amber" },
  { key: "fight", label: "Neon Clash", eyebrow: "Fighting game", icon: Swords, color: "rose" },
  { key: "convert", label: "PNG to DOCX", eyebrow: "File converter", icon: FileImage, color: "violet" },
  { key: "arcade", label: "Arcade", eyebrow: "Four game modes", icon: Gamepad2, color: "rose" },
];

export const PlaygroundPage = () => {
  const [activeTool, setActiveTool] = useState<ToolKey>("ludo");
  const active = tools.find((tool) => tool.key === activeTool)!;

  return (
    <div className="playground-scroll">
      <div className="playground-shell">
        <header className="playground-header">
          <div className="min-w-0">
            <div className="playground-kicker"><span className="playground-kicker-mark"><Gamepad2 className="h-3.5 w-3.5" /></span> AppiGen labs <span className="playground-kicker-sep">/</span> Interactive tools</div>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
              <div><h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Play, create, <span className="playground-gradient">explore.</span></h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">A little arcade for your next break. Challenge the CPU, step into the arena, or turn an image into a Word document.</p></div>
              <div className="hidden items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/[.05] px-3 py-2 text-[11px] font-medium text-emerald-200 sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />Everything runs right here</div>
            </div>
          </div>
        </header>

        <nav className="playground-tools" aria-label="Playground tools">
          {tools.map((tool, index) => (
            <button key={tool.key} onClick={() => setActiveTool(tool.key)} className={`playground-tool ${activeTool === tool.key ? `selected ${tool.color}` : ""}`} aria-current={activeTool === tool.key ? "page" : undefined}>
              <span className="playground-tool-icon"><tool.icon className="h-[18px] w-[18px]" /></span>
              <span className="min-w-0 text-left"><small>{tool.eyebrow}</small><b>{tool.label}</b></span>
              <span className="tool-index">0{index + 1}</span>
              {activeTool === tool.key && <ArrowUpRight className="tool-arrow h-4 w-4" />}
            </button>
          ))}
        </nav>

        <div key={activeTool} className="playground-content animate-fade-in">
          {activeTool === "ludo" && <LudoArena />}
          {activeTool === "fight" && <FightArena />}
          {activeTool === "convert" && <PngToDocx />}
          {activeTool === "arcade" && <ArcadeGames />}
        </div>
        <footer className="playground-footer"><span>NOW PLAYING</span><b>{active.label}</b><span className="footer-dot" /> <span>Made for your browser</span></footer>
      </div>
    </div>
  );
};
