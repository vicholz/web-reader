/* Web Reader — GPL-3.0-or-later. See LICENSE. */

const PALETTE = ['#6e2f2a', '#234743', '#2d3a5c', '#6a4524', '#4a3458', '#3d4a32'];

function hashHue(text) {
  let n = 0;
  for (let i = 0; i < text.length; i++) n = (n * 33 + text.charCodeAt(i)) >>> 0;
  return PALETTE[n % PALETTE.length];
}

function wrapLines(ctx, text, maxWidth) {
  const words = String(text || 'Untitled').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 5);
}

export function generatedCover(title, author) {
  const canvas = document.createElement('canvas');
  canvas.width = 360;
  canvas.height = 540;
  const ctx = canvas.getContext('2d');
  const ink = hashHue(`${title}|${author}`);
  ctx.fillStyle = ink;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(255,248,236,0.35)';
  ctx.lineWidth = 3;
  ctx.strokeRect(22, 22, canvas.width - 44, canvas.height - 44);
  const initials = String(title || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');
  ctx.fillStyle = 'rgba(255,248,236,0.92)';
  ctx.font = '600 72px Georgia, serif';
  ctx.textAlign = 'left';
  ctx.fillText(initials || '?', 44, 150);
  ctx.font = '500 28px Georgia, serif';
  const lines = wrapLines(ctx, title || 'Untitled', 270);
  lines.forEach((line, index) => ctx.fillText(line, 44, 250 + index * 38));
  if (author) {
    ctx.globalAlpha = 0.78;
    ctx.font = '400 20px Georgia, serif';
    ctx.fillText(author, 44, 480);
  }
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
}

export async function thumbnail(blob) {
  if (!blob) return null;
  try {
    const bitmap = await createImageBitmap(blob);
    const maxEdge = 420;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.84));
  } catch {
    return blob;
  }
}
