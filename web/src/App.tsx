import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Film, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { projectsApi, type Project } from '@/api/projects';
import CanvasPage from '@/canvas/CanvasPage';

/** 从 URL 读初始项目：?project=<id>（F5 后直接回到画布，不退回列表） */
function initialProjectId(): string | null {
  const p = new URLSearchParams(window.location.search).get('project');
  return p && p.length > 0 ? p : null;
}

export default function App() {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(initialProjectId);

  /* URL 与 state 保持同步：进画布写参数，回列表清参数 */
  useEffect(() => {
    const url = new URL(window.location.href);
    if (activeProjectId) {
      url.searchParams.set('project', activeProjectId);
      history.replaceState(null, '', url);
    } else if (url.searchParams.has('project')) {
      url.searchParams.delete('project');
      history.replaceState(null, '', url);
    }
  }, [activeProjectId]);

  const projectsQ = useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.list,
  });

  const qc = useQueryClient();
  const createProject = useMutation({
    mutationFn: () => projectsApi.create(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
  const deleteProject = useMutation({
    mutationFn: (id: string) => projectsApi.remove(id),
    onSuccess: (_data, deletedId) => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      if (activeProjectId === deletedId) setActiveProjectId(null);
    },
  });
  const renameProject = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      projectsApi.rename(id, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });

  if (activeProjectId) {
    const project = projectsQ.data?.find((p) => p.id === activeProjectId);
    if (project) {
      return <CanvasPage key={project.id} project={project} onBack={() => setActiveProjectId(null)} />;
    }
    /* URL 里的 project id 找不到（已删除/项目还没加载完）：
       数据加载中先等一帧；确认不存在才退回列表 */
    if (projectsQ.isLoading) {
      return <Center text="加载项目列表中…" />;
    }
    setActiveProjectId(null);
  }

  return (
    <ProjectListPage
      projects={projectsQ.data ?? []}
      isLoading={projectsQ.isLoading}
      error={projectsQ.isError ? (projectsQ.error as Error).message : null}
      onCreate={() => createProject.mutate()}
      creating={createProject.isPending}
      onDelete={(id) => {
        if (window.confirm('删除项目将连同画布内容一起删除，确定？')) {
          deleteProject.mutate(id);
        }
      }}
      onRename={(id, name) => renameProject.mutate({ id, name })}
      onOpen={setActiveProjectId}
    />
  );
}

function Center({ text }: { text: string }) {
  return (
    <div className="flex h-screen w-screen items-center justify-center text-muted-foreground">
      {text}
    </div>
  );
}

function ProjectListPage({
  projects,
  isLoading,
  error,
  onCreate,
  creating,
  onDelete,
  onRename,
  onOpen,
}: {
  projects: Project[];
  isLoading: boolean;
  error: string | null;
  onCreate: () => void;
  creating: boolean;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-background px-6 py-16 text-foreground">
      <div className="flex w-full max-w-2xl flex-col gap-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Film className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">libtv-lite</h1>
              <p className="text-xs text-muted-foreground">无限画布 · AI 视频创作</p>
            </div>
          </div>
          <Button onClick={onCreate} disabled={creating}>
            {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            新建项目
          </Button>
        </header>

        {isLoading && <p className="text-sm text-muted-foreground">加载项目列表中…</p>}
        {error && <p className="text-sm text-destructive">加载失败：{error}</p>}

        {!isLoading && !error && projects.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed py-20">
            <p className="text-sm text-muted-foreground">还没有项目</p>
            <Button variant="outline" onClick={onCreate} disabled={creating}>
              创建第一个项目
            </Button>
          </div>
        )}

        <ul className="grid grid-cols-2 gap-3">
          {projects.map((p) => (
            <li key={p.id}>
              <ProjectCard
                project={p}
                onOpen={onOpen}
                onDelete={onDelete}
                onRename={onRename}
              />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** 单个项目卡片：点卡片主体打开，双击名字改名，右上角删除 */
function ProjectCard({
  project,
  onOpen,
  onDelete,
  onRename,
}: {
  project: Project;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.name);

  const commit = () => {
    const next = draft.trim();
    if (next && next !== project.name) {
      onRename(project.id, next);
    } else {
      setDraft(project.name);
    }
    setEditing(false);
  };

  return (
    <div className="group relative flex cursor-pointer items-center rounded-xl border bg-card px-4 py-4 text-card-foreground shadow-sm transition-colors hover:border-ring">
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              setDraft(project.name);
              setEditing(false);
            }
          }}
          className="flex-1 rounded-md border bg-background px-2 py-1 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
          maxLength={50}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <button
          className="min-w-0 flex-1 text-left"
          onClick={() => onOpen(project.id)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setDraft(project.name);
            setEditing(true);
          }}
        >
          <p className="truncate font-medium">{project.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            更新于 {new Date(project.updated_at).toLocaleString('zh-CN')}
          </p>
        </button>
      )}

      {!editing && (
        <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            className="rounded-md p-2 text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground"
            title="重命名（或双击名称）"
            onClick={(e) => {
              e.stopPropagation();
              setDraft(project.name);
              setEditing(true);
            }}
          >
            <Pencil className="size-4" />
          </button>
          <button
            className="rounded-md p-2 text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
            title="删除项目"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(project.id);
            }}
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}