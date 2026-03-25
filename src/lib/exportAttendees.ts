import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Attendee {
  id: string;
  org_type: string | null;
  organization: string;
  department: string | null;
  position: string | null;
  name: string;
  phone: string | null;
  car_number: string | null;
  inquiry: string | null;
  signature_url: string;
  checked_in_at: string | null;
}

interface EventData {
  title: string;
  event_date: string;
  start_time: string;
  end_time: string;
  location: string;
  organizer: string;
}

interface AllAttendeeRow {
  id: string;
  org_type?: string | null;
  organization: string;
  department?: string | null;
  position: string | null;
  name: string;
  phone?: string | null;
  car_number?: string | null;
  checked_in_at: string | null;
  event_title: string;
  event_date: string;
}

interface ExportOptions {
  showCarNumber?: boolean;
}

const formatTime = (t: string) => t?.slice(0, 5) || '';
const formatCheckedIn = (d: string | null) =>
  d ? new Date(d).toLocaleString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '-';

async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

async function fetchImageAsBuffer(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url);
    return await res.arrayBuffer();
  } catch { return null; }
}

// ─── Excel Export (Single Event) ───────────────────────────────

export async function exportToExcel(event: EventData, attendees: Attendee[], opts: ExportOptions = {}) {
  const showCar = opts.showCarNumber ?? false;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('참석확인부');

  const sigColWidth = 30;
  const colWidths = showCar
    ? [{ width: 6 }, { width: 10 }, { width: 18 }, { width: 16 }, { width: 10 }, { width: 12 }, { width: 14 }, { width: sigColWidth }, { width: 14 }]
    : [{ width: 6 }, { width: 10 }, { width: 20 }, { width: 18 }, { width: 12 }, { width: 14 }, { width: sigColWidth }, { width: 14 }];
  ws.columns = colWidths;
  const totalCols = colWidths.length;
  const lastColLetter = String.fromCharCode(64 + totalCols);

  const headerFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
  const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FF1F2937' }, size: 10 };
  const borderThin: Partial<ExcelJS.Borders> = {
    top: { style: 'thin' }, bottom: { style: 'thin' },
    left: { style: 'thin' }, right: { style: 'thin' },
  };

  ws.mergeCells(`A1:${lastColLetter}1`);
  const titleCell = ws.getCell('A1');
  titleCell.value = '참석확인부';
  titleCell.font = { bold: true, size: 18 };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 36;

  const infoRows = [
    ['행사명', event.title],
    ['일  시', `${event.event_date}  ${formatTime(event.start_time)} ~ ${formatTime(event.end_time)}`],
    ['장  소', event.location],
    ['주관부서', event.organizer],
  ];
  infoRows.forEach((r, i) => {
    const row = ws.getRow(i + 2);
    row.getCell(1).value = r[0];
    row.getCell(1).font = { bold: true, size: 10 };
    ws.mergeCells(i + 2, 2, i + 2, totalCols);
    row.getCell(2).value = r[1];
    row.getCell(2).font = { size: 10 };
  });

  const headers = showCar
    ? ['번호', '구분', '기관명', '부서', '직급', '성명', '차량번호', '서명', '등록시각']
    : ['번호', '구분', '기관명', '부서', '직급', '성명', '서명', '등록시각'];
  const headerRow = ws.getRow(7);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = borderThin;
  });
  headerRow.height = 24;

  const sigColIndex = showCar ? 7 : 6; // 0-based col for image placement

  for (let idx = 0; idx < attendees.length; idx++) {
    const a = attendees[idx];
    const rowNum = idx + 8;
    const row = ws.getRow(rowNum);
    const rowHeight = 55;
    row.height = rowHeight;

    const vals = showCar
      ? [idx + 1, a.org_type || '-', a.organization, a.department || '-', a.position || '-', a.name, a.car_number || '-', '', formatCheckedIn(a.checked_in_at)]
      : [idx + 1, a.org_type || '-', a.organization, a.department || '-', a.position || '-', a.name, '', formatCheckedIn(a.checked_in_at)];
    vals.forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = v;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = borderThin;
      cell.font = { size: 10 };
    });

    if (a.signature_url) {
      try {
        const isDataUrl = a.signature_url.startsWith('data:');
        let buf: ArrayBuffer | null = null;
        if (isDataUrl) {
          const base64 = a.signature_url.split(',')[1];
          const binaryStr = atob(base64);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
          buf = bytes.buffer;
        } else {
          buf = await fetchImageAsBuffer(a.signature_url);
        }
        if (buf) {
          const imgId = wb.addImage({ buffer: buf, extension: 'png' });
          const imgWidthPx = (sigColWidth - 2) * 7.5;
          const imgHeightPx = (rowHeight - 6) * 1.33;
          ws.addImage(imgId, {
            tl: { col: sigColIndex + 0.05, row: rowNum - 0.93 } as any,
            ext: { width: imgWidthPx, height: imgHeightPx },
          });
        }
      } catch { /* skip */ }
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  const fileName = `참석확인부_${event.title}_${event.event_date}.xlsx`;
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName);
}

