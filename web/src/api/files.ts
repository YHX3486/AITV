interface FileRecord {
  id: string;
  kind: 'image' | 'video' | 'audio';
  path: string;
  mime: string | null;
  size: number | null;
  url: string;
}

export type UploadedFile = FileRecord;

export const filesApi = {
  /** multipart 上传；不走通用 http 包装（不是 JSON），单独用 FormData */
  async upload(file: globalThis.File): Promise<UploadedFile> {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/files', { method: 'POST', body: form });
    if (!res.ok) {
      let detail = res.statusText;
      try {
        detail = (await res.json()).detail ?? detail;
      } catch {
        /* 非 JSON 错误体，用状态码文本 */
      }
      throw new Error(detail);
    }
    return res.json();
  },
  fileUrl: (fileId: string): Promise<string> =>
    fetch(`/api/files/${fileId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('文件不存在'))))
      .then((f: FileRecord) => f.url),
};