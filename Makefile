.PHONY: dev-server dev-web dev build

# 后端开发服务
dev-server:
	cd server && .venv/Scripts/python.exe -m uvicorn main:app --reload --port 8000

# 前端开发服务
dev-web:
	cd web && npm run dev

# 同时跑前后端（两个终端手动跑也行，这个给熟悉 make 的人用）
dev:
	$(MAKE) dev-server & $(MAKE) dev-web

# 打包前端（产出 web/dist，后端启动时自动挂载）
build:
	cd web && npm run build
