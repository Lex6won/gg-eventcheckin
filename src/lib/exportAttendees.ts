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

// Row used for "신청자/참석자" lists (status-aware)
export interface RosterAttendee {
  id: string;
  org_type: string | null;
  organization: string;
  department: string | null;
  position: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  car_number: string | null;
  signature_url: string | null;
  status: string;
  registered_at: string | null;
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

export interface TraineeRow {
  id: string;
  org_type: string | null;
  organization: string;
  department: string | null;
  position: string | null;
  name: string;
  email?: string | null;
  car_number: string | null;
  signature_url: string;
  status: string;
  registered_at: string;
  confirmed_at: string | null;
}

export interface TrainingExportData {
  title: string;
  event_date: string;
  start_time: string;
  end_time: string;
  location: string;
  organizer: string;
  instructor?: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  confirmed: '확정',
  waitlisted: '대기',
  cancelled: '취소',
};

const formatRegisteredAt = (t: TraineeRow) => {
  const d = t.confirmed_at || t.registered_at;
  return d ? new Date(d).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
};

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

  const sigColIdx = showCar ? 7 : 6;

  const bodyData = attendees.map((a, i) => showCar
    ? [String(i + 1), a.org_type || '-', a.organization, a.department || '-', a.position || '-', a.name, a.car_number || '-', '', formatCheckedIn(a.checked_in_at)]
    : [String(i + 1), a.org_type || '-', a.organization, a.department || '-', a.position || '-', a.name, '', formatCheckedIn(a.checked_in_at)]
  );

  const pdfHeaders = showCar
    ? [['번호', '구분', '기관명', '부서', '직급', '성명', '차량번호', '서명', '등록시각']]
    : [['번호', '구분', '기관명', '부서', '직급', '성명', '서명', '등록시각']];

  const pdfColStyles = showCar
    ? { 0: { cellWidth: 10 }, 1: { cellWidth: 16 }, 2: { cellWidth: 30 }, 3: { cellWidth: 28 }, 4: { cellWidth: 18 }, 5: { cellWidth: 20 }, 6: { cellWidth: 24 }, 7: { cellWidth: 36 }, 8: { cellWidth: 22 } }
    : { 0: { cellWidth: 10 }, 1: { cellWidth: 18 }, 2: { cellWidth: 36 }, 3: { cellWidth: 32 }, 4: { cellWidth: 20 }, 5: { cellWidth: 22 }, 6: { cellWidth: 40 }, 7: { cellWidth: 26 } };

