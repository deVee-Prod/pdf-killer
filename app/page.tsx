"use client";
import { useState } from 'react';
import dynamic from 'next/dynamic';

const PDFKillerApp = dynamic(() => import('./pdf-killer-app'), { ssr: false });

export default function Page() {
  const [entered, setEntered] = useState(false);

  if (!entered) {
    return (
      <main style={{
        minHeight: '100dvh', color: '#fff',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '24px'
      }}>
        <img src="/logo.png" alt="PDF Killer" style={{ width: 80, height: 80, objectFit: 'contain' }} />
        <h1 className="text-[10px] font-bold tracking-[0.5em] uppercase text-white/60">
          PDF Killer
        </h1>
        <button
          onClick={() => setEntered(true)}
          style={{
            marginTop: '8px',
            padding: '14px 48px',
            background: 'transparent',
            border: '1px solid rgba(57,255,20,0.3)',
            color: '#39FF14',
            borderRadius: '16px',
            fontSize: '10px',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          Enter
        </button>
      </main>
    );
  }

  return <PDFKillerApp />;
}
