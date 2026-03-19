import fs from 'fs';
import { JSDOM } from 'jsdom';
const rawHtml = fs.readFileSync('tauri_page.html', 'utf8');

const doc = new JSDOM(rawHtml).window.document;
const remove = ['nav', 'header', 'footer', 'aside', 'script', 'style', '.sidebar', '.navbar', '.footer', '.toc', '[data-pagefind-ignore]'];
remove.forEach(sel => {
  doc.querySelectorAll(sel).forEach(el => el.remove());
});

const main = doc.querySelector('main') ?? doc.querySelector('article') ?? doc.querySelector('.content') ?? doc.querySelector('#content') ?? doc.body;

console.log(main ? main.innerHTML.substring(0, 500) : 'NULL');
