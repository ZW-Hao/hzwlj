import { randomUUID } from 'node:crypto';

export type Project = {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type CanvasNode = {
  id: string;
  projectId: string;
  type: 'product_image' | 'generated_image' | 'text' | 'group';
  x: number;
  y: number;
  width: number;
  height: number;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type UserModelConfig = {
  id: string;
  userId: string;
  providerName: string;
  apiBaseUrl: string;
  apiKeyEncrypted: string;
  apiKeyLast4: string;
  modelName: string;
  requestFormat: 'generic_openai_images';
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type GenerationTask = {
  id: string;
  projectId: string;
  userId: string;
  modelConfigId: string;
  modelProviderSnapshot: string;
  modelNameSnapshot: string;
  apiBaseUrlSnapshot: string;
  requestFormatSnapshot: string;
  inputImageUrl: string;
  prompt: string;
  style?: string;
  purpose?: string;
  aspectRatio: string;
  count: number;
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  resultImageUrls: string[];
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
};

export type GeneratedImage = {
  id: string;
  taskId: string;
  projectId: string;
  userId: string;
  sourceImageUrl: string;
  imageUrl: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  isFavorite: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
};

type TableName = 'projects' | 'canvasNodes' | 'userModelConfigs' | 'generationTasks' | 'generatedImages';

export const db: {
  projects: Project[];
  canvasNodes: CanvasNode[];
  userModelConfigs: UserModelConfig[];
  generationTasks: GenerationTask[];
  generatedImages: GeneratedImage[];
} = {
  projects: [],
  canvasNodes: [],
  userModelConfigs: [],
  generationTasks: [],
  generatedImages: []
};

export function now() {
  return new Date().toISOString();
}

export function id() {
  return randomUUID();
}

export function findById<T extends { id: string }>(table: T[], rowId: string) {
  return table.find((row) => row.id === rowId);
}

export function removeById(table: { id: string }[], rowId: string) {
  const index = table.findIndex((row) => row.id === rowId);
  if (index === -1) return false;
  table.splice(index, 1);
  return true;
}

export function clearDb() {
  (Object.keys(db) as TableName[]).forEach((key) => {
    db[key].length = 0;
  });
}
