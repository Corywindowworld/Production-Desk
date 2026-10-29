import {mkdir,copyFile,readdir} from 'node:fs/promises';
await mkdir('public/report-reader',{recursive:true});
await copyFile('node_modules/pdfjs-dist/build/pdf.worker.min.mjs','public/report-reader/pdf.worker.min.mjs');
await copyFile('node_modules/tesseract.js/dist/worker.min.js','public/report-reader/worker.min.js');
for(const file of await readdir('node_modules/tesseract.js-core'))if(file.endsWith('.wasm')||file.endsWith('.wasm.js'))await copyFile('node_modules/tesseract.js-core/'+file,'public/report-reader/'+file);
await copyFile('node_modules/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz','public/report-reader/eng.traineddata.gz');
