import { build } from 'esbuild';
import { copyFile } from 'node:fs/promises';
await copyFile('index.html','public/index.html');
await build({stdin:{contents:"export * from '@netlify/identity';",resolveDir:process.cwd()},bundle:true,platform:'browser',format:'esm',outfile:'public/assets/identity.js',minify:true});
