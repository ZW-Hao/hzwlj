import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';
import Fastify from 'fastify';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { decryptSecret, encryptSecret, keyLast4, maskSecret } from './crypto.js';
import { db, findById, id, now, removeById, type CanvasNode, type GenerationTask, type UserModelConfig } from './db.js';
import { generateImages } from './provider.js';
import { ensureStorage, publicStorageUrl, storagePathFromUrl, storageRoot, uploadsDir } from './storage.js';

const userId = 'default-user';
const nodeSchema = z.object({
  type: z.enum(['product_image', 'generated_image', 'text', 'group']),
  x: z.number().min(-100000).max(100000),
  y: z.number().min(-100000).max(100000),
  width: z.number().positive().max(100000),
  height: z.number().positive().max(100000),
  data: z.record(z.string(), z.unknown()).default({})
});

const configSchema = z.object({
  provider_name: z.string().min(1),
  api_base_url: z.string().url(),
  api_key: z.string().min(1),
  model_name: z.string().min(1),
  request_format: z.literal('generic_openai_images').default('generic_openai_images'),
  is_default: z.boolean().default(false)
});

function serializeConfig(config: UserModelConfig) {
  return {
    id: config.id,
    user_id: config.userId,
    provider_name: config.providerName,
    api_base_url: config.apiBaseUrl,
    api_key_masked: `****${config.apiKeyLast4}`,
    model_name: config.modelName,
    request_format: config.requestFormat,
    is_default: config.isDefault,
    created_at: config.createdAt,
    updated_at: config.updatedAt
  };
}

function getProject(projectId: string) {
  const project = findById(db.projects, projectId);
  if (!project || project.userId !== userId) return null;
  return project;
}

function ensureSingleDefault(configId: string) {
  db.userModelConfigs.forEach((config) => {
    if (config.userId === userId) config.isDefault = config.id === configId;
  });
}

function assertSafeProviderUrl(rawUrl: string) {
  const parsed = new URL(rawUrl);
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('unsupported_url_scheme');
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host.endsWith('.local')) {
    throw new Error('unsafe_provider_url');
  }
  return parsed.toString();
}