// ─── PDF Export (Single Event) ─────────────────────────────────

let fontLoadedPromise: Promise<ArrayBuffer> | null = null;

function loadNotoSansKR(): Promise<ArrayBuffer> {
  if (!fontLoadedPromise) {
    fontLoadedPromise = fetch(
      'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosanskr/NotoSansKR%5Bwght%5D.ttf'
    ).then((r) => {
      if (!r.ok) throw new Error('Font fetch failed');
      return r.arrayBuffer();
    });
  }
  return fontLoadedPromise;
}

export async function exportToPDF(event: EventData, attendees: Attendee[], opts: ExportOptions = {}) {
  const showCar = opts.showCarNumber ?? false;
  const fontBuffer = await loadNotoSansKR();
  const fontBase64 = btoa(
    new Uint8Array(fontBuffer).reduce((s, b) => s + String.fromCharCode(b), '')
  );

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.addFileToVFS('NotoSansKR-Regular.ttf', fontBase64);
  doc.addFont('NotoSansKR-Regular.ttf', 'NotoSansKR', 'normal');
  doc.setFont('NotoSansKR');

  const sigImages: (string | null)[] = await Promise.all(
    attendees.map((a) => (a.signature_url ? fetchImageAsBase64(a.signature_url) : Promise.resolve(null)))
  );

  const pageWidth = doc.internal.pageSize.getWidth();

  const drawHeader = () => {
    doc.setFontSize(20);
    doc.text('참석확인부', pageWidth / 2, 20, { align: 'center' });
    doc.setFontSize(10);
    const info = [
      `행사명: ${event.title}`,
      `일  시: ${event.event_date}  ${formatTime(event.start_time)} ~ ${formatTime(event.end_time)}`,
      `장  소: ${event.location}`,
      `주관부서: ${event.organizer}`,
    ];
    info.forEach((line, i) => { doc.text(line, 20, 30 + i * 6); });
  };

  drawHeader();

  const bodyData = attendees.map((a, i) => [
    String(i + 1), a.org_type || '-', a.organization, a.department || '-',
    a.position || '-', a.name, a.car_number || '-', '', formatCheckedIn(a.checked_in_at),
  ]);

  autoTable(doc, {
    startY: 56,
    head: [['번호', '구분', '기관명', '부서', '직급', '성명', '차량번호', '서명', '등록시각']],
    body: bodyData,
    styles: { font: 'NotoSansKR', fontSize: 9, cellPadding: 3, valign: 'middle', halign: 'center', minCellHeight: 14 },
    headStyles: { fillColor: [229, 231, 235], textColor: [31, 41, 55], fontStyle: 'normal', minCellHeight: 10 },
    columnStyles: {
      0: { cellWidth: 10 }, 1: { cellWidth: 16 }, 2: { cellWidth: 30 }, 3: { cellWidth: 28 },
      4: { cellWidth: 18 }, 5: { cellWidth: 20 }, 6: { cellWidth: 24 }, 7: { cellWidth: 36 }, 8: { cellWidth: 22 },
    },
    didDrawCell: (data) => {
      if (data.section === 'body' && data.column.index === 7) {
        const sig = sigImages[data.row.index];
        if (sig) {
          try {
            const imgW = data.cell.width - 4;
            const imgH = data.cell.height - 3;
            doc.addImage(sig, 'PNG', data.cell.x + 2, data.cell.y + 1.5, imgW, imgH);
          } catch { /* skip */ }
        }
      }
    },
    didDrawPage: (data) => {
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setFont('NotoSansKR');
      doc.text(`${data.pageNumber} / ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });
      if (data.pageNumber > 1) { doc.setFont('NotoSansKR'); drawHeader(); }
    },
    margin: { top: 56, bottom: 20 },
  });

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('NotoSansKR');
    doc.setFillColor(255, 255, 255);
    doc.rect(0, doc.internal.pageSize.getHeight() - 15, pageWidth, 15, 'F');
    doc.text(`${i} / ${totalPages}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });
  }

  const fileName = `참석확인부_${event.title}_${event.event_date}.pdf`;
  doc.save(fileName);
}

// ─── Excel Export (All Attendees) ──────────────────────────────

export async function exportAllAttendeesToExcel(attendees: AllAttendeeRow[]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('참석자 현황');

  ws.columns = [
    { width: 6 }, { width: 22 }, { width: 14 }, { width: 10 }, { width: 18 },
    { width: 14 }, { width: 12 }, { width: 10 }, { width: 14 }, { width: 16 },
  ];

  const headerFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
  const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FF1F2937' }, size: 10 };
  const borderThin: Partial<ExcelJS.Borders> = {
    top: { style: 'thin' }, bottom: { style: 'thin' },
    left: { style: 'thin' }, right: { style: 'thin' },
  };

  ws.mergeCells('A1:J1');
  const titleCell = ws.getCell('A1');
  titleCell.value = '참석자 현황';
  titleCell.font = { bold: true, size: 18 };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 36;

  ws.mergeCells('A2:J2');
  ws.getCell('A2').value = `총 ${attendees.length}명`;
  ws.getCell('A2').font = { size: 10 };
  ws.getCell('A2').alignment = { horizontal: 'right' };

  const headers = ['번호', '행사', '날짜', '구분', '기관명', '부서', '성명', '직급', '차량번호', '등록시간'];
  const headerRow = ws.getRow(4);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = borderThin;
  });
  headerRow.height = 24;

  attendees.forEach((a, idx) => {
    const row = ws.getRow(idx + 5);
    const vals = [
      idx + 1, a.event_title, a.event_date, a.org_type || '-', a.organization,
      a.department || '-', a.name, a.position || '-', a.car_number || '-',
      a.checked_in_at
        ? new Date(a.checked_in_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '-',
    ];
    vals.forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = v;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = borderThin;
      cell.font = { size: 10 };
    });
  });

  const buffer = await wb.xlsx.writeBuffer();
  const today = new Date().toISOString().slice(0, 10);
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `참석자현황_${today}.xlsx`);
}

