import jsPDF from 'jspdf';

let fontLoadedPromise: Promise<ArrayBuffer> | null = null;

function loadNotoSansKR(): Promise<ArrayBuffer> {
  if (!fontLoadedPromise) {
    fontLoadedPromise = fetch(
      'https://fonts.gstatic.com/s/notosanskr/v36/PbyxFmXiEBPT4ITbgNA5Cgms3VYcOA4oBGQhejE.ttf'
    ).then((r) => {
      if (!r.ok) throw new Error('Font fetch failed');
      return r.arrayBuffer();
    });
  }
  return fontLoadedPromise;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  return btoa(new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), ''));
}

// Convert an SVG element to a high-res PNG data URL via canvas
function svgToDataUrl(svgElement: SVGSVGElement, size: number): Promise<string> {
  return new Promise((resolve) => {
    const svgData = new XMLSerializer().serializeToString(svgElement);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgData)))}`;
  });
}

interface PosterEvent {
  title: string;
  event_date: string;
  start_time: string;
  end_time: string;
  location: string;
  access_code: string;
}

export async function downloadQRPoster(event: PosterEvent, qrSvg: SVGSVGElement) {
  const fontBuffer = await loadNotoSansKR();
  const fontBase64 = arrayBufferToBase64(fontBuffer);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.addFileToVFS('NotoSansKR-Regular.ttf', fontBase64);
  doc.addFont('NotoSansKR-Regular.ttf', 'NotoSansKR', 'normal');
  doc.setFont('NotoSansKR');

  const pw = doc.internal.pageSize.getWidth();  // 210
  const ph = doc.internal.pageSize.getHeight(); // 297

  // Background
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pw, ph, 'F');

  // Top accent line
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, pw, 4, 'F');

  // Title
  doc.setFontSize(28);
  doc.setTextColor(30, 30, 30);
  doc.text(event.title, pw / 2, 45, { align: 'center' });

  // Date / time / location
  doc.setFontSize(14);
  doc.setTextColor(100, 100, 100);
  const timeStr = `${event.event_date}  ${event.start_time?.slice(0, 5)} ~ ${event.end_time?.slice(0, 5)}`;
  doc.text(timeStr, pw / 2, 58, { align: 'center' });
  doc.text(event.location, pw / 2, 67, { align: 'center' });

  // QR Code (centered, large)
  const qrDataUrl = await svgToDataUrl(qrSvg, 800);
  const qrSize = 100;
  doc.addImage(qrDataUrl, 'PNG', (pw - qrSize) / 2, 85, qrSize, qrSize);

  // Instructions
  doc.setFontSize(18);
  doc.setTextColor(37, 99, 235);
  doc.text('스마트폰 카메라로 QR코드를 스캔하여', pw / 2, 205, { align: 'center' });
  doc.text('참석 등록해주세요', pw / 2, 215, { align: 'center' });

  // Sub instruction
  doc.setFontSize(11);
  doc.setTextColor(140, 140, 140);
  doc.text('카메라 앱으로 위 QR코드를 비추면 참석 등록 페이지로 이동합니다.', pw / 2, 230, { align: 'center' });

  // Access code
  doc.setFontSize(12);
  doc.setTextColor(100, 100, 100);
  doc.text(`접속코드: ${event.access_code}`, pw / 2, 248, { align: 'center' });

  // Bottom accent line
  doc.setFillColor(37, 99, 235);
  doc.rect(0, ph - 4, pw, 4, 'F');

  doc.save(`QR포스터_${event.title}_${event.event_date}.pdf`);
}

export async function downloadQRImage(qrSvg: SVGSVGElement, accessCode: string) {
  const dataUrl = await svgToDataUrl(qrSvg, 512);
  const a = document.createElement('a');
  a.download = `QR_${accessCode}.png`;
  a.href = dataUrl;
  a.click();
}
