#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { xml2js } from 'xml-js';
import { generateFA1 } from './src/lib-public/FA1-generator';
import { generateFA2 } from './src/lib-public/FA2-generator';
import { generateFA3 } from './src/lib-public/FA3-generator';
import { Faktura as Faktura1 } from './src/lib-public/types/fa1.types';
import { Faktura as Faktura2 } from './src/lib-public/types/fa2.types';
import { Faktura as Faktura3 } from './src/lib-public/types/fa3.types';
import { AdditionalDataTypes } from './src/lib-public/types/common.types';

// Helper function to extract KSeF number from filename
function extractNrKSeFFromFilename(filename: string): string | null {
  // KSeF number format: XXXXXXXXXX-YYYYMMDD-XXXXXXXXXXXXXX-XX
  // Example: 5555555555-20250808-9231003CA67B-BE
  const ksefPattern = /(\d{10}-\d{8}-[A-Z0-9]{12,16}-[A-Z0-9]{2})/i;
  const match = filename.match(ksefPattern);
  return match ? match[1] : null;
}

// Helper function to strip XML prefixes
function stripPrefixes<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj.map(stripPrefixes) as T;
  } else if (typeof obj === 'object' && obj !== null) {
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]: [string, T]): [string, T] => [
        key.includes(':') ? key.split(':')[1] : key,
        stripPrefixes(value),
      ])
    ) as T;
  }
  return obj;
}

// Parse XML from file path (Node.js version)
function parseXMLFromFile(filePath: string): unknown {
  const xmlStr = readFileSync(filePath, 'utf-8');
  const jsonDoc = stripPrefixes(xml2js(xmlStr, { compact: true }));
  return jsonDoc;
}

// Main CLI function
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Użycie: generate-pdf.exe -- [opcje] <plik-xml>

Opcje:
  -o, --output <plik>     Ścieżka do wyjściowego pliku PDF (domyślnie: faktura.pdf)
  -h, --help              Pokaż tę pomoc

Uwagi:
  - Numer KSeF jest automatycznie wykrywany z nazwy pliku XML
    Format: <nip>-<data>-<hash>-<kod>.xml (np. 5555555555-20250808-9231003CA67B-BE.xml)
  - Jeśli numer nie zostanie znaleziony, użyta zostanie wartość "BRAK"

Przykład:
  generate-pdf.exe -- 5555555555-20250808-9231003CA67B-BE.xml
  generate-pdf.exe -- assets/invoice.xml -o output.pdf
    `);
    process.exit(0);
  }

  let inputFile: string | null = null;
  let outputFile = 'faktura.pdf';

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '-o' || arg === '--output') {
      outputFile = args[++i];
    } else if (!arg.startsWith('-')) {
      inputFile = arg;
    }
  }

  if (!inputFile) {
    console.error('❌ Błąd: Musisz podać plik XML wejściowy');
    console.error('Użyj --help aby zobaczyć instrukcje');
    process.exit(1);
  }

  // Auto-detect KSeF number from filename
  const detectedNrKSeF = extractNrKSeFFromFilename(inputFile);
  const nrKSeF = detectedNrKSeF || 'BRAK';
  
  if (detectedNrKSeF) {
    console.log(`🔍 Wykryto numer KSeF z nazwy pliku: ${nrKSeF}`);
  } else {
    console.log(`ℹ️  Nie wykryto numeru KSeF w nazwie pliku, używam: "BRAK"`);
  }

  try {
    console.log(`📄 Parsowanie XML: ${inputFile}`);
    const xml: unknown = parseXMLFromFile(resolve(inputFile));
    const wersja: any = (xml as any)?.Faktura?.Naglowek?.KodFormularza?._attributes?.kodSystemowy;

    if (!wersja) {
      console.error('❌ Błąd: Nie można określić wersji faktury (FA1/FA2/FA3)');
      process.exit(1);
    }

    console.log(`📋 Wersja faktury: ${wersja}`);

    const additionalData: AdditionalDataTypes = {
      nrKSeF
    };

    console.log(`🔧 Generowanie PDF...`);

    return new Promise((resolvePromise, reject) => {
      let pdf;

      switch (wersja) {
        case 'FA (1)':
          pdf = generateFA1((xml as any).Faktura as Faktura1, additionalData);
          break;
        case 'FA (2)':
          pdf = generateFA2((xml as any).Faktura as Faktura2, additionalData);
          break;
        case 'FA (3)':
          pdf = generateFA3((xml as any).Faktura as Faktura3, additionalData);
          break;
        default:
          console.error(`❌ Nieobsługiwana wersja faktury: ${wersja}`);
          process.exit(1);
      }

      pdf.getBuffer((buffer: Buffer) => {
        try {
          writeFileSync(resolve(outputFile), buffer);
          console.log(`✅ PDF wygenerowany pomyślnie: ${resolve(outputFile)}`);
          resolvePromise(null);
        } catch (error) {
          console.error('❌ Błąd podczas zapisu PDF:', error);
          reject(error);
        }
      });
    });

  } catch (error) {
    console.error('❌ Błąd:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Nieoczekiwany błąd:', error);
  process.exit(1);
});