// ─── PDF Export (All Attendees) ────────────────────────────────

export async function exportAllAttendeesToPDF(attendees: AllAttendeeRow[]) {
  const fontBuffer = await loadNotoSansKR();
  const fontBase64 = btoa(
    new Uint8Array(fontBuffer).reduce((s, b) => s + String.fromCharCode(b), '')
  );

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.addFileToVFS('NotoSansKR-Regular.ttf', fontBase64);
  doc.addFont('NotoSansKR-Regular.ttf', 'NotoSansKR', 'normal');
  doc.setFont('NotoSansKR');

  const pageWidth = doc.internal.pageSize.getWidth();

  const drawHeader = () => {
    doc.setFontSize(20);
    doc.text('참석자 현황', pageWidth / 2, 18, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`총 ${attendees.length}명`, pageWidth - 20, 18, { align: 'right' });
  };

  drawHeader();

  const bodyData = attendees.map((a, i) => [
    String(i + 1), a.event_title, a.event_date, a.org_type || '-', a.organization,
    a.department || '-', a.name, a.position || '-', a.car_number || '-',
    a.checked_in_at
      ? new Date(a.checked_in_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '-',
  ]);

  autoTable(doc, {
    startY: 26,
    head: [['번호', '행사', '날짜', '구분', '기관명', '부서', '성명', '직급', '차량번호', '등록시간']],
    body: bodyData,
    styles: { font: 'NotoSansKR', fontSize: 8, cellPadding: 2, valign: 'middle', halign: 'center' },
    headStyles: { fillColor: [229, 231, 235], textColor: [31, 41, 55], fontStyle: 'normal' },
    columnStyles: {
      0: { cellWidth: 10 }, 1: { cellWidth: 40 }, 2: { cellWidth: 22 }, 3: { cellWidth: 14 },
      4: { cellWidth: 30 }, 5: { cellWidth: 24 }, 6: { cellWidth: 20 }, 7: { cellWidth: 16 },
      8: { cellWidth: 22 }, 9: { cellWidth: 26 },
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) { doc.setFont('NotoSansKR'); drawHeader(); }
    },
    margin: { top: 26, bottom: 20 },
  });

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('NotoSansKR');
    doc.setFillColor(255, 255, 255);
    doc.rect(0, doc.internal.pageSize.getHeight() - 15, pageWidth, 15, 'F');
    doc.text(`${i} / ${totalPages}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });
  }

  const today = new Date().toISOString().slice(0, 10);
  doc.save(`참석자현황_${today}.pdf`);
}
