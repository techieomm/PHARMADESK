import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// Extend jsPDF types for autoTable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

/**
 * Export tabular data to Excel (.xlsx) file
 */
export const exportToExcel = (data: Record<string, any>[], filename: string, sheetName: string = 'Report') => {
  if (!data || data.length === 0) {
    alert('No data to export');
    return;
  }

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`);
};

/**
 * Export tabular data to PDF (.pdf) file
 */
export const exportToPdf = (
  title: string,
  headers: string[],
  rows: (string | number)[][],
  filename: string,
  businessName: string = 'PharmaDesk Healthcare'
) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Header Title
  doc.setFontSize(16);
  doc.setTextColor(41, 41, 41); // Charcoal
  doc.text(businessName, 14, 15);

  doc.setFontSize(12);
  doc.setTextColor(100, 100, 100);
  doc.text(title, 14, 22);

  doc.setFontSize(9);
  doc.text(`Generated on: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`, 14, 28);

  // Table
  doc.autoTable({
    startY: 32,
    head: [headers],
    body: rows,
    theme: 'plain',
    headStyles: {
      fillColor: [233, 166, 107], // Light Orange Accent
      textColor: [33, 33, 33],
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: [41, 41, 41],
    },
    alternateRowStyles: {
      fillColor: [250, 247, 240], // Cream
    },
    styles: {
      cellPadding: 2.5,
      lineColor: [229, 231, 235],
      lineWidth: 0.1,
    },
  });

  doc.save(`${filename}_${new Date().toISOString().slice(0, 10)}.pdf`);
};
