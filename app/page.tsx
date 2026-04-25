"use client"

import React, { useState, useRef, useEffect } from 'react';
import { Upload, Download, Type, PenTool, Loader2, Trash2, Move, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import Image from 'next/image';

type PlacedText = { x: number; y: number; text: string; size: number; id: number; page: number };
type PlacedSignature = { x: number; y: number; width: number; height: number; dataUrl: string; id: number; page: number };

export default function PDFKiller() {
  const [file, setFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [editMode, setEditMode] = useState<'text' | 'draw' | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [pdfProxy, setPdfProxy] = useState<any>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [activeType, setActiveType] = useState<'text' | 'sig' | null>(null);
  const [placedTexts, setPlacedTexts] = useState<PlacedText[]>([]);
  const [placedSignatures, setPlacedSignatures] = useState<PlacedSignature[]>([]);

  // קנבס ציור זמני — מוצג כ-overlay בזמן הציור בלבד
  const [isDrawingActive, setIsDrawingActive] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);       // קנבס PDF (תצוגה בלבד)
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);   // קנבס ציור זמני
  const isDrawing = useRef(false);
  const drawBoundsRef = useRef<{ minX: number; minY: number; maxX: number; maxY: number } | null>(null);
  const activeDragRef = useRef<{ id: number; type: 'text' | 'sig'; startX: number; startY: number; elem: HTMLElement | null } | null>(null);

  const getCanvasPoint = (canvas: HTMLCanvasElement, clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const renderPage = async (pageNum: number, proxy = pdfProxy) => {
    if (!proxy || !canvasRef.current || typeof window === 'undefined') return;
    setIsAnalyzing(true);
    try {
      const page = await proxy.getPage(pageNum);
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d')!;
      const viewport = page.getViewport({ scale: 2.5 });
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      await page.render({ canvasContext: context, viewport }).promise;
    } catch (error) { console.error(error); } finally { setIsAnalyzing(false); }
  };

  // מסנכרן גודל קנבס הציור עם קנבס ה-PDF
  useEffect(() => {
    if (!canvasRef.current || !drawCanvasRef.current) return;
    const obs = new ResizeObserver(() => {
      if (!canvasRef.current || !drawCanvasRef.current) return;
      drawCanvasRef.current.width = canvasRef.current.width;
      drawCanvasRef.current.height = canvasRef.current.height;
    });
    obs.observe(canvasRef.current);
    return () => obs.disconnect();
  }, [file]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;
    setIsAnalyzing(true);
    setFile(uploadedFile);
    try {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
      const arrayBuffer = await uploadedFile.arrayBuffer();
      const loadingTask = pdfjs.getDocument({ data: arrayBuffer, cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`, cMapPacked: true });
      const pdf = await loadingTask.promise;
      setPdfProxy(pdf);
      setNumPages(pdf.numPages);
      await renderPage(1, pdf);
    } catch (error) { console.error(error); }
  };

  const changePage = (offset: number) => {
    const newPage = currentPage + offset;
    if (newPage >= 1 && newPage <= numPages) {
      setCurrentPage(newPage);
      setActiveId(null);
      setActiveType(null);
      renderPage(newPage);
    }
  };

  // --- ציור חתימה ---
  const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (editMode !== 'draw' || !drawCanvasRef.current) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    isDrawing.current = true;
    const { x, y } = getCanvasPoint(drawCanvasRef.current, e.clientX, e.clientY);
    drawBoundsRef.current = { minX: x, minY: y, maxX: x, maxY: y };
    const ctx = drawCanvasRef.current.getContext('2d')!;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const duringDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current || editMode !== 'draw' || !drawCanvasRef.current) return;
    const { x, y } = getCanvasPoint(drawCanvasRef.current, e.clientX, e.clientY);
    const ctx = drawCanvasRef.current.getContext('2d')!;
    ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.strokeStyle = '#000';
    ctx.lineTo(x, y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, y);
    // עדכון גבולות הציור
    const b = drawBoundsRef.current!;
    b.minX = Math.min(b.minX, x); b.minY = Math.min(b.minY, y);
    b.maxX = Math.max(b.maxX, x); b.maxY = Math.max(b.maxY, y);
  };

  const endDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current || !drawCanvasRef.current || !canvasRef.current) return;
    isDrawing.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);

    const b = drawBoundsRef.current;
    if (!b) return;

    const pad = 16;
    const bx = Math.max(0, b.minX - pad);
    const by = Math.max(0, b.minY - pad);
    const bw = Math.min(drawCanvasRef.current.width - bx, b.maxX - b.minX + pad * 2);
    const bh = Math.min(drawCanvasRef.current.height - by, b.maxY - b.minY + pad * 2);

    // חותך רק את אזור החתימה לתמונה נפרדת
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = bw; cropCanvas.height = bh;
    cropCanvas.getContext('2d')!.drawImage(drawCanvasRef.current, bx, by, bw, bh, 0, 0, bw, bh);
    const dataUrl = cropCanvas.toDataURL();

    // מחשב מיקום ב-display pixels (overlay)
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = rect.width / canvasRef.current.width;
    const scaleY = rect.height / canvasRef.current.height;

    const newSig: PlacedSignature = {
      id: Date.now(),
      page: currentPage,
      dataUrl,
      x: bx * scaleX,
      y: by * scaleY,
      width: bw * scaleX,
      height: bh * scaleY,
    };

    setPlacedSignatures(prev => [...prev, newSig]);
    setActiveId(newSig.id);
    setActiveType('sig');

    // מנקה קנבס הציור
    drawCanvasRef.current.getContext('2d')!.clearRect(0, 0, drawCanvasRef.current.width, drawCanvasRef.current.height);
    drawBoundsRef.current = null;
    setEditMode(null);
  };

  // --- Drag ---
  const handleDragEnd = (e: React.PointerEvent) => {
    if (!activeDragRef.current) return;
    const { id, type, startX, startY, elem } = activeDragRef.current;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (elem) elem.style.transform = 'none';
    if (type === 'text') {
      setPlacedTexts(prev => prev.map(t => t.id === id ? { ...t, x: t.x + dx, y: t.y + dy } : t));
    } else {
      setPlacedSignatures(prev => prev.map(s => s.id === id ? { ...s, x: s.x + dx, y: s.y + dy } : s));
    }
    activeDragRef.current = null;
    if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }
  };

  // --- שמירה והורדה ---
  const finalizeAndDownload = async () => {
    if (!file || !pdfProxy || typeof window === 'undefined') return;
    setIsAnalyzing(true);
    try {
      const { PDFDocument } = await import('pdf-lib');
      const pdfDoc = await PDFDocument.create();
      for (let i = 1; i <= numPages; i++) {
        const page = await pdfProxy.getPage(i);
        const viewport = page.getViewport({ scale: 2.5 });
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = viewport.width; tempCanvas.height = viewport.height;
        const tempCtx = tempCanvas.getContext('2d')!;
        await page.render({ canvasContext: tempCtx, viewport }).promise;

        // ציור חתימות על העמוד
        const sigsForPage = placedSignatures.filter(s => s.page === i);
        for (const sig of sigsForPage) {
          if (!canvasRef.current) continue;
          const rect = canvasRef.current.getBoundingClientRect();
          const scaleX = tempCanvas.width / rect.width;
          const scaleY = tempCanvas.height / rect.height;
          const img = new window.Image();
          img.src = sig.dataUrl;
          await new Promise<void>(res => { img.onload = () => { tempCtx.drawImage(img, sig.x * scaleX, sig.y * scaleY, sig.width * scaleX, sig.height * scaleY); res(); }; });
        }

        // ציור טקסטים
        const displayWidth = canvasRef.current?.getBoundingClientRect().width || 1;
        const scale = tempCanvas.width / displayWidth;
        placedTexts.filter(t => t.page === i).forEach(t => {
          if (!t.text.trim()) return;
          tempCtx.font = `bold ${t.size * scale}px Arial, sans-serif`;
          tempCtx.fillStyle = 'black'; tempCtx.textBaseline = 'top'; tempCtx.textAlign = 'left';
          tempCtx.fillText(t.text, t.x * scale, t.y * scale);
        });

        const imgData = tempCanvas.toDataURL('image/png', 1.0);
        const img = await pdfDoc.embedPng(imgData);
        const newPage = pdfDoc.addPage([img.width / 2.5, img.height / 2.5]);
        newPage.drawImage(img, { x: 0, y: 0, width: newPage.getWidth(), height: newPage.getHeight() });
      }
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `Signed_${file.name}`;
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      setTimeout(() => window.location.reload(), 2000);
    } catch (error) { console.error(error); setIsAnalyzing(false); }
  };

  return (
    <main dir="ltr" className="min-h-[100dvh] bg-black text-white flex flex-col py-4 px-4 relative overflow-x-hidden"
          style={{ WebkitTextSizeAdjust: 'none' } as any}
          onPointerMove={(e) => {
            if (activeDragRef.current) {
              const { startX, startY, elem } = activeDragRef.current;
              if (elem) elem.style.transform = `translate(${e.clientX - startX}px, ${e.clientY - startY}px)`;
            }
          }}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}>

      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-[#39FF14]/10 blur-[150px] rounded-full pointer-events-none" />

      <header className="relative z-20 flex flex-col items-center shrink-0 mb-4 pt-6">
        <Image src="/logo.png" alt="Logo" width={100} height={100} className="mb-2 object-contain" priority />
        <h1 className="text-[10px] font-bold tracking-[0.5em] uppercase text-white/60">PDF Killer</h1>
      </header>

      <div className="flex-grow flex items-center justify-center w-full z-10 px-1 md:px-0 mb-4">
        <div className={`w-full bg-[#0E0E0E] border border-white/5 rounded-[2rem] p-3 md:p-8 shadow-2xl transition-all duration-500 ${file ? 'max-w-[950px]' : 'max-w-[420px]'}`}>
          {!file ? (
            <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-white/10 rounded-3xl cursor-pointer hover:border-[#39FF14]/40 transition-all group">
              <Upload className="text-[#39FF14] mb-4 group-hover:scale-110 transition-transform" size={28} />
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-4 text-center">Upload PDF Contract</span>
              <input type="file" className="hidden" onChange={handleFileUpload} accept="application/pdf" />
            </label>
          ) : (
            <div className="flex flex-col space-y-4">
              {/* Toolbar */}
              <div className="flex flex-wrap justify-between items-center bg-[#151515] p-2 rounded-xl border border-white/5 gap-2">
                <div className="flex items-center gap-2">
                  <button onClick={() => window.location.reload()} className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-all"><Trash2 size={16} /></button>
                  <div className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-lg border border-white/5">
                    <button onClick={() => changePage(-1)} disabled={currentPage === 1} className="disabled:opacity-20 hover:text-[#39FF14] transition-all"><ChevronLeft size={16} /></button>
                    <span className="text-[8px] font-bold tracking-tighter uppercase w-14 text-center">{currentPage} / {numPages}</span>
                    <button onClick={() => changePage(1)} disabled={currentPage === numPages} className="disabled:opacity-20 hover:text-[#39FF14] transition-all"><ChevronRight size={16} /></button>
                  </div>
                </div>
                <div className="flex gap-2 items-center">
                  <button onClick={() => { setEditMode('text'); setActiveId(null); setActiveType(null); }}
                    className={`px-3 py-2 rounded-lg transition-all flex items-center gap-1.5 ${editMode === 'text' ? 'bg-[#39FF14] text-black shadow-[0_0_15px_rgba(57,255,20,0.3)]' : 'hover:bg-white/5 text-white/40'}`}>
                    <Type size={12} /> <span className="text-[9px] font-bold uppercase tracking-widest">Text</span>
                  </button>
                  <button onClick={() => { setEditMode('draw'); setActiveId(null); setActiveType(null); }}
                    className={`px-3 py-2 rounded-lg transition-all flex items-center gap-1.5 ${editMode === 'draw' ? 'bg-[#39FF14] text-black shadow-[0_0_15px_rgba(57,255,20,0.3)]' : 'hover:bg-white/5 text-white/40'}`}>
                    <PenTool size={12} /> <span className="text-[9px] font-bold uppercase tracking-widest">Sign</span>
                  </button>
                </div>
              </div>

              {/* אזור PDF */}
              <div className="w-full h-[50vh] md:h-[65vh] bg-[#D1D1D1] rounded-xl relative overflow-y-auto overflow-x-hidden flex justify-center p-2 md:p-6 shadow-inner overscroll-contain"
                   style={{ WebkitOverflowScrolling: 'touch' }}
                   onPointerDown={(e) => {
                     if (!canvasRef.current || (e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).closest('button')) return;
                     if (editMode === 'text') {
                       const rect = canvasRef.current.getBoundingClientRect();
                       const newId = Date.now();
                       setPlacedTexts(prev => [...prev, { x: e.clientX - rect.left, y: e.clientY - rect.top, text: '', size: 16, id: newId, page: currentPage }]);
                       setActiveId(newId); setActiveType('text');
                       setEditMode(null);
                     } else if (editMode !== 'draw') {
                       setActiveId(null); setActiveType(null);
                     }
                   }}>

                {isAnalyzing && <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center"><Loader2 className="animate-spin text-[#39FF14]" size={32} /></div>}

                <div className="relative h-max pointer-events-none">
                  {/* קנבס PDF — תצוגה בלבד */}
                  <canvas ref={canvasRef}
                    className="max-w-full h-auto bg-white shadow-2xl block"
                    style={{ pointerEvents: 'none' }}
                  />

                  {/* קנבס ציור — פעיל רק במצב draw */}
                  <canvas ref={drawCanvasRef}
                    className="absolute inset-0 max-w-full h-auto"
                    style={{
                      pointerEvents: editMode === 'draw' ? 'auto' : 'none',
                      touchAction: editMode === 'draw' ? 'none' : 'auto',
                      cursor: editMode === 'draw' ? 'crosshair' : 'default',
                    }}
                    onPointerDown={startDraw}
                    onPointerMove={duringDraw}
                    onPointerUp={endDraw}
                  />

                  {/* Overlay: טקסטים + חתימות */}
                  <div className="absolute inset-0 pointer-events-none">

                    {/* חתימות */}
                    {placedSignatures.filter(s => s.page === currentPage).map(sig => (
                      <div key={sig.id}
                           onPointerDown={(e) => {
                             e.stopPropagation();
                             setActiveId(sig.id); setActiveType('sig');
                             activeDragRef.current = { id: sig.id, type: 'sig', startX: e.clientX, startY: e.clientY, elem: e.currentTarget as HTMLElement };
                             (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                           }}
                           style={{ left: sig.x, top: sig.y, width: sig.width, height: sig.height, touchAction: 'none' }}
                           className={`absolute pointer-events-auto cursor-pointer transition-colors
                             ${activeId === sig.id && activeType === 'sig'
                               ? 'border-2 border-dashed border-[#39FF14] bg-[#39FF14]/5 z-30'
                               : 'border-2 border-transparent z-20'}`}>

                        {/* כפתורי פעולה */}
                        {activeId === sig.id && activeType === 'sig' && (
                          <div className="absolute -top-9 left-0 flex gap-1.5">
                            <div className="bg-[#39FF14] p-1.5 rounded text-black shadow-lg cursor-move touch-none flex items-center justify-center"><Move size={12} /></div>
                            <button onPointerDown={(e) => { e.stopPropagation(); setPlacedSignatures(prev => prev.filter(s => s.id !== sig.id)); setActiveId(null); setActiveType(null); }}
                                    className="bg-red-500 p-1.5 rounded text-white shadow-lg touch-none flex items-center justify-center"><Trash2 size={12} /></button>
                          </div>
                        )}

                        <img src={sig.dataUrl} alt="signature" className="w-full h-full object-contain pointer-events-none select-none" draggable={false} />
                      </div>
                    ))}

                    {/* טקסטים */}
                    {placedTexts.filter(t => t.page === currentPage).map(t => (
                      <div key={t.id}
                           onPointerDown={(e) => {
                             e.stopPropagation();
                             setActiveId(t.id); setActiveType('text');
                             activeDragRef.current = { id: t.id, type: 'text', startX: e.clientX, startY: e.clientY, elem: e.currentTarget as HTMLElement };
                             (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                           }}
                           style={{ left: t.x - 12, top: t.y - 12, touchAction: 'none' }}
                           className={`absolute flex items-center p-2 transition-colors pointer-events-auto
                             ${activeId === t.id && activeType === 'text'
                               ? 'border-2 border-dashed border-[#39FF14] bg-[#39FF14]/5 z-30'
                               : 'border-2 border-transparent z-20 cursor-pointer'}`}>

                        {activeId === t.id && activeType === 'text' && (
                          <div className="absolute -top-9 -left-1 flex gap-1.5">
                            <div className="bg-[#39FF14] p-1.5 rounded text-black shadow-lg cursor-move touch-none flex items-center justify-center"><Move size={12} /></div>
                            <button onPointerDown={(e) => { e.stopPropagation(); setPlacedTexts(prev => prev.filter(pt => pt.id !== t.id)); setActiveId(null); setActiveType(null); }}
                                    className="bg-red-500 p-1.5 rounded text-white shadow-lg touch-none flex items-center justify-center"><Trash2 size={12} /></button>
                          </div>
                        )}

                        <input
                          ref={(el) => { if (el && activeId === t.id && document.activeElement !== el) setTimeout(() => el.focus({ preventScroll: true }), 10); }}
                          type="text" value={t.text}
                          onChange={(e) => setPlacedTexts(prev => prev.map(pt => pt.id === t.id ? { ...pt, text: e.target.value } : pt))}
                          className="bg-transparent border-none outline-none text-black font-bold p-0 m-0"
                          style={{ fontSize: `${t.size}px`, lineHeight: 1.0, width: `${(t.text.length || 1) + 1}ch` }}
                        />

                        {activeId === t.id && activeType === 'text' && (
                          <div className="absolute -bottom-9 left-0 flex items-center gap-1.5 bg-[#151515] p-1.5 rounded-lg border border-white/10 shadow-xl touch-none z-50 w-max">
                            <span className="text-[7px] text-gray-400 font-bold uppercase">Size</span>
                            <input type="range" min="6" max="60" value={t.size}
                              onChange={(e) => setPlacedTexts(prev => prev.map(pt => pt.id === t.id ? { ...pt, size: parseInt(e.target.value) } : pt))}
                              onPointerDown={(e) => e.stopPropagation()}
                              className="w-16 md:w-24 accent-[#39FF14]" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <button onClick={finalizeAndDownload} className="w-full bg-[#39FF14] text-black font-black py-4 rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-[0.98] uppercase tracking-[0.2em] text-[10px] shadow-[0_10px_30px_rgba(57,255,20,0.2)]">
                {isAnalyzing ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
                <span>Save & Download PDF</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <footer className="relative z-10 flex flex-col items-center shrink-0 mt-auto pb-4">
        <p className="text-[11px] font-medium tracking-[0.1em] text-gray-500 mb-3">Powered by deVee Boutique Label</p>
        <div className="h-14 w-14 rounded-full overflow-hidden border border-white/10 shadow-lg">
          <Image src="/label_logo.jpg" alt="deVee" width={56} height={56} className="object-cover" />
        </div>
      </footer>
    </main>
  );
}
