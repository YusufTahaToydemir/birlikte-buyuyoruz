// Geçici uygulama ikonları: sıcak zemin üstünde filiz. Nihai sanat gelince değiştirilir.
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'

const svg = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${pad ? 0 : 110}" fill="#FFF9F2"/>
  <circle cx="256" cy="300" r="150" fill="#F6E6EC"/>
  <path d="M256 400 C256 300 256 240 256 180" stroke="#326B50" stroke-width="22" stroke-linecap="round" fill="none"/>
  <path d="M256 250 C200 250 170 210 160 170 C210 165 250 190 256 250 Z" fill="#815266"/>
  <path d="M256 210 C312 210 342 170 352 130 C302 125 262 150 256 210 Z" fill="#E8BB60"/>
  <circle cx="256" cy="150" r="22" fill="#F4C2C2"/>
</svg>`

mkdirSync('public/icons', { recursive: true })
await sharp(Buffer.from(svg(false))).resize(192, 192).png().toFile('public/icons/icon-192.png')
await sharp(Buffer.from(svg(false))).resize(512, 512).png().toFile('public/icons/icon-512.png')
await sharp(Buffer.from(svg(true))).resize(512, 512).png().toFile('public/icons/icon-maskable-512.png')
await sharp(Buffer.from(svg(true))).resize(180, 180).png().toFile('public/icons/apple-touch-icon.png')
console.log('icons written')
