import React, { useState, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { Upload, FileText, ChevronDown, ChevronUp, X, Download, Printer, Layers, Package, Hash, AlignLeft, Barcode, Search, FileSpreadsheet, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Set worker path using Vite's ?url import
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

interface MaterialItem {
  code: string;
  description: string;
  quantity: string;
  reference: string;
}

type GroupedMaterials = Record<string, MaterialItem[]>;

interface OrderMetadata {
  ral: string;
  cliente: string;
  ref: string;
}

export default function App() {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [groupedMaterials, setGroupedMaterials] = useState<GroupedMaterials | null>(null);
  const [expandedRefs, setExpandedRefs] = useState<Set<string>>(new Set());
  const [orderMetadata, setOrderMetadata] = useState<Record<string, OrderMetadata>>({});
  const [unrecognizedLines, setUnrecognizedLines] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showUnrecognized, setShowUnrecognized] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parsePDFs = async (files: File[]) => {
    setIsLoading(true);
    try {
      const allItems: MaterialItem[] = [];
      const unrecognized: string[] = [];
      
      for (const file of files) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          
          const itemsByY: { [y: number]: any[] } = {};
          textContent.items.forEach((item: any) => {
            const y = Math.round(item.transform[5] / 2) * 2; 
            if (!itemsByY[y]) itemsByY[y] = [];
            itemsByY[y].push(item);
          });
          
          const sortedYs = Object.keys(itemsByY).map(Number).sort((a, b) => b - a);
          
          sortedYs.forEach(y => {
            const items = itemsByY[y].sort((a: any, b: any) => a.transform[4] - b.transform[4]);
            const lineText = items.map((item: any) => item.str).filter((s: string) => s.trim() !== '').join(' ');
            
            if (lineText.trim().length === 0) return;

            const match = lineText.match(/^([a-zA-Z0-9]+)\s+(.+?)\s+(\d+,\d{2})\s+(\S+)/i);
            if (match) {
              allItems.push({
                code: match[1].trim(),
                description: match[2].trim(),
                quantity: match[3].trim(),
                reference: match[4].trim()
              });
            } else {
              const upperLine = lineText.toUpperCase();
              const isHeader = upperLine.includes('ALUGOM') || upperLine.includes('PAGINA') || upperLine.includes('FECHA') || upperLine.includes('DESCRIPCION') || upperLine.includes('CANTIDAD') || upperLine.includes('PEDIDO');
              if (!isHeader && lineText.length > 5) {
                unrecognized.push(lineText);
              }
            }
          });
        }
      }
      
      const grouped = allItems.reduce((acc, item) => {
        if (!acc[item.reference]) acc[item.reference] = [];
        acc[item.reference].push(item);
        return acc;
      }, {} as GroupedMaterials);
      
      setGroupedMaterials(grouped);
      setExpandedRefs(new Set(Object.keys(grouped)));
      setUnrecognizedLines(unrecognized);

      const initialMeta: Record<string, OrderMetadata> = {};
      Object.keys(grouped).forEach(ref => {
        initialMeta[ref] = { ral: '', cliente: '', ref: '' };
      });
      setOrderMetadata(initialMeta);

    } catch (error) {
      console.error("Error parsing PDF:", error);
      alert("Error al procesar los PDFs. Asegúrate de que son el formato correcto.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f: any) => f.type === 'application/pdf') as File[];
    if (files.length > 0) {
      parsePDFs(files);
    } else {
      alert("Por favor, sube archivos PDF.");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length > 0) {
      parsePDFs(files);
    }
  };

  const toggleRef = (ref: string) => {
    const newExpanded = new Set(expandedRefs);
    if (newExpanded.has(ref)) {
      newExpanded.delete(ref);
    } else {
      newExpanded.add(ref);
    }
    setExpandedRefs(newExpanded);
  };

  const reset = () => {
    setGroupedMaterials(null);
    setExpandedRefs(new Set());
    setOrderMetadata({});
    setUnrecognizedLines([]);
    setSearchQuery('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleSavePDF = () => {
    if (!groupedMaterials) return;
    
    const doc = new jsPDF();
    let currentY = 20;
    
    doc.setFontSize(18);
    doc.setTextColor(58, 64, 40);
    doc.text("VERIFICAR DESCARGA MATERIALES", 14, currentY);
    currentY += 15;
    
    (Object.entries(groupedMaterials) as [string, MaterialItem[]][]).forEach(([reference, items]) => {
      if (currentY > 250) {
        doc.addPage();
        currentY = 20;
      }
      
      const meta = orderMetadata[reference] || { ral: '', cliente: '', ref: '' };
      
      doc.setFontSize(14);
      doc.setTextColor(90, 98, 58);
      
      const headerParts = [`PEDIDO: ${reference}`];
      if (meta.ral) headerParts.push(`RAL: ${meta.ral}`);
      if (meta.cliente) headerParts.push(`CLIENTE: ${meta.cliente}`);
      if (meta.ref) headerParts.push(`REF: ${meta.ref}`);
      
      doc.text(headerParts.join(' | '), 14, currentY);
      currentY += 5;
      
      autoTable(doc, {
        startY: currentY,
        head: [['Código', 'Descripción', 'Metros', 'Barras']],
        body: items.map(item => {
          const qtyNum = parseFloat(item.quantity.replace(',', '.'));
          const barras = isNaN(qtyNum) ? '0' : Math.ceil(qtyNum / 6.4).toString();
          return [item.code, item.description, item.quantity, barras];
        }),
        theme: 'grid',
        headStyles: { fillColor: [90, 98, 58], textColor: 255 },
        styles: { font: 'helvetica', fontSize: 10 },
        margin: { top: 10, bottom: 20 },
      });
      
      // @ts-ignore
      currentY = doc.lastAutoTable.finalY + 15;
    });
    
    doc.save('materiales_alugom.pdf');
  };

  const handleExportCSV = () => {
    if (!groupedMaterials) return;
    let csv = 'Pedido,RAL,Cliente,Ref,Código,Descripción,Metros,Barras\n';
    (Object.entries(groupedMaterials) as [string, MaterialItem[]][]).forEach(([reference, items]) => {
      const meta = orderMetadata[reference] || { ral: '', cliente: '', ref: '' };
      items.forEach(item => {
        const desc = `"${item.description.replace(/"/g, '""')}"`;
        const qtyNum = parseFloat(item.quantity.replace(',', '.'));
        const barras = isNaN(qtyNum) ? 0 : Math.ceil(qtyNum / 6.4);
        csv += `${reference},${meta.ral},${meta.cliente},${meta.ref},${item.code},${desc},"${item.quantity}",${barras}\n`;
      });
    });
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'materiales_alugom.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const updateMetadata = (reference: string, field: keyof OrderMetadata, value: string) => {
    setOrderMetadata(prev => ({
      ...prev,
      [reference]: {
        ...prev[reference],
        [field]: value
      }
    }));
  };

  const filteredMaterials = groupedMaterials ? (Object.entries(groupedMaterials) as [string, MaterialItem[]][]).reduce((acc, [ref, items]) => {
    const filteredItems = items.filter(item => 
      item.code.toLowerCase().includes(searchQuery.toLowerCase()) || 
      item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ref.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (filteredItems.length > 0) acc[ref] = filteredItems;
    return acc;
  }, {} as GroupedMaterials) : null;

  return (
    <div className="min-h-screen bg-[#F5F5F0] text-[#3A4028] font-sans selection:bg-[#5A623A] selection:text-white flex flex-col">
      <header className="border-b-2 border-[#3A4028] p-6 flex justify-between items-center sticky top-0 bg-[#F5F5F0] z-20">
        <div className="flex items-center gap-4">
          <Layers className="w-10 h-10 md:w-14 md:h-14 text-[#5A623A]" strokeWidth={1.5} />
          <h1 className="text-3xl md:text-5xl font-bold uppercase tracking-tighter leading-none">
            ALUGOM<br/>
            <span className="text-xl md:text-3xl font-medium tracking-normal text-[#5A623A]">EXTRACTOR DE MATERIAL</span>
          </h1>
        </div>
        <div className="hidden md:block text-right font-mono text-sm uppercase">
          <p>SISTEMA DE LECTURA PDF</p>
          <p>VERSIÓN 2.0</p>
        </div>
      </header>

      <main className="flex-grow flex flex-col">
        {!groupedMaterials ? (
          <div className="flex-grow flex flex-col items-center justify-center p-6 gap-8">
            <div className="max-w-4xl w-full bg-white border-2 border-[#3A4028] p-6 shadow-[4px_4px_0px_0px_#3A4028]">
              <h2 className="text-xl font-bold uppercase mb-2 flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#5A623A]" />
                ¿Cómo funciona?
              </h2>
              <p className="text-[#5A623A] leading-relaxed">
                Esta aplicación extrae automáticamente los códigos, descripciones y cantidades de material desde los archivos PDF de pedidos de Alugom. Agrupa todos los elementos por número de pedido para facilitar su verificación, control y descarga en el taller.
              </p>
            </div>

            <div 
              className={`w-full max-w-4xl aspect-[16/9] md:aspect-[21/9] border-4 border-[#3A4028] border-dashed flex flex-col items-center justify-center p-8 transition-colors duration-200 cursor-pointer ${isDragging ? 'bg-[#3A4028] text-[#F5F5F0]' : 'bg-white hover:bg-[#EBECE7]'}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept=".pdf" 
                multiple
                className="hidden" 
              />
              <Upload className={`w-16 h-16 md:w-24 md:h-24 mb-6 ${isDragging ? 'text-[#F5F5F0]' : 'text-[#5A623A]'}`} strokeWidth={1.5} />
              <h2 className="text-2xl md:text-4xl font-bold uppercase tracking-tight text-center mb-2">
                {isDragging ? 'SUELTA LOS PDF AQUÍ' : 'SUBIR ARCHIVOS PDF'}
              </h2>
              <p className={`font-mono text-sm md:text-base uppercase text-center ${isDragging ? 'text-gray-400' : 'text-gray-500'}`}>
                ARRASTRA Y SUELTA O HAZ CLIC PARA SELECCIONAR (SOPORTA MÚLTIPLES)
              </p>
              
              {isLoading && (
                <div className="w-full max-w-md mt-8 space-y-4 animate-pulse">
                  <div className="h-12 bg-[#EBECE7] border-2 border-[#3A4028] w-full flex items-center justify-center">
                    <span className="font-mono uppercase text-[#5A623A] text-sm">Procesando documentos...</span>
                  </div>
                  <div className="h-12 bg-[#EBECE7] border-2 border-[#3A4028] w-full opacity-70"></div>
                  <div className="h-12 bg-[#EBECE7] border-2 border-[#3A4028] w-full opacity-40"></div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-grow flex flex-col md:flex-row">
            <div className="w-full md:w-80 border-b-2 md:border-b-0 md:border-r-2 border-[#3A4028] p-6 flex flex-col gap-6 bg-[#F5F5F0] print:hidden">
              <div>
                <h3 className="font-bold uppercase text-xl mb-4 flex items-center gap-2">
                  <FileText className="w-6 h-6 text-[#5A623A]" /> Resumen
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 bg-white p-3 border-2 border-[#3A4028]">
                    <Package className="w-5 h-5 text-[#5A623A]" />
                    <p className="font-mono text-sm font-bold uppercase">
                      {Object.keys(groupedMaterials).length} Pedidos
                    </p>
                  </div>
                  <div className="flex items-center gap-3 bg-white p-3 border-2 border-[#3A4028]">
                    <Hash className="w-5 h-5 text-[#5A623A]" />
                    <p className="font-mono text-sm font-bold uppercase">
                      {(Object.values(groupedMaterials) as MaterialItem[][]).flat().length} Líneas
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-bold uppercase text-sm mb-2 text-[#5A623A]">Buscar Material</h3>
                <div className="relative">
                  <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-[#5A623A]" />
                  <input 
                    type="text" 
                    placeholder="Código o descripción..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full border-2 border-[#3A4028] py-2 pl-10 pr-4 outline-none focus:bg-white transition-colors font-mono text-sm"
                  />
                </div>
              </div>
              
              <div className="flex flex-col gap-3 mt-auto">
                <button 
                  onClick={handleExportCSV}
                  className="w-full border-2 border-[#3A4028] bg-white py-3 px-4 font-bold uppercase tracking-wider hover:bg-[#EBECE7] transition-colors flex items-center justify-center gap-2"
                >
                  <FileSpreadsheet className="w-5 h-5" />
                  Exportar CSV
                </button>
                <button 
                  onClick={handlePrint}
                  className="w-full border-2 border-[#3A4028] bg-white py-3 px-4 font-bold uppercase tracking-wider hover:bg-[#EBECE7] transition-colors flex items-center justify-center gap-2"
                >
                  <Printer className="w-5 h-5" />
                  Imprimir Listado
                </button>
                <button 
                  onClick={handleSavePDF}
                  className="w-full border-2 border-[#3A4028] bg-white py-3 px-4 font-bold uppercase tracking-wider hover:bg-[#EBECE7] transition-colors flex items-center justify-center gap-2"
                >
                  <Download className="w-5 h-5" />
                  Guardar PDF
                </button>
                <button 
                  onClick={reset}
                  className="w-full border-2 border-[#3A4028] py-3 px-4 font-bold uppercase tracking-wider bg-[#3A4028] text-[#F5F5F0] hover:bg-[#5A623A] transition-colors flex items-center justify-center gap-2"
                >
                  <X className="w-5 h-5" />
                  Subir Otros PDF
                </button>
              </div>
            </div>

            <div className="flex-grow p-6 md:p-10 overflow-y-auto bg-[#EBECE7] relative">
              <div className="max-w-5xl mx-auto space-y-8">
                <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-tight text-[#3A4028] mb-8 print:block">
                  Verificar descarga materiales
                </h2>
                
                {filteredMaterials && Object.keys(filteredMaterials).length === 0 && (
                  <div className="text-center py-12 text-[#5A623A] font-mono">
                    No se encontraron materiales que coincidan con la búsqueda.
                  </div>
                )}

                {filteredMaterials && (Object.entries(filteredMaterials) as [string, MaterialItem[]][]).map(([reference, items]) => (
                  <div key={reference} className="border-2 border-[#3A4028] bg-[#F5F5F0] shadow-[8px_8px_0px_0px_#3A4028] print:shadow-none print:border-b-2 print:border-t-0 print:border-l-0 print:border-r-0 print:mb-8">
                    <div className="w-full p-4 md:p-6 border-b-2 border-[#3A4028] bg-white print:border-b-2">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <span className="bg-[#5A623A] text-white font-mono px-3 py-1 text-sm md:text-base flex items-center gap-2">
                            <Package className="w-4 h-4" /> PEDIDO
                          </span>
                          <h3 className="text-2xl md:text-3xl font-bold tracking-tight">
                            {reference}
                          </h3>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-mono text-sm hidden md:inline-block">
                            {items.length} ITEM{items.length !== 1 ? 'S' : ''}
                          </span>
                          <button onClick={() => toggleRef(reference)} className="print:hidden p-2 hover:bg-[#EBECE7] rounded-full transition-colors">
                            {expandedRefs.has(reference) ? <ChevronUp className="w-6 h-6" /> : <ChevronDown className="w-6 h-6" />}
                          </button>
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mt-4 pt-4 border-t border-[#3A4028]/20 print:border-none print:pt-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-[#5A623A]">RAL:</span>
                          <input 
                            type="text" 
                            value={orderMetadata[reference]?.ral || ''} 
                            onChange={(e) => updateMetadata(reference, 'ral', e.target.value)} 
                            className="border-b-2 border-[#3A4028] bg-transparent outline-none px-1 w-24 font-mono text-sm print:border-none focus:bg-[#EBECE7] transition-colors" 
                            placeholder="Ej. 9010" 
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-[#5A623A]">CLIENTE:</span>
                          <input 
                            type="text" 
                            value={orderMetadata[reference]?.cliente || ''} 
                            onChange={(e) => updateMetadata(reference, 'cliente', e.target.value)} 
                            className="border-b-2 border-[#3A4028] bg-transparent outline-none px-1 w-48 font-mono text-sm print:border-none focus:bg-[#EBECE7] transition-colors" 
                            placeholder="Nombre cliente" 
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-[#5A623A]">REF:</span>
                          <input 
                            type="text" 
                            value={orderMetadata[reference]?.ref || ''} 
                            onChange={(e) => updateMetadata(reference, 'ref', e.target.value)} 
                            className="border-b-2 border-[#3A4028] bg-transparent outline-none px-1 w-32 font-mono text-sm print:border-none focus:bg-[#EBECE7] transition-colors" 
                            placeholder="Referencia" 
                          />
                        </div>
                      </div>
                    </div>

                    <AnimatePresence>
                      {expandedRefs.has(reference) && (
                        <motion.div 
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden print:!h-auto print:!opacity-100"
                        >
                          <div className="overflow-x-auto max-h-[600px] overflow-y-auto print:max-h-none">
                            <table className="w-full text-left font-sans text-sm md:text-base whitespace-nowrap relative">
                              <thead className="bg-[#EBECE7] border-b-2 border-[#3A4028] uppercase sticky top-0 z-10 shadow-sm print:static">
                                <tr>
                                  <th className="p-4 font-semibold w-32 border-r-2 border-[#3A4028]">
                                    <div className="flex items-center gap-2"><Barcode className="w-4 h-4 text-[#5A623A]"/> Código</div>
                                  </th>
                                  <th className="p-4 font-semibold border-r-2 border-[#3A4028]">
                                    <div className="flex items-center gap-2"><AlignLeft className="w-4 h-4 text-[#5A623A]"/> Descripción</div>
                                  </th>
                                  <th className="p-4 font-semibold w-32 text-right border-r-2 border-[#3A4028]">
                                    <div className="flex items-center justify-end gap-2"><Hash className="w-4 h-4 text-[#5A623A]"/> Metros</div>
                                  </th>
                                  <th className="p-4 font-semibold w-32 text-right">
                                    <div className="flex items-center justify-end gap-2"><Layers className="w-4 h-4 text-[#5A623A]"/> Barras</div>
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {items.map((item, idx) => {
                                  const qtyNum = parseFloat(item.quantity.replace(',', '.'));
                                  const isHighQuantity = !isNaN(qtyNum) && qtyNum > 50;

                                  return (
                                    <tr key={idx} className="border-b border-[#3A4028]/20 last:border-0 hover:bg-white hover:border-l-4 hover:border-l-[#5A623A] transition-all group">
                                      <td className="p-4 border-r-2 border-[#3A4028] font-mono font-medium">{item.code}</td>
                                      <td className="p-4 border-r-2 border-[#3A4028] whitespace-normal min-w-[200px]">{item.description}</td>
                                      <td className="p-4 text-right font-mono font-bold text-[#5A623A] border-r-2 border-[#3A4028]">
                                        <span className={`px-2 py-1 rounded transition-colors ${isHighQuantity ? 'bg-[#5A623A]/20 text-[#3A4028]' : 'group-hover:bg-[#EBECE7]'}`}>
                                          {item.quantity}
                                        </span>
                                      </td>
                                      <td className="p-4 text-right font-mono font-bold text-[#3A4028]">
                                        {isNaN(qtyNum) ? '-' : Math.ceil(qtyNum / 6.4)}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}

                {unrecognizedLines.length > 0 && (
                  <div className="mt-12 border-2 border-orange-800 bg-orange-50 print:hidden">
                    <button 
                      onClick={() => setShowUnrecognized(!showUnrecognized)}
                      className="w-full flex items-center justify-between p-4 bg-orange-100 hover:bg-orange-200 transition-colors"
                    >
                      <div className="flex items-center gap-3 text-orange-900">
                        <AlertTriangle className="w-5 h-5" />
                        <h3 className="font-bold uppercase">Líneas no reconocidas ({unrecognizedLines.length})</h3>
                      </div>
                      {showUnrecognized ? <ChevronUp className="w-5 h-5 text-orange-900" /> : <ChevronDown className="w-5 h-5 text-orange-900" />}
                    </button>
                    <AnimatePresence>
                      {showUnrecognized && (
                        <motion.div 
                          initial={{ height: 0 }}
                          animate={{ height: 'auto' }}
                          exit={{ height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="p-4 text-sm font-mono text-orange-900 max-h-60 overflow-y-auto space-y-2">
                            <p className="text-xs uppercase font-sans font-bold mb-4 opacity-70">
                              Estas líneas contenían texto pero no coincidían con el formato esperado de material. Revisa si falta algo importante.
                            </p>
                            {unrecognizedLines.map((line, idx) => (
                              <div key={idx} className="bg-white/50 p-2 border border-orange-200 rounded">
                                {line}
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
