import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Attendee {
  id: string;
  organization: string;
  position: string | null;
  name: string;
  phone: string;
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
  } catch {
    return null;
  }
}

async function fetchImageAsBuffer(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url);
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

// ─── Excel Export ───────────────────────────────────────────────

export async function exportToExcel(event: EventData, attendees: Attendee[]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('참석확인부');

  // Column widths
  ws.columns = [
    { width: 6 },   // 번호
    { width: 22 },  // 소속
    { width: 10 },  // 직급
    { width: 12 },  // 이름
    { width: 16 },  // 연락처
    { width: 18 },  // 서명
    { width: 14 },  // 등록시각
  ];

  const headerFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
  const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  const borderThin: Partial<ExcelJS.Borders> = {
    top: { style: 'thin' }, bottom: { style: 'thin' },
    left: { style: 'thin' }, right: { style: 'thin' },
  };

  // Row 1: Title
  ws.mergeCells('A1:G1');
  const titleCell = ws.getCell('A1');
  titleCell.value = '참석확인부';
  titleCell.font = { bold: true, size: 18 };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 36;

  // Rows 2-5: Event info
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
    ws.mergeCells(i + 2, 2, i + 2, 7);
    row.getCell(2).value = r[1];
    row.getCell(2).font = { size: 10 };
  });

  // Row 6: blank
  // Row 7: Table header
  const headers = ['번호', '소속', '직급', '이름', '연락처', '서명', '등록시각'];
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

  // Data rows (with signature images)
  for (let idx = 0; idx < attendees.length; idx++) {
    const a = attendees[idx];
    const rowNum = idx + 8;
    const row = ws.getRow(rowNum);
    row.height = 40;

    const vals = [
      idx + 1,
      a.organization,
      a.position || '-',
      a.name,
      a.phone,
      '', // signature placeholder
      formatCheckedIn(a.checked_in_at),
    ];

    vals.forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = v;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = borderThin;
      cell.font = { size: 10 };
    });

    // Signature image
    if (a.signature_url) {
      try {
        const buf = await fetchImageAsBuffer(a.signature_url);
        if (buf) {
          const imgId = wb.addImage({ buffer: buf, extension: 'png' });
          ws.addImage(imgId, {
            tl: { col: 5.1, row: rowNum - 0.9 } as any,
            br: { col: 5.9, row: rowNum - 0.1 } as any,
          });
        }
      } catch { /* skip */ }
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  const fileName = `참석확인부_${event.title}_${event.event_date}.xlsx`;
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName);
}

// ─── PDF Export ─────────────────────────────────────────────────

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

export async function exportToPDF(event: EventData, attendees: Attendee[]) {
  const fontBuffer = await loadNotoSansKR();
  const fontBase64 = btoa(
    new Uint8Array(fontBuffer).reduce((s, b) => s + String.fromCharCode(b), '')
  );

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Register Korean font
  doc.addFileToVFS('NotoSansKR-Regular.ttf', fontBase64);
  doc.addFont('NotoSansKR-Regular.ttf', 'NotoSansKR', 'normal');
  doc.setFont('NotoSansKR');

  // Prefetch signature images
  const sigImages: (string | null)[] = await Promise.all(
    attendees.map((a) => (a.signature_url ? fetchImageAsBase64(a.signature_url) : Promise.resolve(null)))
  );

  const pageWidth = doc.internal.pageSize.getWidth();

  // Header function for each page
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
    info.forEach((line, i) => {
      doc.text(line, 20, 30 + i * 6);
    });
  };

  drawHeader();

  const bodyData = attendees.map((a, i) => [
    String(i + 1),
    a.organization,
    a.position || '-',
    a.name,
    a.phone,
    '', // signature placeholder
    formatCheckedIn(a.checked_in_at),
  ]);

  autoTable(doc, {
    startY: 56,
    head: [['번호', '소속', '직급', '이름', '연락처', '서명', '등록시각']],
    body: bodyData,
    styles: {
      font: 'NotoSansKR',
      fontSize: 9,
      cellPadding: 3,
      valign: 'middle',
      halign: 'center',
    },
    headStyles: {
      fillColor: [37, 99, 235],
      textColor: 255,
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 12 },
      1: { cellWidth: 36 },
      2: { cellWidth: 18 },
      3: { cellWidth: 22 },
      4: { cellWidth: 28 },
      5: { cellWidth: 30 },
      6: { cellWidth: 24 },
    },
    didDrawCell: (data) => {
      if (data.section === 'body' && data.column.index === 5) {
        const sig = sigImages[data.row.index];
        if (sig) {
          try {
            doc.addImage(
              sig,
              'PNG',
              data.cell.x + 2,
              data.cell.y + 1,
              data.cell.width - 4,
              data.cell.height - 2
            );
          } catch { /* skip */ }
        }
      }
    },
    didDrawPage: (data) => {
      // Page number footer
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setFont('NotoSansKR');
      doc.text(
        `${data.pageNumber} / ${pageCount}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: 'center' }
      );

      // Redraw header on subsequent pages
      if (data.pageNumber > 1) {
        doc.setFont('NotoSansKR');
        drawHeader();
      }
    },
    margin: { top: 56, bottom: 20 },
  });

  // Fix page numbers (total count)
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('NotoSansKR');
    // Clear footer area and rewrite
    doc.setFillColor(255, 255, 255);
    doc.rect(0, doc.internal.pageSize.getHeight() - 15, pageWidth, 15, 'F');
    doc.text(
      `${i} / ${totalPages}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
  }

  const fileName = `참석확인부_${event.title}_${event.event_date}.pdf`;
  doc.save(fileName);
}
