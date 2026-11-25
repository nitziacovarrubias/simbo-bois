import type { CuttingListResponse } from '@simbo/shared-contracts';

// Exportador XLSX pequeño, sin librerías adicionales ni llamadas al servidor.
// Produce un .xlsx real (Office Open XML ZIP), no un CSV renombrado.
const encoder = new TextEncoder();
const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function xml(value: unknown): string {
  return (
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
      // XML 1.0 no admite caracteres de control, salvo TAB, LF y CR.
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  );
}

function excelColumn(index: number): string {
  let current = index + 1;
  let value = '';
  while (current > 0) {
    current -= 1;
    value = String.fromCharCode(65 + (current % 26)) + value;
    current = Math.floor(current / 26);
  }
  return value;
}

type CellValue = string | number;

function sheetRow(rowNumber: number, cells: CellValue[], style: number): string {
  return `<row r="${rowNumber}">${cells
    .map((value, index) => {
      const ref = `${excelColumn(index)}${rowNumber}`;
      const isNumber = typeof value === 'number' && Number.isFinite(value);
      if (isNumber) return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
      // inlineStr garantiza que no se interpreten nombres que comienzan por '=' como fórmulas.
      return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
    })
    .join('')}</row>`;
}

function makeSheet(
  rows: CellValue[][],
  widths: number[],
  opts: { title: string; subtitle: string },
): string {
  const lastColumn = excelColumn(widths.length - 1);
  const lastRow = Math.max(4, rows.length + 3);
  const columns = widths
    .map((w, index) => `<col min="${index + 1}" max="${index + 1}" width="${w}" customWidth="1"/>`)
    .join('');
  const lines = [
    sheetRow(1, [opts.title], 1),
    sheetRow(2, [opts.subtitle], 2),
    sheetRow(4, rows[0] ?? [], 3),
    ...rows.slice(1).map((row, index) => sheetRow(index + 5, row, index % 2 === 0 ? 4 : 5)),
  ].join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastColumn}${lastRow}"/>
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>${columns}</cols>
  <sheetData>${lines}</sheetData>
  <mergeCells count="2"><mergeCell ref="A1:${lastColumn}1"/><mergeCell ref="A2:${lastColumn}2"/></mergeCells>
  <autoFilter ref="A4:${lastColumn}${lastRow}"/>
  <pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>
</worksheet>`;
}

// Excel: hoja de despiece + hoja independiente de trazabilidad (sin perder orígenes).
function workbookFiles(
  result: CuttingListResponse,
  projectName: string,
): { filename: string; text: string }[] {
  const header = [
    '#',
    'Concepto',
    'Cantidad',
    'Material',
    'Ancho (mm)',
    'Alto (mm)',
    'Grosor (mm)',
    'Veta',
    'Orígenes',
  ];
  const cuttingRows: CellValue[][] = [header];
  const sourceRows: CellValue[][] = [
    ['#', 'Pieza', 'ID de pieza', 'ID de módulo', 'Ruta de ensambles'],
  ];
  result.rows.forEach((row, index) => {
    cuttingRows.push([
      index + 1,
      row.name,
      row.quantity,
      row.material.name,
      row.widthMm,
      row.heightMm,
      row.thicknessMm,
      row.grainDirection,
      row.origins.length,
    ]);
    row.origins.forEach((origin) =>
      sourceRows.push([
        index + 1,
        row.name,
        origin.partId,
        origin.moduleInstanceId ?? '',
        origin.assemblyPath.join(' / '),
      ]),
    );
  });
  const sheet1 = makeSheet(cuttingRows, [6, 42, 12, 28, 16, 16, 17, 22, 13], {
    title: `SIMBO | LISTA DE DESPIECE`,
    subtitle: `Proyecto: ${projectName}   |   Revisión: ${result.source.revision}   |   Piezas: ${result.rows.length} tipos`,
  });
  const sheet2 = makeSheet(sourceRows, [7, 42, 45, 45, 65], {
    title: `SIMBO | TRAZABILIDAD`,
    subtitle: `Proyecto: ${projectName}   |   Revisión: ${result.source.revision}`,
  });
  return [
    {
      filename: '[Content_Types].xml',
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
    },
    {
      filename: '_rels/.rels',
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      filename: 'xl/workbook.xml',
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Despiece" sheetId="1" r:id="rId1"/><sheet name="Orígenes" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    },
    {
      filename: 'xl/_rels/workbook.xml.rels',
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    {
      filename: 'xl/styles.xml',
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="16"/><color rgb="FFF47B00"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF252525"/><name val="Calibri"/></font></fonts>
  <fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFC5E1C3"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF5FBF4"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="6">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"><alignment vertical="center"/></xf>
  </cellXfs>
</styleSheet>`,
    },
    { filename: 'xl/worksheets/sheet1.xml', text: sheet1 },
    { filename: 'xl/worksheets/sheet2.xml', text: sheet2 },
  ];
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let c = index;
  for (let i = 0; i < 8; i++) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// Un ZIP sin compresión es válido para XLSX y evita dependencias externas.
function zip(files: { filename: string; text: string }[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  let centralSize = 0;

  for (const file of files) {
    const name = encoder.encode(file.filename);
    const content = encoder.encode(file.text);
    const checksum = crc32(content);
    const local = new Uint8Array(30 + name.length + content.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, 0x0800, true); // UTF-8
    l.setUint16(8, 0, true); // Stored
    l.setUint32(14, checksum, true);
    l.setUint32(18, content.length, true);
    l.setUint32(22, content.length, true);
    l.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(content, 30 + name.length);
    localParts.push(local);

    const central = new Uint8Array(46 + name.length);
    const c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint32(16, checksum, true);
    c.setUint32(20, content.length, true);
    c.setUint32(24, content.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    central.set(name, 46);
    centralParts.push(central);
    offset += local.length;
    centralSize += central.length;
  }
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, centralSize, true);
  e.setUint32(16, offset, true);

  const result = new Uint8Array(offset + centralSize + end.length);
  let cursor = 0;
  for (const part of [...localParts, ...centralParts, end]) {
    result.set(part, cursor);
    cursor += part.length;
  }
  return result;
}

export function buildCuttingListXlsx(result: CuttingListResponse, projectName: string): Uint8Array {
  return zip(workbookFiles(result, projectName));
}

export function exportCuttingListXlsx(result: CuttingListResponse, projectName: string): void {
  if (result.rows.length === 0) return;
  const bytes = buildCuttingListXlsx(result, projectName);
  const blob = new Blob([new Uint8Array(bytes)], { type: MIME });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeName =
    projectName
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .slice(0, 60) || 'Proyecto';
  link.href = objectUrl;
  link.download = `SIMBO_Despiece_${safeName}_R${result.source.revision}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
