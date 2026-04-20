"use client"

import React, { useState, useRef } from 'react';
import { Upload, Download, Type, PenTool, Loader2, Trash2, Move, ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';

export default function PDFKiller() {
  const [file, setFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [editMode, setEditMode] = useState<'text' | 'draw' | null>(null);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [pdfProxy, setPdfProxy] = useState<any>(null);
  const [fontSize, setFontSize] = useState(16);
  const [activeId, setActiveId] = useState<number | null>(null);
  
  const [placedTexts, setPlacedTexts] = useState<{ x: number, y: number, text: string, size: number, id: number, page: number }[]>([]);
  const [pageDrawings, setPageDrawings] = useState<{ page: number, dataUrl: string }[]>([]);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const [touchActiveId, setTouchActiveId] = useState<number | null>(null);

  const getCanvasPoint = (clientX: number, clientY: number) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const scale = canvasRef.current.width / rect.width;
    return { x: (clientX - rect.left) * scale, y: (clientY - rect.top) * scale };
  };

  const drawAt = (clientX: number, clientY: number) => {
    if (!canvasRef.current || editMode !== 'draw') return;
    const ctx = canvasRef.current.getContext('2d')!;
    const { x, y } = getCanvasPoint(clientX, clientY);
    ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.strokeStyle = '#000';
    ctx.lineTo(x, y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, y);
  };


    if (canvasRef.current) {
      const dataUrl = canvasRef.current.toDataURL();
      setPageDrawings(prev => {
        const filtered = prev.filter(d => d.page !== currentPage);
        return [...filtered, { page: currentPage, dataUrl }];
      });
    }
  };

  const renderPage = async (pageNum: number, proxy = pdfProxy) => {
    if (!proxy || !canvasRef.current || typeof window === 'undefined') return;
    setIsAnalyzing(true);
    try {
      const page = await proxy.getPage(pageNum);
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      const viewport = page.getViewport({ scale: 2.5 }); 
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      await page.render({ canvasContext: context!, viewport }).promise;

      const existingDrawing = pageDrawings.find(d => d.page === pageNum);
      if (existingDrawing) {
        const img = new window.Image();
        img.src = existingDrawing.dataUrl;
        img.onload = () => context?.drawImage(img, 0, 0);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;
    setIsAnalyzing(true);
    setFile(uploadedFile);

    try {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
      const arrayBuffer = await uploadedFile.arrayBuffer();
      
      const loadingTask = pdfjs.getDocument({
        data: arrayBuffer,
        cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
        cMapPacked: true,
      });

      const pdf = await loadingTask.promise;
      setPdfProxy(pdf);
      setNumPages(pdf.numPages);
      await renderPage(1, pdf);
    } catch (error) {
      console.error(error);
    }
  };

  const changePage = (offset: number) => {
    saveCurrentDrawing();
    const newPage = currentPage + offset;
    if (newPage >= 1 && newPage <= numPages) {
      setCurrentPage(newPage);
      setActiveId(null);
      renderPage(newPage);
    }
  };

  const handleContainerTouch = (e: React.TouchEvent) => {
    if (!canvasRef.current) return;
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    if (editMode !== 'text') return;
    const touch = e.changedTouches[0];
    const rect = canvasRef.current.getBoundingClientRect();
    const newId = Date.now();
    setPlacedTexts(prev => [...prev, { 
      x: touch.clientX - rect.left, 
      y: touch.clientY - rect.top, 
      text: '', 
      size: fontSize, 
      id: newId, 
      page: currentPage 
    }]);
    setActiveId(newId);
    setEditMode(null);
  };


    if (!canvasRef.current) return;
    if ((e.target as HTMLElement).tagName === 'INPUT') return;

    if (editMode === 'text') {
      const rect = canvasRef.current.getBoundingClientRect();
      const newId = Date.now();
      setPlacedTexts(prev => [...prev, { 
        x: e.clientX - rect.left, 
        y: e.clientY - rect.top, 
        text: '', 
        size: fontSize, 
        id: newId, 
        page: currentPage 
      }]);
      setActiveId(newId);
      setEditMode(null);
    } else {
      setActiveId(null);
    }
  };

  const finalizeAndDownload = async () => {
    if (!file || !pdfProxy || typeof window === 'undefined') return;
    saveCurrentDrawing();
    setIsAnalyzing(true);

    try {
      // ייבוא דינמי בלחיצה בלבד כדי למנוע קריסה ב-Build של Vercel
      const { PDFDocument } = await import('pdf-lib');
      const pdfDoc = await PDFDocument.create();
      const displayWidth = canvasRef.current?.getBoundingClientRect().width || 1;

      for (let i = 1; i <= numPages; i++) {
        const page = await pdfProxy.getPage(i);
        const viewport = page.getViewport({ scale: 2.5 });
        
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = viewport.width;
        tempCanvas.height = viewport.height;
        const tempCtx = tempCanvas.getContext('2d')!;
        
        await page.render({ canvasContext: tempCtx, viewport }).promise;
        
        const drawingForPage = pageDrawings.find(d => d.page === i);
        if (drawingForPage || (i === currentPage && canvasRef.current)) {
          const img = new window.Image();
          img.src = i === currentPage ? canvasRef.current!.toDataURL() : drawingForPage!.dataUrl;
          await new Promise((res) => {
            img.onload = () => { tempCtx.drawImage(img, 0, 0); res(null); };
          });
        }

        const pageTexts = placedTexts.filter(t => t.page === i);
        const scale = tempCanvas.width / displayWidth;
        
        pageTexts.forEach(t => {
          if (!t.text.trim()) return;
          tempCtx.font = `bold ${t.size * scale}px Arial, sans-serif`;
          tempCtx.fillStyle = 'black';
          tempCtx.textBaseline = 'top';
          tempCtx.textAlign = 'left';
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
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setTimeout(() => {
        window.location.reload();
      }, 2000);

    } catch (error) {
      console.error(error);
      setIsAnalyzing(false);
    }
  };

  return (
    <main dir="ltr" className="h-screen bg-black text-white flex flex-col justify-between py-6 px-4 relative overflow-hidden" 
          onMouseMove={(e) => {
            if (isDragging.current && activeId !== null) {
              setPlacedTexts(prev => prev.map(t => t.id === activeId ? { ...t, x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y } : t));
            }
          }} 
          onMouseUp={() => { isDragging.current = false; }}>
      
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-[#39FF14]/10 blur-[150px] rounded-full pointer-events-none" />

      {/* Header - Fixed Top */}
      <header className="relative z-20 flex flex-col items-center shrink-0">
        <Image src="/logo.png" alt="Logo" width={60} height={60} className="mb-2 object-contain" priority />
        <h1 className="text-[10px] font-bold tracking-[0.5em] uppercase text-white/60">PDF Killer</h1>
      </header>

      {/* Main Container - Centered */}
      <div className="flex-grow flex items-center justify-center w-full z-10 px-2 md:px-0">
        <div className={`w-full bg-[#0E0E0E] border border-white/5 rounded-[2rem] p-4 md:p-8 shadow-2xl transition-all duration-500 ${file ? 'max-w-[950px]' : 'max-w-[420px]'}`}>
          {!file ? (
            <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-white/10 rounded-3xl cursor-pointer hover:border-[#39FF14]/40 transition-all group">
              <Upload className="text-[#39FF14] mb-4 group-hover:scale-110 transition-transform" size={28} />
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-4 text-center">Upload PDF Contract</span>
              <input type="file" className="hidden" onChange={handleFileUpload} accept="application/pdf" />
            </label>
          ) : (
            <div className="flex flex-col space-y-4">
              <div className="flex justify-between items-center bg-[#151515] p-2 rounded-xl border border-white/5">
                <button onClick={() => window.location.reload()} className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-all"><Trash2 size={16} /></button>

                <div className="flex items-center gap-4 bg-black/40 px-4 py-2 rounded-lg border border-white/5">
                  <button onClick={() => changePage(-1)} disabled={currentPage === 1} className="disabled:opacity-20 hover:text-[#39FF14] transition-all"><ChevronLeft size={18} /></button>
                  <span className="text-[9px] font-bold tracking-tighter uppercase w-16 text-center">Page {currentPage} / {numPages}</span>
                  <button onClick={() => changePage(1)} disabled={currentPage === numPages} className="disabled:opacity-20 hover:text-[#39FF14] transition-all"><ChevronRight size={18} /></button>
                </div>

                <div className="flex gap-2">
                  <button onClick={() => setEditMode('text')} className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 ${editMode === 'text' ? 'bg-[#39FF14] text-black shadow-[0_0_15px_rgba(57,255,20,0.3)]' : 'hover:bg-white/5 text-white/40'}`}>
                    <Type size={14} /> <span className="text-[10px] font-bold uppercase tracking-widest">Text</span>
                  </button>
                  <button onClick={() => {setEditMode('draw'); setActiveId(null);}} className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 ${editMode === 'draw' ? 'bg-[#39FF14] text-black shadow-[0_0_15px_rgba(57,255,20,0.3)]' : 'hover:bg-white/5 text-white/40'}`}>
                    <PenTool size={14} /> <span className="text-[10px] font-bold uppercase tracking-widest">Sign</span>
                  </button>
                </div>
              </div>

              <div className="w-full h-[60vh] md:h-[65vh] bg-[#D1D1D1] rounded-xl relative overflow-auto flex justify-center p-4 md:p-6 shadow-inner" 
                   onClick={handleContainerClick}
                   onTouchEnd={handleContainerTouch}>
                
                {isAnalyzing && <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center"><Loader2 className="animate-spin text-[#39FF14]" size={32} /></div>}
                
                <div className="relative h-max pointer-events-none">
                  <canvas ref={canvasRef} 
                    onMouseDown={() => { if (editMode === 'draw') isDrawing.current = true; }} 
                    onMouseMove={(e) => { if (!isDrawing.current) return; drawAt(e.clientX, e.clientY); }}
                    onMouseUp={() => { isDrawing.current = false; canvasRef.current?.getContext('2d')?.beginPath(); }}
                    onTouchStart={(e) => { 
                      if (editMode === 'draw') { 
                        e.preventDefault(); 
                        isDrawing.current = true; 
                        const t = e.touches[0];
                        const { x, y } = getCanvasPoint(t.clientX, t.clientY);
                        canvasRef.current?.getContext('2d')?.moveTo(x, y);
                      }
                    }}
                    onTouchMove={(e) => { 
                      if (!isDrawing.current) return; 
                      e.preventDefault(); 
                      drawAt(e.touches[0].clientX, e.touches[0].clientY); 
                    }}
                    onTouchEnd={() => { isDrawing.current = false; canvasRef.current?.getContext('2d')?.beginPath(); }}
                    style={{ touchAction: editMode === 'draw' ? 'none' : 'auto' }}
                    className="max-w-full h-auto bg-white shadow-2xl block pointer-events-auto" 
                  />
                  
                  <div className="absolute inset-0 pointer-events-none">
                  {placedTexts.filter(t => t.page === currentPage).map(t => (
                    <div key={t.id} 
                         onMouseDown={(e) => { 
                           isDragging.current = true; 
                           setActiveId(t.id); 
                           dragOffset.current = { x: e.clientX - t.x, y: e.clientY - t.y }; 
                           e.stopPropagation(); 
                         }}
                         onTouchStart={(e) => {
                           setActiveId(t.id);
                           setTouchActiveId(t.id);
                           const touch = e.touches[0];
                           dragOffset.current = { x: touch.clientX - t.x, y: touch.clientY - t.y };
                           e.stopPropagation();
                         }}
                         onTouchMove={(e) => {
                           e.preventDefault();
                           const touch = e.touches[0];
                           setPlacedTexts(prev => prev.map(pt => pt.id === t.id 
                             ? { ...pt, x: touch.clientX - dragOffset.current.x, y: touch.clientY - dragOffset.current.y } 
                             : pt));
                         }}
                         onTouchEnd={() => { isDragging.current = false; }}
                         style={{ left: t.x - 12, top: t.y - 12, touchAction: 'none' }}
                         className={`absolute flex items-center p-3 transition-all pointer-events-auto ${activeId === t.id ? 'border-2 border-dashed border-[#39FF14] bg-[#39FF14]/5 z-30' : 'border-2 border-transparent z-20 cursor-pointer'}`}>
                      
                      {activeId === t.id && (
                        <div className="absolute -top-8 -left-2 flex gap-1">
                          <div className="bg-[#39FF14] p-1 rounded text-black shadow-lg cursor-move"><Move size={10} /></div>
                          <button 
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); setPlacedTexts(prev => prev.filter(pt => pt.id !== t.id)); setActiveId(null); }}
                            className="bg-red-500 p-1 rounded text-white shadow-lg"><Trash2 size={10} /></button>
                        </div>
                      )}
                      
                      <input 
                        autoFocus={activeId === t.id} 
                        type="text" 
                        value={t.text} 
                        onChange={(e) => setPlacedTexts(prev => prev.map(pt => pt.id === t.id ? {...pt, text: e.target.value} : pt))} 
                        className="bg-transparent border-none outline-none text-black font-bold p-0 m-0 w-full" 
                        style={{ fontSize: `${t.size}px`, lineHeight: 1.0, width: `${(t.text.length || 1) + 1}ch` }} 
                      />
                    </div>
                  ))}
                  </div>
                </div>
              </div>

              <button onClick={finalizeAndDownload} className="w-full bg-[#39FF14] text-black font-black py-4 md:py-5 rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-[0.98] uppercase tracking-[0.2em] text-[10px] shadow-[0_10px_30px_rgba(57,255,20,0.2)]">
                {isAnalyzing ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
                <span>Save & Download PDF</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <footer className="relative z-10 flex flex-col items-center shrink-0">
        <p className="text-[10px] font-medium tracking-[0.1em] text-gray-600 mb-3">Powered by deVee Boutique Label</p>
        <div className="h-10 w-10 rounded-full overflow-hidden border border-white/10 shadow-lg">
          <Image src="/label_logo.jpg" alt="deVee" width={40} height={40} className="object-cover" />
        </div>
      </footer>
    </main>
  );
}