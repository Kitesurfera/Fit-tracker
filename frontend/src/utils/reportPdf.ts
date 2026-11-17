// Convierte el informe (HTML) en un PDF de verdad, en el propio navegador, sin ventanas nuevas ni "Imprimir".
// Las librerías (html2canvas y jsPDF) se cargan solo al pulsar el botón, para no hacer más lenta la app.

const A4_W_PT = 595.28;
const A4_H_PT = 841.89;
const PAGE_W_PX = 794;                                  // ancho del informe al hacer la "foto" (A4 a 96 ppp)
const PAGE_H_PX = Math.floor(PAGE_W_PX * A4_H_PT / A4_W_PT);
const MARGIN_PX = 26;                                   // margen arriba y abajo de cada página
const FOOTER_PX = 14;

const nextFrame = () => new Promise(r => requestAnimationFrame(() => r(null)));

// Carga el informe en un marco invisible del ancho de un A4
async function renderOffscreen(html: string): Promise<{ frame: HTMLIFrameElement; doc: Document }> {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  Object.assign(frame.style, { position: 'fixed', left: '-10000px', top: '0', width: `${PAGE_W_PX}px`, height: `${PAGE_H_PX}px`, border: '0', opacity: '0', pointerEvents: 'none' });
  const loaded = new Promise<void>(resolve => { frame.onload = () => resolve(); });
  frame.srcdoc = html;
  document.body.appendChild(frame);
  await Promise.race([loaded, new Promise(r => setTimeout(r, 4000))]);
  const doc = frame.contentDocument!;
  try { await (doc as any).fonts?.ready; } catch {}
  await nextFrame();
  return { frame, doc };
}

// Dónde se puede cortar la página sin partir nada por la mitad: final de cada bloque y, si un bloque es
// muy largo (p. ej. la lista de sesiones), final de cada fila
function breakPoints(root: HTMLElement) {
  const top = root.getBoundingClientRect().top;
  const bottoms = (selector: string) => Array.from(root.querySelectorAll(selector))
    .map(el => Math.ceil((el as HTMLElement).getBoundingClientRect().bottom - top))
    .sort((a, b) => a - b);
  return { blocks: bottoms('[data-block]'), fine: bottoms('[data-block] tr, [data-block] li, [data-block] p, [data-block] .kpis, [data-block] h2, [data-block] .chip, [data-block] svg, [data-block] .legend') };
}

function planPages(total: number, pts: { blocks: number[]; fine: number[] }) {
  const usable = PAGE_H_PX - MARGIN_PX * 2 - FOOTER_PX;
  const pages: [number, number][] = [];
  let start = 0;
  while (start < total - 2) {
    const limit = start + usable;
    let end = total;
    if (limit < total) {
      const best = (list: number[], min: number) => [...list].reverse().find(b => b <= limit && b - start >= min);
      end = best(pts.blocks, usable * 0.5) ?? best(pts.fine, usable * 0.25) ?? limit;
    }
    pages.push([start, end]);
    start = end;
  }
  return pages;
}

export async function buildReportPdf(html: string): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf/dist/jspdf.es.min.js')]);
  const { frame, doc } = await renderOffscreen(html);
  try {
    const root = (doc.querySelector('.page') as HTMLElement) || doc.body;
    const total = Math.ceil(root.getBoundingClientRect().height);
    frame.style.height = `${total + 40}px`;
    await nextFrame();
    const pages = planPages(total, breakPoints(root));
    const scale = Math.min(2, (window.devicePixelRatio || 1) * 1.5);
    const canvas = await html2canvas(root, { scale, backgroundColor: '#f8fafc', useCORS: true, logging: false, windowWidth: PAGE_W_PX });
    const k = canvas.width / root.getBoundingClientRect().width;  // píxeles de la foto por píxel del informe
    const ptPerPx = A4_W_PT / PAGE_W_PX;

    const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    pages.forEach(([start, end], i) => {
      if (i > 0) pdf.addPage();
      pdf.setFillColor(248, 250, 252);
      pdf.rect(0, 0, A4_W_PT, A4_H_PT, 'F');
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = Math.max(1, Math.round((end - start) * k));
      const g = slice.getContext('2d')!;
      g.fillStyle = '#f8fafc';
      g.fillRect(0, 0, slice.width, slice.height);
      g.drawImage(canvas, 0, Math.round(start * k), canvas.width, slice.height, 0, 0, slice.width, slice.height);
      const offsetX = (PAGE_W_PX - root.getBoundingClientRect().width) / 2;
      pdf.addImage(slice.toDataURL('image/jpeg', 0.9), 'JPEG', offsetX * ptPerPx, MARGIN_PX * ptPerPx, (slice.width / k) * ptPerPx, (end - start) * ptPerPx, undefined, 'FAST');
      pdf.setFontSize(8);
      pdf.setTextColor(148, 163, 184);
      pdf.text(`Página ${i + 1} de ${pages.length}`, A4_W_PT / 2, A4_H_PT - 16, { align: 'center' });
    });
    return pdf.output('blob');
  } finally {
    frame.remove();
  }
}

// En móviles (iPhone/Android) se abre el menú "Compartir" del sistema (Guardar en Archivos, WhatsApp, Mail…);
// en el ordenador se descarga. Así nunca se sale de la app.
export const prefersShareSheet = () => {
  try {
    const coarse = window.matchMedia?.('(pointer: coarse)').matches;
    const probe = new File([new Blob(['x'], { type: 'application/pdf' })], 'x.pdf', { type: 'application/pdf' });
    return !!coarse && typeof navigator.canShare === 'function' && navigator.canShare({ files: [probe] });
  } catch { return false; }
};

export type DeliverResult = 'shared' | 'cancelled' | 'downloaded' | 'needs-tap';

export async function deliverPdf(blob: Blob, fileName: string, title: string): Promise<DeliverResult> {
  if (prefersShareSheet()) {
    const file = new File([blob], fileName, { type: 'application/pdf' });
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (e: any) {
      if (e?.name === 'AbortError') return 'cancelled';
      // El navegador solo deja abrir "Compartir" justo después de un toque: si el PDF tardó, hace falta otro toque
      if (e?.name === 'NotAllowedError') return 'needs-tap';
      throw e;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'downloaded';
}