export async function buildServer() {
  await ensureStorage();
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  await app.register(staticPlugin, { root: storageRoot, prefix: '/storage/' });

  app.post('/projects', async (request, reply) => {
    const body = z.object({ name: z.string().min(1) }).parse(request.body);
    const timestamp = now();
    const project = { id: id(), userId, name: body.name, createdAt: timestamp, updatedAt: timestamp };
    db.projects.push(project);
    return reply.code(201).send(project);
  });

  app.get('/projects/:id', async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const project = getProject(params.id);
    if (!project) return reply.code(404).send({ error: 'project_not_found' });
    return project;
  });

  app.get('/projects/:id/canvas-nodes', async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    if (!getProject(params.id)) return reply.code(404).send({ error: 'project_not_found' });
    return db.canvasNodes.filter((node) => node.projectId === params.id);
  });

  app.post('/projects/:id/canvas-nodes', async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    if (!getProject(params.id)) return reply.code(404).send({ error: 'project_not_found' });
    const body = nodeSchema.parse(request.body);
    const timestamp = now();
    const node: CanvasNode = { id: id(), projectId: params.id, ...body, createdAt: timestamp, updatedAt: timestamp };
    db.canvasNodes.push(node);
    return reply.code(201).send(node);
  });

  app.patch('/canvas-nodes/:id', async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = nodeSchema.partial().parse(request.body);
    const node = findById(db.canvasNodes, params.id);
    if (!node || !getProject(node.projectId)) return reply.code(404).send({ error: 'node_not_found' });
    Object.assign(node, body, { updatedAt: now() });
    return node;
  });

  app.post('/uploads/product-images', async (request, reply) => {
    const file = await request.file();
    if (!file) return reply.code(400).send({ error: 'file_required' });
    const allowed: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
    const extension = allowed[file.mimetype];
    if (!extension) return reply.code(400).send({ error: 'unsupported_image_type' });
    const filename = `${id()}.${extension}`;
    await fs.writeFile(path.join(uploadsDir, filename), await file.toBuffer());
    const imageUrl = publicStorageUrl('uploads', filename);
    return reply.code(201).send({ image_url: imageUrl });
  });

  app.post('/model-configs', async (request, reply) => {
    const body = configSchema.parse(request.body);
    let apiBaseUrl: string;
    try {
      apiBaseUrl = assertSafeProviderUrl(body.api_base_url);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'invalid_provider_url' });
    }
    const timestamp = now();
    const config: UserModelConfig = {
      id: id(),
      userId,
      providerName: body.provider_name,
      apiBaseUrl,
      apiKeyEncrypted: encryptSecret(body.api_key),
      apiKeyLast4: keyLast4(body.api_key),
      modelName: body.model_name,
      requestFormat: body.request_format,
      isDefault: body.is_default || db.userModelConfigs.every((item) => item.userId !== userId),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    db.userModelConfigs.push(config);
    if (config.isDefault) ensureSingleDefault(config.id);
    app.log.info({ model_config_id: config.id, api_key: maskSecret(body.api_key) }, 'model config saved');
    return reply.code(201).send(serializeConfig(config));
  });

  app.get('/model-configs', async () => db.userModelConfigs.filter((config) => config.userId === userId).map(serializeConfig));

  app.patch('/model-configs/:id', async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = configSchema.partial().parse(request.body);
    const config = findById(db.userModelConfigs, params.id);
    if (!config || config.userId !== userId) return reply.code(404).send({ error: 'model_config_not_found' });
    if (body.provider_name) config.providerName = body.provider_name;
    if (body.api_base_url) {
      try {
        config.apiBaseUrl = assertSafeProviderUrl(body.api_base_url);
      } catch (error) {
        return reply.code(400).send({ error: error instanceof Error ? error.message : 'invalid_provider_url' });
      }
    }
    if (body.api_key) {
      config.apiKeyEncrypted = encryptSecret(body.api_key);
      config.apiKeyLast4 = keyLast4(body.api_key);
    }
    if (body.model_name) config.modelName = body.model_name;
    if (body.request_format) config.requestFormat = body.request_format;
    if (body.is_default) ensureSingleDefault(config.id);
    config.updatedAt = now();
    return serializeConfig(config);
  });

  app.delete('/model-configs/:id', async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const config = findById(db.userModelConfigs, params.id);
    if (!config || config.userId !== userId) return reply.code(404).send({ error: 'model_config_not_found' });
    removeById(db.userModelConfigs, params.id);
    return reply.code(204).send();
  });

  app.post('/model-configs/:id/default', async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const config = findById(db.userModelConfigs, params.id);
    if (!config || config.userId !== userId) return reply.code(404).send({ error: 'model_config_not_found' });
    ensureSingleDefault(config.id);
    return serializeConfig(config);
  });

  app.post('/generation-tasks', async (request, reply) => {
    const body = z.object({
      project_id: z.string(),
      model_config_id: z.string().optional(),
      input_image_url: z.string().min(1),
      prompt: z.string().min(1),
      style: z.string().optional(),
      purpose: z.string().optional(),
      aspect_ratio: z.string().default('1:1'),
      count: z.number().int().min(1).max(4).default(1)
    }).parse(request.body);
    if (!getProject(body.project_id)) return reply.code(404).send({ error: 'project_not_found' });
    const config = body.model_config_id
      ? findById(db.userModelConfigs, body.model_config_id)
      : db.userModelConfigs.find((item) => item.userId === userId && item.isDefault);
    if (!config || config.userId !== userId) return reply.code(400).send({ error: 'model_config_required' });
    const timestamp = now();
    const task: GenerationTask = {
      id: id(),
      projectId: body.project_id,
      userId,
      modelConfigId: config.id,
      modelProviderSnapshot: config.providerName,
      modelNameSnapshot: config.modelName,
      apiBaseUrlSnapshot: config.apiBaseUrl,
      requestFormatSnapshot: config.requestFormat,
      inputImageUrl: body.input_image_url,
      prompt: body.prompt,
      style: body.style,
      purpose: body.purpose,
      aspectRatio: body.aspect_ratio,
      count: body.count,
      status: 'pending' as const,
      resultImageUrls: [],
      createdAt: timestamp,
      updatedAt: timestamp
    };
    db.generationTasks.push(task);
    task.status = 'running';
    task.updatedAt = now();
    try {
      const urls = await generateImages({
        config,
        apiKey: decryptSecret(config.apiKeyEncrypted),
        prompt: body.prompt,
        inputImageUrl: body.input_image_url,
        aspectRatio: body.aspect_ratio,
        count: body.count,
        style: body.style,
        purpose: body.purpose
      });
      task.status = 'succeeded';
      task.resultImageUrls = urls;
      task.updatedAt = now();
      urls.forEach((imageUrl) => {
        db.generatedImages.push({
          id: id(),
          taskId: task.id,
          projectId: task.projectId,
          userId,
          sourceImageUrl: task.inputImageUrl,
          imageUrl,
          isFavorite: false,
          metadata: {},
          createdAt: now()
        });
      });
    } catch (error) {
      task.status = 'failed';
      task.errorMessage = error instanceof Error ? error.message.replace(/Bearer\s+\S+/g, 'Bearer ****') : 'unknown_error';
      task.updatedAt = now();
    }
    return reply.code(201).send(task);
  });

  app.get('/generation-tasks/:id', async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const task = findById(db.generationTasks, params.id);
    if (!task || task.userId !== userId) return reply.code(404).send({ error: 'generation_task_not_found' });
    return task;
  });

  app.patch('/generated-images/:id', async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ is_favorite: z.boolean() }).parse(request.body);
    const image = findById(db.generatedImages, params.id);
    if (!image || image.userId !== userId) return reply.code(404).send({ error: 'generated_image_not_found' });
    image.isFavorite = body.is_favorite;
    return image;
  });

  app.get('/generated-images/:id/download', async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const image = findById(db.generatedImages, params.id);
    if (!image || image.userId !== userId) return reply.code(404).send({ error: 'generated_image_not_found' });
    const storagePath = storagePathFromUrl(image.imageUrl);
    if (storagePath) return reply.download(storagePath);
    return reply.redirect(image.imageUrl);
  });

  return app;
}

if (process.argv[1]?.endsWith('server.js') || process.argv[1]?.endsWith('server.ts')) {
  const app = await buildServer();
  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: '0.0.0.0' });
}