  autoTable(doc, {
    startY: 56,
    head: pdfHeaders,
    body: bodyData,
    styles: { font: 'NotoSansKR', fontSize: 9, cellPadding: 3, valign: 'middle', halign: 'center', minCellHeight: 14 },
    headStyles: { fillColor: [229, 231, 235], textColor: [31, 41, 55], fontStyle: 'normal', minCellHeight: 10 },
    columnStyles: pdfColStyles as any,
    didDrawCell: (data) => {
      if (data.section === 'body' && data.column.index === sigColIdx) {
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

// ─── Excel Export (Trainees) ───────────────────────────────────

export async function exportTraineesToExcel(training: TrainingExportData, trainees: TraineeRow[], opts: ExportOptions = {}) {
  const showCar = opts.showCarNumber ?? false;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('교육신청자명단');

  const sigColWidth = 30;
  const baseCols = [
    { width: 6 }, { width: 8 }, { width: 10 }, { width: 20 }, { width: 16 },
    { width: 12 }, { width: 14 },
  ];
  const colWidths = showCar
    ? [...baseCols, { width: 12 }, { width: sigColWidth }, { width: 16 }]
    : [...baseCols, { width: sigColWidth }, { width: 16 }];
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
  titleCell.value = '교육 신청자 명단';
  titleCell.font = { bold: true, size: 18 };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 36;

  const infoRows: [string, string][] = [
    ['교육명', training.title],
    ['일  시', `${training.event_date}  ${formatTime(training.start_time)} ~ ${formatTime(training.end_time)}`],
    ['장  소', training.location],
    ['주관부서', training.organizer + (training.instructor ? `  ·  강사: ${training.instructor}` : '')],
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
    ? ['번호', '상태', '구분', '기관명', '부서', '직급', '성명', '차량번호', '서명', '등록시각']
    : ['번호', '상태', '구분', '기관명', '부서', '직급', '성명', '서명', '등록시각'];
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

  const sigColIndex = showCar ? 8 : 7;

  for (let idx = 0; idx < trainees.length; idx++) {
    const t = trainees[idx];
    const rowNum = idx + 8;
    const row = ws.getRow(rowNum);
    const rowHeight = 55;
    row.height = rowHeight;

    const vals = showCar
      ? [idx + 1, STATUS_LABEL[t.status] || t.status, t.org_type || '-', t.organization, t.department || '-', t.position || '-', t.name, t.car_number || '-', '', formatRegisteredAt(t)]
      : [idx + 1, STATUS_LABEL[t.status] || t.status, t.org_type || '-', t.organization, t.department || '-', t.position || '-', t.name, '', formatRegisteredAt(t)];
    vals.forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = v;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = borderThin;
      cell.font = { size: 10 };
    });

    if (t.signature_url) {
      try {
        const isDataUrl = t.signature_url.startsWith('data:');
        let buf: ArrayBuffer | null = null;
        if (isDataUrl) {
          const base64 = t.signature_url.split(',')[1];
          const binaryStr = atob(base64);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
          buf = bytes.buffer;
        } else {
          buf = await fetchImageAsBuffer(t.signature_url);
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
  const fileName = `교육신청자명단_${training.title}_${training.event_date}.xlsx`;
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName);
}

// ─── PDF Export (Trainees) ─────────────────────────────────────

export async function exportTraineesToPDF(training: TrainingExportData, trainees: TraineeRow[], opts: ExportOptions = {}) {
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
    trainees.map((t) => (t.signature_url ? fetchImageAsBase64(t.signature_url) : Promise.resolve(null)))
  );

  const pageWidth = doc.internal.pageSize.getWidth();

  const drawHeader = () => {
    doc.setFontSize(20);
    doc.text('교육 신청자 명단', pageWidth / 2, 20, { align: 'center' });
    doc.setFontSize(10);
    const info = [
      `교육명: ${training.title}`,
      `일  시: ${training.event_date}  ${formatTime(training.start_time)} ~ ${formatTime(training.end_time)}`,
      `장  소: ${training.location}`,
      `주관부서: ${training.organizer}${training.instructor ? `  ·  강사: ${training.instructor}` : ''}`,
    ];
    info.forEach((line, i) => { doc.text(line, 20, 30 + i * 6); });
  };

  drawHeader();

  const sigColIdx = showCar ? 8 : 7;

  const bodyData = trainees.map((t, i) => showCar
    ? [String(i + 1), STATUS_LABEL[t.status] || t.status, t.org_type || '-', t.organization, t.department || '-', t.position || '-', t.name, t.car_number || '-', '', formatRegisteredAt(t)]
    : [String(i + 1), STATUS_LABEL[t.status] || t.status, t.org_type || '-', t.organization, t.department || '-', t.position || '-', t.name, '', formatRegisteredAt(t)]
  );

  const pdfHeaders = showCar
    ? [['번호', '상태', '구분', '기관명', '부서', '직급', '성명', '차량번호', '서명', '등록시각']]
    : [['번호', '상태', '구분', '기관명', '부서', '직급', '성명', '서명', '등록시각']];

  const pdfColStyles = showCar
    ? { 0: { cellWidth: 10 }, 1: { cellWidth: 14 }, 2: { cellWidth: 14 }, 3: { cellWidth: 28 }, 4: { cellWidth: 26 }, 5: { cellWidth: 16 }, 6: { cellWidth: 20 }, 7: { cellWidth: 22 }, 8: { cellWidth: 36 }, 9: { cellWidth: 24 } }
    : { 0: { cellWidth: 10 }, 1: { cellWidth: 14 }, 2: { cellWidth: 16 }, 3: { cellWidth: 34 }, 4: { cellWidth: 30 }, 5: { cellWidth: 18 }, 6: { cellWidth: 22 }, 7: { cellWidth: 40 }, 8: { cellWidth: 26 } };

  autoTable(doc, {
    startY: 56,
    head: pdfHeaders,
    body: bodyData,
    styles: { font: 'NotoSansKR', fontSize: 9, cellPadding: 3, valign: 'middle', halign: 'center', minCellHeight: 14 },
    headStyles: { fillColor: [229, 231, 235], textColor: [31, 41, 55], fontStyle: 'normal', minCellHeight: 10 },
    columnStyles: pdfColStyles as any,
    didDrawCell: (data) => {
      if (data.section === 'body' && data.column.index === sigColIdx) {
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

  const fileName = `교육신청자명단_${training.title}_${training.event_date}.pdf`;
  doc.save(fileName);
}

// ─── Helpers for Applicants/Attendees lists ───────────────────

const ATT_STATUS_LABEL: Record<string, string> = {
  registered: '신청',
  checked_in: '참석',
  walk_in: '현장등록',
  confirmed: '참석',
};

const fmtDateTime = (d: string | null) =>
  d ? new Date(d).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';

function commonHeader(ws: ExcelJS.Worksheet, title: string, info: [string, string][], totalCols: number) {
  const lastColLetter = String.fromCharCode(64 + totalCols);
  ws.mergeCells(`A1:${lastColLetter}1`);
  const titleCell = ws.getCell('A1');
  titleCell.value = title;
  titleCell.font = { bold: true, size: 18 };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 36;
  info.forEach((r, i) => {
    const row = ws.getRow(i + 2);
    row.getCell(1).value = r[0];
    row.getCell(1).font = { bold: true, size: 10 };
    ws.mergeCells(i + 2, 2, i + 2, totalCols);
    row.getCell(2).value = r[1];
    row.getCell(2).font = { size: 10 };
  });
}

const headerFillStyle: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
const headerFontStyle: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FF1F2937' }, size: 10 };
const borderThinStyle: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' }, bottom: { style: 'thin' },
  left: { style: 'thin' }, right: { style: 'thin' },
};

// ─── 신청자 명부 (Applicants) ─ Excel ─────────────────────────
// Includes only pre-registered people (status in registered/checked_in/confirmed).
// No signature column. Shows registered_at + status.
export async function exportApplicantsToExcel(
  event: EventData,
  rows: RosterAttendee[],
  opts: { showCarNumber?: boolean; kind?: '행사' | '교육' } = {}
) {
  const showCar = opts.showCarNumber ?? false;
  const kind = opts.kind ?? '행사';
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('신청자명부');

  const cols = showCar
    ? [{ width: 6 }, { width: 8 }, { width: 10 }, { width: 20 }, { width: 16 }, { width: 10 }, { width: 12 }, { width: 24 }, { width: 12 }, { width: 16 }]
    : [{ width: 6 }, { width: 8 }, { width: 10 }, { width: 22 }, { width: 18 }, { width: 10 }, { width: 12 }, { width: 26 }, { width: 16 }];
  ws.columns = cols;
  commonHeader(ws, `${kind} 신청자 명부`, [
    [`${kind}명`, event.title],
    ['일  시', `${event.event_date}  ${formatTime(event.start_time)} ~ ${formatTime(event.end_time)}`],
    ['장  소', event.location],
    ['주관부서', event.organizer],
    ['신청 인원', `${rows.length}명`],
  ], cols.length);

  const headers = showCar
    ? ['번호', '상태', '구분', '기관명', '부서', '직급', '성명', '이메일', '차량번호', '신청일시']
    : ['번호', '상태', '구분', '기관명', '부서', '직급', '성명', '이메일', '신청일시'];
  const headerRow = ws.getRow(8);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h; cell.fill = headerFillStyle; cell.font = headerFontStyle;
    cell.alignment = { horizontal: 'center', vertical: 'middle' }; cell.border = borderThinStyle;
  });
  headerRow.height = 24;

  rows.forEach((r, idx) => {
    const row = ws.getRow(idx + 9);
    const vals = showCar
      ? [idx + 1, ATT_STATUS_LABEL[r.status] ?? r.status, r.org_type || '-', r.organization, r.department || '-', r.position || '-', r.name, r.email || '-', r.car_number || '-', fmtDateTime(r.registered_at)]
      : [idx + 1, ATT_STATUS_LABEL[r.status] ?? r.status, r.org_type || '-', r.organization, r.department || '-', r.position || '-', r.name, r.email || '-', fmtDateTime(r.registered_at)];
    vals.forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = v; cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = borderThinStyle; cell.font = { size: 10 };
    });
  });

  const buffer = await wb.xlsx.writeBuffer();
  const fileName = `${kind}_신청자명부_${event.title}_${event.event_date}.xlsx`;
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName);
}

// ─── 신청자 명부 (Applicants) ─ PDF ───────────────────────────
export async function exportApplicantsToPDF(
  event: EventData,
  rows: RosterAttendee[],
  opts: { showCarNumber?: boolean; kind?: '행사' | '교육' } = {}
) {
  const showCar = opts.showCarNumber ?? false;
  const kind = opts.kind ?? '행사';
  const fontBuffer = await loadNotoSansKR();
  const fontBase64 = btoa(new Uint8Array(fontBuffer).reduce((s, b) => s + String.fromCharCode(b), ''));
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.addFileToVFS('NotoSansKR-Regular.ttf', fontBase64);
  doc.addFont('NotoSansKR-Regular.ttf', 'NotoSansKR', 'normal');
  doc.setFont('NotoSansKR');
  const pageWidth = doc.internal.pageSize.getWidth();

  const drawHeader = () => {
    doc.setFontSize(20);
    doc.text(`${kind} 신청자 명부`, pageWidth / 2, 18, { align: 'center' });
    doc.setFontSize(10);
    [
      `${kind}명: ${event.title}`,
      `일  시: ${event.event_date}  ${formatTime(event.start_time)} ~ ${formatTime(event.end_time)}`,
      `장  소: ${event.location}`,
      `주관부서: ${event.organizer}    신청 인원: ${rows.length}명`,
    ].forEach((line, i) => doc.text(line, 14, 28 + i * 5.5));
  };
  drawHeader();

  const head = showCar
    ? [['번호', '상태', '구분', '기관명', '부서', '직급', '성명', '이메일', '차량', '신청일시']]
    : [['번호', '상태', '구분', '기관명', '부서', '직급', '성명', '이메일', '신청일시']];
  const body = rows.map((r, i) => showCar
    ? [String(i + 1), ATT_STATUS_LABEL[r.status] ?? r.status, r.org_type || '-', r.organization, r.department || '-', r.position || '-', r.name, r.email || '-', r.car_number || '-', fmtDateTime(r.registered_at)]
    : [String(i + 1), ATT_STATUS_LABEL[r.status] ?? r.status, r.org_type || '-', r.organization, r.department || '-', r.position || '-', r.name, r.email || '-', fmtDateTime(r.registered_at)]
  );

  autoTable(doc, {
    startY: 56, head, body,
    styles: { font: 'NotoSansKR', fontSize: 8.5, cellPadding: 2.5, valign: 'middle', halign: 'center' },
    headStyles: { fillColor: [229, 231, 235], textColor: [31, 41, 55], fontStyle: 'normal' },
    didDrawPage: (data) => { if (data.pageNumber > 1) { doc.setFont('NotoSansKR'); drawHeader(); } },
    margin: { top: 56, bottom: 18 },
  });

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setFont('NotoSansKR');
    doc.text(`${i} / ${totalPages}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' });
  }
  doc.save(`${kind}_신청자명부_${event.title}_${event.event_date}.pdf`);
}

// ─── 참석자 명부 (Attendees w/ signature) ─ Excel ─────────────
// Includes only people who signed (signature_url not null).
// status: checked_in (사전신청+서명) or walk_in (현장등록+서명)
export async function exportAttendeesRosterToExcel(
  event: EventData,
  rows: RosterAttendee[],
  opts: { showCarNumber?: boolean; kind?: '행사' | '교육' } = {}
) {
  const showCar = opts.showCarNumber ?? false;
  const kind = opts.kind ?? '행사';
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('참석자명부');

  const sigColWidth = 30;
  const cols = showCar
    ? [{ width: 6 }, { width: 10 }, { width: 10 }, { width: 20 }, { width: 16 }, { width: 10 }, { width: 12 }, { width: 24 }, { width: 14 }, { width: sigColWidth }, { width: 14 }]
    : [{ width: 6 }, { width: 10 }, { width: 10 }, { width: 22 }, { width: 18 }, { width: 10 }, { width: 12 }, { width: 26 }, { width: sigColWidth }, { width: 14 }];
  ws.columns = cols;
  const totalCols = cols.length;

  commonHeader(ws, `${kind} 참석자 명부`, [
    [`${kind}명`, event.title],
    ['일  시', `${event.event_date}  ${formatTime(event.start_time)} ~ ${formatTime(event.end_time)}`],
    ['장  소', event.location],
    ['주관부서', event.organizer],
    ['참석 인원', `${rows.length}명`],
  ], totalCols);

  const headers = showCar
    ? ['번호', '구분', '기관(사전/현장)', '기관명', '부서', '직급', '성명', '이메일', '차량번호', '서명', '참석시각']
    : ['번호', '구분', '구분(사전/현장)', '기관명', '부서', '직급', '성명', '이메일', '서명', '참석시각'];
  const headerRow = ws.getRow(8);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h; cell.fill = headerFillStyle; cell.font = headerFontStyle;
    cell.alignment = { horizontal: 'center', vertical: 'middle' }; cell.border = borderThinStyle;
  });
  headerRow.height = 24;

  const sigColIndex = showCar ? 9 : 8;

  for (let idx = 0; idx < rows.length; idx++) {
    const r = rows[idx];
    const rowNum = idx + 9;
    const row = ws.getRow(rowNum);
    const rowHeight = 55;
    row.height = rowHeight;

    const route = r.status === 'walk_in' ? '현장' : '사전';
    const vals = showCar
      ? [idx + 1, r.org_type || '-', route, r.organization, r.department || '-', r.position || '-', r.name, r.email || '-', r.car_number || '-', '', fmtDateTime(r.checked_in_at)]
      : [idx + 1, r.org_type || '-', route, r.organization, r.department || '-', r.position || '-', r.name, r.email || '-', '', fmtDateTime(r.checked_in_at)];
    vals.forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = v; cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = borderThinStyle; cell.font = { size: 10 };
    });

    if (r.signature_url) {
      try {
        const isDataUrl = r.signature_url.startsWith('data:');
        let buf: ArrayBuffer | null = null;
        if (isDataUrl) {
          const base64 = r.signature_url.split(',')[1];
          const binaryStr = atob(base64);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
          buf = bytes.buffer;
        } else {
          buf = await fetchImageAsBuffer(r.signature_url);
        }
        if (buf) {
          const imgId = wb.addImage({ buffer: buf, extension: 'png' });
          ws.addImage(imgId, {
            tl: { col: sigColIndex + 0.05, row: rowNum - 0.93 } as any,
            ext: { width: (sigColWidth - 2) * 7.5, height: (rowHeight - 6) * 1.33 },
          });
        }
      } catch { /* skip */ }
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${kind}_참석자명부_${event.title}_${event.event_date}.xlsx`);
}

// ─── 참석자 명부 (Attendees w/ signature) ─ PDF ───────────────
export async function exportAttendeesRosterToPDF(
  event: EventData,
  rows: RosterAttendee[],
  opts: { showCarNumber?: boolean; kind?: '행사' | '교육' } = {}
) {
  const showCar = opts.showCarNumber ?? false;
  const kind = opts.kind ?? '행사';
  const fontBuffer = await loadNotoSansKR();
  const fontBase64 = btoa(new Uint8Array(fontBuffer).reduce((s, b) => s + String.fromCharCode(b), ''));
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.addFileToVFS('NotoSansKR-Regular.ttf', fontBase64);
  doc.addFont('NotoSansKR-Regular.ttf', 'NotoSansKR', 'normal');
  doc.setFont('NotoSansKR');

  const sigImages: (string | null)[] = await Promise.all(
    rows.map((r) => (r.signature_url ? fetchImageAsBase64(r.signature_url) : Promise.resolve(null)))
  );
  const pageWidth = doc.internal.pageSize.getWidth();

  const drawHeader = () => {
    doc.setFontSize(20);
    doc.text(`${kind} 참석자 명부`, pageWidth / 2, 18, { align: 'center' });
    doc.setFontSize(10);
    [
      `${kind}명: ${event.title}`,
      `일  시: ${event.event_date}  ${formatTime(event.start_time)} ~ ${formatTime(event.end_time)}`,
      `장  소: ${event.location}`,
      `주관부서: ${event.organizer}    참석 인원: ${rows.length}명`,
    ].forEach((line, i) => doc.text(line, 14, 28 + i * 5.5));
  };
  drawHeader();

  const sigColIdx = showCar ? 9 : 8;
  const head = showCar
    ? [['번호', '구분', '경로', '기관명', '부서', '직급', '성명', '이메일', '차량', '서명', '참석시각']]
    : [['번호', '구분', '경로', '기관명', '부서', '직급', '성명', '이메일', '서명', '참석시각']];
  const body = rows.map((r, i) => {
    const route = r.status === 'walk_in' ? '현장' : '사전';
    return showCar
      ? [String(i + 1), r.org_type || '-', route, r.organization, r.department || '-', r.position || '-', r.name, r.email || '-', r.car_number || '-', '', fmtDateTime(r.checked_in_at)]
      : [String(i + 1), r.org_type || '-', route, r.organization, r.department || '-', r.position || '-', r.name, r.email || '-', '', fmtDateTime(r.checked_in_at)];
  });

  autoTable(doc, {
    startY: 56, head, body,
    styles: { font: 'NotoSansKR', fontSize: 9, cellPadding: 3, valign: 'middle', halign: 'center', minCellHeight: 14 },
    headStyles: { fillColor: [229, 231, 235], textColor: [31, 41, 55], fontStyle: 'normal', minCellHeight: 10 },
    didDrawCell: (data) => {
      if (data.section === 'body' && data.column.index === sigColIdx) {
        const sig = sigImages[data.row.index];
        if (sig) {
          try {
            doc.addImage(sig, 'PNG', data.cell.x + 2, data.cell.y + 1.5, data.cell.width - 4, data.cell.height - 3);
          } catch { /* skip */ }
        }
      }
    },
    didDrawPage: (data) => { if (data.pageNumber > 1) { doc.setFont('NotoSansKR'); drawHeader(); } },
    margin: { top: 56, bottom: 18 },
  });

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setFont('NotoSansKR');
    doc.text(`${i} / ${totalPages}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' });
  }
  doc.save(`${kind}_참석자명부_${event.title}_${event.event_date}.pdf`);
}
