import { afterEach, describe, expect, it } from 'vitest';
import { clearDb, db } from '../src/db.js';
import { buildServer } from '../src/server.js';

afterEach(() => clearDb());

describe('commerce AI canvas backend', () => {
  it('creates projects, canvas nodes, and masked model configs', async () => {
    const app = await buildServer();
    const projectResponse = await app.inject({ method: 'POST', url: '/projects', payload: { name: 'Demo' } });
    expect(projectResponse.statusCode).toBe(201);
    const project = projectResponse.json();

    const nodeResponse = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/canvas-nodes`,
      payload: { type: 'product_image', x: 0, y: 0, width: 300, height: 300, data: { image_url: '/storage/uploads/a.png' } }
    });
    expect(nodeResponse.statusCode).toBe(201);

    const configResponse = await app.inject({
      method: 'POST',
      url: '/model-configs',
      payload: {
        provider_name: 'OpenAI compatible',
        api_base_url: 'https://images.example.com',
        api_key: 'sk-test-123456',
        model_name: 'image-model',
        is_default: true
      }
    });
    expect(configResponse.statusCode).toBe(201);
    expect(configResponse.json().api_key_masked).toBe('****3456');
    expect(JSON.stringify(configResponse.json())).not.toContain('sk-test');
    expect(db.userModelConfigs[0].apiKeyEncrypted).not.toContain('sk-test');
    await app.close();
  });

  it('rejects unsafe provider urls', async () => {
    const app = await buildServer();
    const response = await app.inject({
      method: 'POST',
      url: '/model-configs',
      payload: { provider_name: 'local', api_base_url: 'http://localhost:9999', api_key: 'secret', model_name: 'model' }
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});
