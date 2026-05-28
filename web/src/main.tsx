import React, { ChangeEvent, FormEvent, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type Project = {
  id: string;
  name?: string;
};

type UploadResponse = {
  imageUrl?: string;
  image_url?: string;
  url?: string;
};

type GenerationTask = {
  id?: string;
  status?: string;
  resultImageUrls?: string[];
  result_image_urls?: string[];
  generatedImages?: GeneratedImage[];
  generated_images?: GeneratedImage[];
};

type GeneratedImage = {
  id?: string;
  url?: string;
  imageUrl?: string;
  image_url?: string;
};

type LogEntry = {
  level: 'success' | 'error' | 'info';
  message: string;
};

const defaultApiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

function App() {
  const [apiBaseUrl, setApiBaseUrl] = useState(defaultApiBase);
  const [projectName, setProjectName] = useState('电商商品图测试项目');
  const [project, setProject] = useState<Project | null>(null);
  const [productImageUrl, setProductImageUrl] = useState('');
  const [providerName, setProviderName] = useState('openai_images');
  const [modelApiBaseUrl, setModelApiBaseUrl] = useState('https://api.kkone.vip/v1/images/generations');
  const [apiKey, setApiKey] = useState('');
  const [modelName, setModelName] = useState('gpt-image-2');
  const [purpose, setPurpose] = useState('商品场景图');
  const [style, setStyle] = useState('高级电商海报风');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [count, setCount] = useState(2);
  const [prompt, setPrompt] = useState('保留商品主体，生成适合电商详情页的高质感真实场景图');
  const [task, setTask] = useState<GenerationTask | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isBusy, setIsBusy] = useState(false);

  const normalizedBaseUrl = useMemo(() => apiBaseUrl.replace(/\/$/, ''), [apiBaseUrl]);
  const generatedImages = useMemo(() => normalizeGeneratedImages(task), [task]);

  function addLog(level: LogEntry['level'], message: string) {
    setLogs((current) => [{ level, message }, ...current].slice(0, 8));
  }

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${normalizedBaseUrl}${path}`, init);
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error(data?.message ?? data?.error ?? `请求失败：${response.status}`);
    }
    return data as T;
  }

  async function createProject() {
    setIsBusy(true);
    try {
      const data = await request<Project>('/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: projectName }),
      });
      setProject(data);
      addLog('success', `已创建/选择项目：${data.id}`);
    } catch (error) {
      addLog('error', getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function uploadProductImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsBusy(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const data = await request<UploadResponse>('/uploads/product-images', {
        method: 'POST',
        body: formData,
      });
      const imageUrl = data.imageUrl ?? data.image_url ?? data.url;
      if (!imageUrl) throw new Error('上传响应缺少图片 URL');
      setProductImageUrl(imageUrl);
      addLog('success', '商品图上传成功');

      if (project?.id) {
        await saveCanvasNode(project.id, imageUrl);
      }
    } catch (error) {
      addLog('error', getErrorMessage(error));
    } finally {
      setIsBusy(false);
      event.target.value = '';
    }
  }

  async function saveCanvasNode(projectId: string, imageUrl: string) {
    await request(`/projects/${projectId}/canvas-nodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'product_image',
        x: 80,
        y: 80,
        width: 280,
        height: 280,
        data: { imageUrl },
      }),
    });
    addLog('success', '已保存商品图画布节点');
  }

  async function saveModelConfig() {
    setIsBusy(true);
    try {
      await request('/model-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_name: providerName,
          api_base_url: modelApiBaseUrl,
          api_key: apiKey,
          model_name: modelName,
          is_default: true,
        }),
      });
      setApiKey('');
      addLog('success', '模型配置已提交，前端未保存 API Key');
    } catch (error) {
      addLog('error', getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function generateImages(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project?.id) {
      addLog('error', '请先创建项目');
      return;
    }
    if (!productImageUrl) {
      addLog('error', '请先上传商品图');
      return;
    }

    setIsBusy(true);
    try {
      const data = await request<GenerationTask>('/generation-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: project.id,
          input_image_url: productImageUrl,
          prompt,
          purpose,
          style,
          aspect_ratio: aspectRatio,
          count,
        }),
      });
      setTask(data);
      addLog('success', `生图任务已返回：${data.status ?? data.id ?? '已完成'}`);
    } catch (error) {
      addLog('error', getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">E-commerce AI Canvas MVP</p>
          <h1>电商 AI 无限画布测试台</h1>
          <p>按后端 P0 API 跑通项目、上传、画布节点、模型配置、生图、展示和下载闭环。</p>
        </div>
        <label className="api-base">
          后端地址
          <input value={apiBaseUrl} onChange={(event) => setApiBaseUrl(event.target.value)} />
        </label>
      </header>

      <section className="grid">
        <section className="panel">
          <h2>1. 项目与商品图</h2>
          <label>
            项目名称
            <input value={projectName} onChange={(event) => setProjectName(event.target.value)} />
          </label>
          <button disabled={isBusy} onClick={createProject}>创建/选择项目</button>
          <div className="status-card">当前项目：{project?.id ?? '未创建'}</div>

          <label>
            上传商品图（PNG/JPG/WebP）
            <input accept="image/png,image/jpeg,image/webp" type="file" onChange={uploadProductImage} />
          </label>
          {productImageUrl && (
            <div className="image-card">
              <img src={absoluteUrl(normalizedBaseUrl, productImageUrl)} alt="上传的商品图" />
              <span>{productImageUrl}</span>
            </div>
          )}
        </section>

        <section className="panel">
          <h2>2. 模型配置</h2>
          <label>
            Provider
            <input value={providerName} onChange={(event) => setProviderName(event.target.value)} />
          </label>
          <label>
            API Base URL
            <input value={modelApiBaseUrl} onChange={(event) => setModelApiBaseUrl(event.target.value)} />
          </label>
          <label>
            API Key
            <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="只提交给后端，前端不持久化" />
          </label>
          <label>
            Model
            <input value={modelName} onChange={(event) => setModelName(event.target.value)} />
          </label>
          <button disabled={isBusy || !apiKey} onClick={saveModelConfig}>保存默认模型配置</button>
        </section>

        <section className="panel wide">
          <h2>3. 发起生图</h2>
          <form className="generation-form" onSubmit={generateImages}>
            <label>
              用途
              <select value={purpose} onChange={(event) => setPurpose(event.target.value)}>
                <option>商品场景图</option>
                <option>商品主图背景替换</option>
                <option>广告素材探索</option>
              </select>
            </label>
            <label>
              风格
              <select value={style} onChange={(event) => setStyle(event.target.value)}>
                <option>高级电商海报风</option>
                <option>小红书种草风</option>
                <option>极简高级感风</option>
                <option>节日大促风</option>
              </select>
            </label>
            <label>
              比例
              <select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)}>
                <option>1:1</option>
                <option>4:3</option>
                <option>3:4</option>
                <option>16:9</option>
              </select>
            </label>
            <label>
              数量
              <input min={1} max={8} type="number" value={count} onChange={(event) => setCount(Number(event.target.value))} />
            </label>
            <label className="full-row">
              Prompt
              <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={4} />
            </label>
            <button disabled={isBusy} type="submit">生成图片</button>
          </form>
        </section>
      </section>

      <section className="canvas-panel">
        <div className="section-title">
          <h2>4. 结果画布</h2>
          <span>任务：{task?.id ?? '暂无'} {task?.status ? `· ${task.status}` : ''}</span>
        </div>
        <div className="canvas">
          {productImageUrl && (
            <article className="canvas-node source-node">
              <strong>商品参考图</strong>
              <img src={absoluteUrl(normalizedBaseUrl, productImageUrl)} alt="商品参考图节点" />
            </article>
          )}
          {generatedImages.map((image, index) => (
            <article className="canvas-node" key={`${image.url}-${index}`}>
              <strong>生成图 {index + 1}</strong>
              <img src={absoluteUrl(normalizedBaseUrl, image.url)} alt={`生成结果 ${index + 1}`} />
              {image.id ? (
                <a href={`${normalizedBaseUrl}/generated-images/${image.id}/download`} target="_blank" rel="noreferrer">下载单图</a>
              ) : (
                <a href={absoluteUrl(normalizedBaseUrl, image.url)} target="_blank" rel="noreferrer">打开图片 URL</a>
              )}
            </article>
          ))}
          {!productImageUrl && generatedImages.length === 0 && <p className="empty">完成左侧步骤后，这里会展示商品图与生成结果。</p>}
        </div>
      </section>

      <section className="panel logs">
        <h2>联调日志</h2>
        {logs.length === 0 ? <p>暂无请求日志。</p> : logs.map((log, index) => <p className={log.level} key={`${log.message}-${index}`}>{log.message}</p>)}
      </section>
    </main>
  );
}

function normalizeGeneratedImages(task: GenerationTask | null): Array<{ id?: string; url: string }> {
  if (!task) return [];
  const fromUrls = task.resultImageUrls ?? task.result_image_urls ?? [];
  const fromObjects = task.generatedImages ?? task.generated_images ?? [];

  return [
    ...fromUrls.map((url) => ({ url })),
    ...fromObjects
      .map((image) => ({ id: image.id, url: image.url ?? image.imageUrl ?? image.image_url ?? '' }))
      .filter((image) => image.url),
  ];
}

function absoluteUrl(baseUrl: string, url: string) {
  if (/^https?:\/\//.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return url;
  return `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '未知错误';
}

createRoot(document.getElementById('root')!).render(<App />);
