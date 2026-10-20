import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, FileImage, FileText, ImagePlus, LoaderCircle, ShieldCheck, X } from "lucide-react";
import { createPngDocx } from "@/lib/playground/createPngDocx";

export const PngToDocx = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  const chooseFile = (candidate?: File) => {
    setError("");
    if (!candidate) return;
    if (candidate.type !== "image/png" && !candidate.name.toLowerCase().endsWith(".png")) {
      setError("Please choose a PNG image. This converter packages your image into a Word document.");
      return;
    }
    if (candidate.size > 20 * 1024 * 1024) {
      setError("This image is larger than 20 MB. Choose a smaller PNG to continue.");
      return;
    }
    setFile(candidate);
    setPreview(URL.createObjectURL(candidate));
  };

  const clear = () => {
    setFile(null);
    setPreview(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const convert = async () => {
    if (!file || converting) return;
    setConverting(true);
    setError("");
    try {
      const document = await createPngDocx(file);
      const url = URL.createObjectURL(document);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = `${file.name.replace(/\.png$/i, "") || "image"}.docx`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (conversionError) {
      setError(conversionError instanceof Error ? conversionError.message : "Could not create the Word document.");
    } finally {
      setConverting(false);
    }
  };

  return (
    <div className="grid min-h-[470px] gap-5 xl:grid-cols-[1.15fr_.85fr]">
      <section className="rounded-3xl border border-white/[0.08] bg-[#111a2b] p-5 sm:p-7">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.2em] text-violet-300"><FileImage className="h-4 w-4" /> Image document studio</div>
        <h2 className="mt-3 text-2xl font-bold text-white">PNG to DOCX</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">Turn an image into a Word document in seconds. Your image stays on this device and is embedded at a page-friendly size.</p>
        <input ref={inputRef} type="file" accept="image/png,.png" className="sr-only" onChange={(event) => chooseFile(event.currentTarget.files?.[0])} />
        {!file ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); chooseFile(event.dataTransfer.files[0]); }}
            className="mt-7 flex min-h-64 w-full flex-col items-center justify-center rounded-2xl border border-dashed border-violet-300/30 bg-violet-400/[.04] px-6 text-center transition hover:border-violet-300/60 hover:bg-violet-400/[.08]"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-400/10 text-violet-300"><ImagePlus className="h-7 w-7" /></span>
            <b className="mt-4 text-sm text-white">Drop your PNG here</b>
            <span className="mt-1 text-xs text-slate-500">or click to browse · PNG up to 20 MB</span>
          </button>
        ) : (
          <div className="mt-7 overflow-hidden rounded-2xl border border-white/[.08] bg-[#0b1220]">
            <div className="flex items-center justify-between border-b border-white/[.07] px-4 py-3">
              <div className="flex min-w-0 items-center gap-3"><FileImage className="h-4 w-4 shrink-0 text-violet-300" /><div className="min-w-0"><b className="block truncate text-xs text-white">{file.name}</b><span className="text-[11px] text-slate-500">{(file.size / 1024).toFixed(0)} KB · PNG</span></div></div>
              <button aria-label="Remove image" onClick={clear} className="rounded-lg p-2 text-slate-500 hover:bg-white/[.06] hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex h-56 items-center justify-center bg-[linear-gradient(45deg,#111827_25%,transparent_25%),linear-gradient(-45deg,#111827_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#111827_75%),linear-gradient(-45deg,transparent_75%,#111827_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0] p-4">
              {preview && <img src={preview} alt="Selected PNG preview" className="max-h-full max-w-full rounded-md object-contain shadow-xl" />}
            </div>
          </div>
        )}
        {error && <p role="alert" className="mt-3 rounded-xl border border-rose-400/20 bg-rose-400/[.08] px-3 py-2 text-xs text-rose-200">{error}</p>}
      </section>

      <aside className="flex flex-col rounded-3xl border border-white/[0.08] bg-[#111a2b] p-5 sm:p-7">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.2em] text-slate-400"><FileText className="h-4 w-4 text-sky-300" /> Export settings</div>
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-white/[.07] bg-[#0b1220] p-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-400/10 text-sky-300"><FileText className="h-5 w-5" /></span>
          <div><b className="text-sm text-white">Word document</b><p className="mt-0.5 text-xs text-slate-500">DOCX · Microsoft Word compatible</p></div>
        </div>
        <ul className="mt-5 space-y-3 text-xs text-slate-400">
          <li className="flex gap-2.5"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" /><span><b className="text-slate-200">Private by design</b><br />Conversion runs locally in your browser.</span></li>
          <li className="flex gap-2.5"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" /><span><b className="text-slate-200">Page-fit image</b><br />The PNG scales proportionally to fit a standard page.</span></li>
          <li className="flex gap-2.5"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" /><span><b className="text-slate-200">Ready to edit</b><br />Open the generated document in Word or another DOCX editor.</span></li>
        </ul>
        <div className="mt-auto pt-7">
          <button onClick={convert} disabled={!file || converting} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-400 to-indigo-400 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-violet-500/10 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">
            {converting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
            {converting ? "Creating DOCX…" : "Convert & download"}
          </button>
          <p className="mt-3 text-center text-[11px] text-slate-600">Supports PNG images up to 20 MB</p>
        </div>
      </aside>
    </div>
  );
};
