import { promises as fs } from 'node:fs';
import path from 'node:path';
import { generatedDir, publicStorageUrl } from './storage.js';
import type { UserModelConfig } from './db.js';

type GenerateInput = {
  config: UserModelConfig;
  apiKey: string;
  prompt: string;
  inputImageUrl: string;
  aspectRatio: string;
  count: number;
  style?: string;
  purpose?: string;
};

function sizeFromAspectRatio(aspectRatio: string) {
  const map: Record<string, string> = {
    '1:1': '1024x1024',
    '4:3': '1024x768',
    '3:4': '768x1024',
    '16:9': '1024x576',
    '9:16': '576x1024'
  };
  return map[aspectRatio] ?? '1024x1024';
}

async function persistDataUrl(dataUrl: string, index: number) {
  const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
  if (!match) return null;
  return persistBase64Image(match[2], match[1] === 'jpeg' ? 'jpg' : match[1], index);
}

async function persistBase64Image(base64: string, extension: string, index: number) {
  const filename = `${Date.now()}-${index}.${extension}`;
  await fs.writeFile(path.join(generatedDir, filename), Buffer.from(base64, 'base64'));
  return publicStorageUrl('generated', filename);
}

export function generationEndpoint(apiBaseUrl: string) {
  const url = new URL(apiBaseUrl);
  if (url.pathname.endsWith('/images/generations')) return url.toString();
  return new URL('images/generations', `${url.toString().replace(/\/$/, '')}/`).toString();
}

export async function generateImages(input: GenerateInput) {
  const endpoint = generationEndpoint(input.config.apiBaseUrl);
  const prompt = [input.prompt, input.purpose, input.style].filter(Boolean).join('\n');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: input.config.modelName,
      prompt,
      n: input.count,
      size: sizeFromAspectRatio(input.aspectRatio),
      response_format: 'url',
      input_image_url: input.inputImageUrl
    }),
    signal: AbortSignal.timeout(180_000)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`provider_request_failed:${response.status}:${body.slice(0, 300)}`);
  }

  const payload = (await response.json()) as { data?: Array<{ url?: string; b64_json?: string }> };
  const urls: string[] = [];
  for (const [index, item] of (payload.data ?? []).entries()) {
    if (item.url?.startsWith('data:image/')) {
      const saved = await persistDataUrl(item.url, index);
      if (saved) urls.push(saved);
    } else if (item.url) {
      urls.push(item.url);
    }
    if (item.b64_json) {
      const saved = await persistBase64Image(item.b64_json, 'png', index);
      if (saved) urls.push(saved);
    }
  }
  return urls;
}
