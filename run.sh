#!/usr/bin/env bash
set -e

echo "==================================================="
echo "    AgentScope Harness + Spring Boot + AG-UI"
echo "==================================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -f "backend/target/agentscope-harness-spring-1.0.0.jar" ]; then
    echo "[1/3] 正在编译打包后端..."
    mvn -f backend/pom.xml -DskipTests clean package
fi

echo "[2/3] 启动后端服务 (http://127.0.0.1:8787)..."
java -Dfile.encoding=UTF-8 -jar backend/target/agentscope-harness-spring-1.0.0.jar &
BACKEND_PID=$!

sleep 4

echo "[3/3] 启动前端 Web UI (http://127.0.0.1:5173)..."
(cd frontend && pnpm --filter @deepagent/web dev --host 127.0.0.1 --port 5173) &
FRONTEND_PID=$!

echo ""
echo "服务已成功启动！"
echo "前端界面: http://127.0.0.1:5173"
echo "按 Ctrl+C 停止服务。"

trap "kill $BACKEND_PID $FRONTEND_PID" EXIT
wait
