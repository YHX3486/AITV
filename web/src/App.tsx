import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Film, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { projectsApi, type Project } from '@/api/projects';
import CanvasPage from '@/canvas/CanvasPage';

export default function App() {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

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

  if (activeProjectId) {
    const project = projectsQ.data?.find((p) => p.id === activeProjectId);
    if (project) {
      return (
        <CanvasPage
        key={project.id}
        project={project}
        onBack={()=> setActiveProjectId(null)}/>
      );
    }
    // 数据还在加载就先回列表，加载完再进
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
      onOpen={setActiveProjectId}
    />
  );
}

function ProjectListPage({
  projects,
  isLoading,
  error,
  onCreate,
  creating,
  onDelete,
  onOpen,
}: {
  projects: Project[];
  isLoading: boolean;
  error: string | null;
  onCreate: () => void;
  creating: boolean;
  onDelete: (id: string) => void;
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
              <div className="group flex cursor-pointer items-center justify-between rounded-xl border bg-card px-4 py-4 text-card-foreground shadow-sm transition-colors hover:border-ring">
                <button className="flex-1 text-left" onClick={() => onOpen(p.id)}>
                  <p className="font-medium">{p.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    更新于 {new Date(p.updated_at).toLocaleString('zh-CN')}
                  </p>
                </button>
                <button
                  className="rounded-md p-2 text-muted-foreground/50 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                  title="删除项目"
                  onClick={() => onDelete(p.id)}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}