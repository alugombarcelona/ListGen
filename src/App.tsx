import React, { useState, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { Upload, FileText, ChevronDown, ChevronUp, X, Download, Printer, Layers, Package, Hash, AlignLeft, Barcode } from 'lucide-react';
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

export default function App() {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [groupedMaterials, setGroupedMaterials] = useState<GroupedMaterials | null>(null);
  const [expandedRefs, setExpandedRefs] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parsePDF = async (file: File) => {
    setIsLoading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      const allItems: MaterialItem[] = [];
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        // Group items by Y coordinate to form lines
        const itemsByY: { [y: number]: any[] } = {};
        textContent.items.forEach((item: any) => {
          // Round Y to handle slight variations in same line
          const y = Math.round(item.transform[5] / 2) * 2; 
          if (!itemsByY[y]) itemsByY[y] = [];
          itemsByY[y].push(item);
        });
        
        const sortedYs = Object.keys(itemsByY).map(Number).sort((a, b) => b - a);
        
        sortedYs.forEach(y => {
          const items = itemsByY[y].sort((a: any, b: any) => a.transform[4] - b.transform[4]);
          // Filter out empty strings and join
          const lineText = items.map((item: any) => item.str).filter((s: string) => s.trim() !== '').join(' ');
          
          // Match the pattern: CODE DESCRIPTION QUANTITY REFERENCE
          // e.g. 9810T90 PRESOR PARA TAPETA MEC. 166,40 9399/15:32
          // We use a flexible regex to catch variations in spacing and reference format
          const match = lineText.match(/^([a-zA-Z0-9]+)\s+(.+?)\s+(\d+,\d{2})\s+(\S+)/i);
          if (match) {
            allItems.push({
              code: match[1].trim(),
              description: match[2].trim(),
              quantity: match[3].trim(),
              reference: match[4].trim()
            });
          }
        });
      }
      
      // Group by reference
      const grouped = allItems.reduce((acc, item) => {
        if (!acc[item.reference]) acc[item.reference] = [];
        acc[item.reference].push(item);
        return acc;
      }, {} as GroupedMaterials);
      
      setGroupedMaterials(grouped);
      // Expand all by default
      setExpandedRefs(new Set(Object.keys(grouped)));
    } catch (error) {
      console.error("Error parsing PDF:", error);
      alert("Error al procesar el PDF. Asegúrate de que es el formato correcto.");
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
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
      parsePDF(file);
    } else {
      alert("Por favor, sube un archivo PDF.");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      parsePDF(file);
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
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handlePrint = () => {
    // Some browsers block window.print() inside iframes.
    // If it fails, the user can use the "Guardar PDF" option.
    window.print();
  };

  const handleSavePDF = () => {
    if (!groupedMaterials) return;
    
    const doc = new jsPDF();
    let currentY = 20;
    
    // Title
    doc.setFontSize(18);
    doc.setTextColor(58, 64, 40); // #3A4028
    doc.text("VERIFICAR DESCARGA MATERIALES", 14, currentY);
    currentY += 15;
    
    (Object.entries(groupedMaterials) as [string, MaterialItem[]][]).forEach(([reference, items]) => {
      // Check if we need a new page
      if (currentY > 250) {
        doc.addPage();
        currentY = 20;
      }
      
      doc.setFontSize(14);
      doc.setTextColor(90, 98, 58); // #5A623A
      doc.text(`PEDIDO: ${reference} RAL:`, 14, currentY);
      currentY += 5;
      
      autoTable(doc, {
        startY: currentY,
        head: [['Código', 'Descripción', 'Cantidad']],
        body: items.map(item => [item.code, item.description, item.quantity]),
        theme: 'grid',
        headStyles: { fillColor: [90, 98, 58], textColor: 255 },
        styles: { font: 'helvetica', fontSize: 10 },
        margin: { top: 10, bottom: 20 },
      });
      
      // @ts-ignore - jspdf-autotable adds finalY to the doc object
      currentY = doc.lastAutoTable.finalY + 15;
    });
    
    doc.save('materiales_alugom.pdf');
  };

  return (
    <div className="min-h-screen bg-[#F5F5F0] text-[#3A4028] font-sans selection:bg-[#5A623A] selection:text-white flex flex-col">
      {/* Header */}
      <header className="border-b-2 border-[#3A4028] p-6 flex justify-between items-center sticky top-0 bg-[#F5F5F0] z-10">
        <div className="flex items-center gap-4">
          <Layers className="w-10 h-10 md:w-14 md:h-14 text-[#5A623A]" strokeWidth={1.5} />
          <h1 className="text-3xl md:text-5xl font-bold uppercase tracking-tighter leading-none">
            ALUGOM<br/>
            <span className="text-xl md:text-3xl font-medium tracking-normal text-[#5A623A]">EXTRACTOR DE MATERIAL</span>
          </h1>
        </div>
        <div className="hidden md:block text-right font-mono text-sm uppercase">
          <p>SISTEMA DE LECTURA PDF</p>
          <p>VERSIÓN 1.0</p>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow flex flex-col">
        {!groupedMaterials ? (
          <div className="flex-grow flex items-center justify-center p-6">
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
                className="hidden" 
              />
              <Upload className={`w-16 h-16 md:w-24 md:h-24 mb-6 ${isDragging ? 'text-[#F5F5F0]' : 'text-[#5A623A]'}`} strokeWidth={1.5} />
              <h2 className="text-2xl md:text-4xl font-bold uppercase tracking-tight text-center mb-2">
                {isDragging ? 'SUELTA EL PDF AQUÍ' : 'SUBIR ARCHIVO PDF'}
              </h2>
              <p className={`font-mono text-sm md:text-base uppercase text-center ${isDragging ? 'text-gray-400' : 'text-gray-500'}`}>
                ARRASTRA Y SUELTA O HAZ CLIC PARA SELECCIONAR
              </p>
              
              {isLoading && (
                <div className="mt-8 flex items-center space-x-3">
                  <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                  <span className="font-mono uppercase">Procesando documento...</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-grow flex flex-col md:flex-row">
            {/* Sidebar / Controls */}
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
              
              <div className="flex flex-col gap-3 mt-auto">
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
                  Subir Otro PDF
                </button>
              </div>
            </div>

            {/* Results Area */}
            <div className="flex-grow p-6 md:p-10 overflow-y-auto bg-[#EBECE7]">
              <div className="max-w-5xl mx-auto space-y-8">
                <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-tight text-[#3A4028] mb-8 print:block">
                  Verificar descarga materiales
                </h2>
                {(Object.entries(groupedMaterials) as [string, MaterialItem[]][]).map(([reference, items]) => (
                  <div key={reference} className="border-2 border-[#3A4028] bg-[#F5F5F0] shadow-[8px_8px_0px_0px_#3A4028] print:shadow-none print:border-b-2 print:border-t-0 print:border-l-0 print:border-r-0 print:mb-8">
                    {/* Header */}
                    <button 
                      onClick={() => toggleRef(reference)}
                      className="w-full flex items-center justify-between p-4 md:p-6 border-b-2 border-[#3A4028] hover:bg-white transition-colors print:border-b-2"
                    >
                      <div className="flex items-center gap-4">
                        <span className="bg-[#5A623A] text-white font-mono px-3 py-1 text-sm md:text-base flex items-center gap-2">
                          <Package className="w-4 h-4" /> PEDIDO
                        </span>
                        <h3 className="text-2xl md:text-3xl font-bold tracking-tight">
                          {reference} <span className="text-[#5A623A] ml-2">RAL:</span>
                        </h3>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-mono text-sm hidden md:inline-block">
                          {items.length} ITEM{items.length !== 1 ? 'S' : ''}
                        </span>
                        <div className="print:hidden">
                          {expandedRefs.has(reference) ? <ChevronUp className="w-6 h-6" /> : <ChevronDown className="w-6 h-6" />}
                        </div>
                      </div>
                    </button>

                    {/* Content */}
                    <AnimatePresence>
                      {expandedRefs.has(reference) && (
                        <motion.div 
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden print:!h-auto print:!opacity-100"
                        >
                          <div className="overflow-x-auto">
                            <table className="w-full text-left font-mono text-sm md:text-base whitespace-nowrap">
                              <thead className="bg-[#EBECE7] border-b-2 border-[#3A4028] uppercase">
                                <tr>
                                  <th className="p-4 font-semibold w-32 border-r-2 border-[#3A4028]">
                                    <div className="flex items-center gap-2"><Barcode className="w-4 h-4 text-[#5A623A]"/> Código</div>
                                  </th>
                                  <th className="p-4 font-semibold border-r-2 border-[#3A4028]">
                                    <div className="flex items-center gap-2"><AlignLeft className="w-4 h-4 text-[#5A623A]"/> Descripción</div>
                                  </th>
                                  <th className="p-4 font-semibold w-32 text-right">
                                    <div className="flex items-center justify-end gap-2"><Hash className="w-4 h-4 text-[#5A623A]"/> Cantidad</div>
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {items.map((item, idx) => (
                                  <tr key={idx} className="border-b border-[#3A4028]/20 last:border-0 hover:bg-white transition-colors">
                                    <td className="p-4 border-r-2 border-[#3A4028] font-medium">{item.code}</td>
                                    <td className="p-4 border-r-2 border-[#3A4028] whitespace-normal min-w-[200px]">{item.description}</td>
                                    <td className="p-4 text-right font-bold text-[#5A623A]">{item.quantity}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
