import React, { ChangeEvent, FormEvent, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type Project = { id: string; name?: string };
type UploadResponse = { imageUrl?: string; image_url?: string; url?: string };
type GeneratedImage = { id?: string; url?: string; imageUrl?: string; image_url?: string };
type GenerationTask = {
  id?: string;
  status?: string;
  resultImageUrls?: string[];
  result_image_urls?: string[];
  generatedImages?: GeneratedImage[];
  generated_images?: GeneratedImage[];
  errorMessage?: string;
  error_message?: string;
};
type LogEntry = { level: 'success' | 'error' | 'info'; message: string };

const defaultApiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5001';

function App() {
  const [apiBaseUrl, setApiBaseUrl] = useState(defaultApiBase);
  const [projectName, setProjectName] = useState('电商商品图测试项目');
  const [project, setProject] = useState<Project | null>(null);
  const [productImageUrl, setProductImageUrl] = useState('');
  const [providerName, setProviderName] = useState('kkone');
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
  const taskError = task?.errorMessage ?? task?.error_message;

  function addLog(level: LogEntry['level'], message: string) {
    setLogs((current) => [{ level, message }, ...current].slice(0, 8));
  }

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${normalizedBaseUrl}${path}`, init);
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error(data?.message ?? data?.error ?? `请求失败：${response.status}`);
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
      addLog('success', `项目已创建：${data.id}`);
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
      const data = await request<UploadResponse>('/uploads/product-images', { method: 'POST', body: formData });
      const imageUrl = data.imageUrl ?? data.image_url ?? data.url;
      if (!imageUrl) throw new Error('上传响应缺少图片 URL');
      setProductImageUrl(imageUrl);
      addLog('success', '商品图已上传');
      if (project?.id) await saveCanvasNode(project.id, imageUrl);
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
      body: JSON.stringify({ type: 'product_image', x: 120, y: 120, width: 320, height: 320, data: { imageUrl } }),
    });
    addLog('success', '画布节点已保存');
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
      addLog('success', '模型配置已保存');
    } catch (error) {
      addLog('error', getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function generateImages(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project?.id) return addLog('error', '请先创建项目');
    if (!productImageUrl) return addLog('error', '请先上传商品图');

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
      if (data.status === 'failed') {
        addLog('error', data.errorMessage ?? data.error_message ?? '生图失败');
      } else {
        addLog('success', `生图任务：${data.status ?? '已完成'}`);
      }
    } catch (error) {
      addLog('error', getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <main className="studio-shell">
      <aside className="left-rail">
        <div className="brand-mark">AI</div>
        {['选择', '上传', '文本', '模板', '下载'].map((item, index) => (
          <button className={index === 1 ? 'rail-button active' : 'rail-button'} key={item} type="button">
            <span>{item.slice(0, 1)}</span>
            <small>{item}</small>
          </button>
        ))}
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="title-block">
            <strong>电商 AI 无限画布</strong>
            <span>{project?.name ?? projectName}</span>
          </div>
          <div className="topbar-actions">
            <input aria-label="后端地址" value={apiBaseUrl} onChange={(event) => setApiBaseUrl(event.target.value)} />
            <button disabled={isBusy} onClick={createProject} type="button">创建项目</button>
          </div>
        </header>

        <div className="canvas-stage">
          <div className="canvas-toolbar">
            <span>100%</span>
            <span>画布模式</span>
            <span>{task?.status ? `任务 ${task.status}` : '等待生成'}</span>
          </div>

          <div className="infinite-canvas">
            {productImageUrl ? (
              <article className="art-card product-card">
                <div className="card-label">商品参考图</div>
                <img src={absoluteUrl(normalizedBaseUrl, productImageUrl)} alt="商品参考图" />
              </article>
            ) : (
              <label className="upload-dropzone">
                <input accept="image/png,image/jpeg,image/webp" type="file" onChange={uploadProductImage} />
                <span>上传商品图</span>
                <small>PNG / JPG / WebP</small>
              </label>
            )}

            {generatedImages.map((image, index) => (
              <article className="art-card result-card" key={`${image.url}-${index}`}>
                <div className="card-label">生成结果 {index + 1}</div>
                <img src={absoluteUrl(normalizedBaseUrl, image.url)} alt={`生成结果 ${index + 1}`} />
                {image.id ? (
                  <a href={`${normalizedBaseUrl}/generated-images/${image.id}/download`} target="_blank" rel="noreferrer">下载图片</a>
                ) : (
                  <a href={absoluteUrl(normalizedBaseUrl, image.url)} target="_blank" rel="noreferrer">打开图片</a>
                )}
              </article>
            ))}

            {!productImageUrl && generatedImages.length === 0 && (
              <div className="empty-hint">
                <strong>开始你的商品视觉创作</strong>
                <span>左侧上传图片，右侧配置模型和提示词后生成场景图。</span>
              </div>
            )}
          </div>
        </div>
      </section>

      <aside className="right-panel">
        <section className="panel-section">
          <div className="section-heading">
            <span>Project</span>
            <strong>项目设置</strong>
          </div>
          <label>
            项目名称
            <input value={projectName} onChange={(event) => setProjectName(event.target.value)} />
          </label>
          <div className="meta-card">{project?.id ? `ID ${project.id}` : '尚未创建项目'}</div>
        </section>

        <section className="panel-section">
          <div className="section-heading">
            <span>Upload</span>
            <strong>商品图片</strong>
          </div>
          <label className="file-picker">
            <input accept="image/png,image/jpeg,image/webp" type="file" onChange={uploadProductImage} />
            选择商品图
          </label>
          {productImageUrl && <button disabled={isBusy || !project?.id} onClick={() => project && saveCanvasNode(project.id, productImageUrl)} type="button">保存到画布</button>}
        </section>

        <section className="panel-section">
          <div className="section-heading">
            <span>Model</span>
            <strong>模型配置</strong>
          </div>
          <label>
            Provider
            <input value={providerName} onChange={(event) => setProviderName(event.target.value)} />
          </label>
          <label>
            API Endpoint
            <input value={modelApiBaseUrl} onChange={(event) => setModelApiBaseUrl(event.target.value)} />
          </label>
          <label>
            API Key
            <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="只提交给后端" />
          </label>
          <label>
            Model
            <input value={modelName} onChange={(event) => setModelName(event.target.value)} />
          </label>
          <button disabled={isBusy || !apiKey} onClick={saveModelConfig} type="button">保存模型配置</button>
        </section>

        <section className="panel-section grow">
          <div className="section-heading">
            <span>Generate</span>
            <strong>AI 生图</strong>
          </div>
          <form className="generate-form" onSubmit={generateImages}>
            <div className="inline-fields">
              <label>
                用途
                <select value={purpose} onChange={(event) => setPurpose(event.target.value)}>
                  <option>商品场景图</option>
                  <option>商品主图背景替换</option>
                  <option>广告素材探索</option>
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
            </div>
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
              数量
              <input min={1} max={4} type="number" value={count} onChange={(event) => setCount(Number(event.target.value))} />
            </label>
            <label>
              Prompt
              <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={5} />
            </label>
            <button className="primary-action" disabled={isBusy} type="submit">{isBusy ? '处理中...' : '生成商品图'}</button>
          </form>
        </section>

        <section className="panel-section logs-section">
          <div className="section-heading">
            <span>Logs</span>
            <strong>联调日志</strong>
          </div>
          {taskError && <p className="error-line">{taskError}</p>}
          {logs.length === 0 ? <p className="muted">暂无日志</p> : logs.map((log, index) => <p className={log.level} key={`${log.message}-${index}`}>{log.message}</p>)}
        </section>
      </aside>
    </main>
  );
}

function normalizeGeneratedImages(task: GenerationTask | null): Array<{ id?: string; url: string }> {
  if (!task) return [];
  const fromUrls = task.resultImageUrls ?? task.result_image_urls ?? [];
  const fromObjects = task.generatedImages ?? task.generated_images ?? [];
  return [
    ...fromUrls.map((url) => ({ url })),
    ...fromObjects.map((image) => ({ id: image.id, url: image.url ?? image.imageUrl ?? image.image_url ?? '' })).filter((image) => image.url),
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
