import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const storageRoot = path.join(root, 'storage');
export const uploadsDir = path.join(storageRoot, 'uploads');
export const generatedDir = path.join(storageRoot, 'generated');

export async function ensureStorage() {
  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.mkdir(generatedDir, { recursive: true });
}

export function publicStorageUrl(kind: 'uploads' | 'generated', filename: string) {
  return `/storage/${kind}/${filename}`;
}

export function storagePathFromUrl(url: string) {
  if (!url.startsWith('/storage/')) return null;
  const relative = url.replace('/storage/', '');
  const resolved = path.resolve(storageRoot, relative);
  if (!resolved.startsWith(storageRoot)) return null;
  return resolved;
}
