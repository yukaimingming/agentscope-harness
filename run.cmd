@echo off
chcp 65001 >nul
echo ===================================================
echo     AgentScope Harness + Spring Boot + AG-UI
echo ===================================================
echo.

set "JAVA_CMD=java"
set "MAVEN_CMD=D:\temp\.tools\apache-maven-3.9.11\bin\mvn.cmd"
if not exist "%MAVEN_CMD%" set "MAVEN_CMD=mvn"

set "PROJECT_ROOT=%~dp0"
cd /d "%PROJECT_ROOT%"

echo [1/3] 检查并构建后端 Spring Boot 产物...
if not exist "backend\target\agentscope-harness-spring-1.0.0.jar" (
    echo 正在首次编译后端...
    call "%MAVEN_CMD%" -f backend\pom.xml -DskipTests clean package
    if errorlevel 1 (
        echo [错误] 后端打包失败，请检查 Maven 与 JDK 21 环境！
        pause
        exit /b 1
    )
)

echo [2/3] 启动后端服务 (http://127.0.0.1:8787)...
start "AgentScope Backend [Spring Boot]" cmd /c "cd /d "%PROJECT_ROOT%backend" && "%JAVA_CMD%" -Dfile.encoding=UTF-8 -jar target\agentscope-harness-spring-1.0.0.jar"

echo 等待后端就绪...
timeout /t 4 /nobreak >nul

echo [3/3] 启动前端 Web UI (http://127.0.0.1:5174)...
start "AgentScope Frontend [Vite + React]" cmd /c "cd /d "%PROJECT_ROOT%frontend" && pnpm --filter @deepagent/web dev --host 127.0.0.1 --port 5174"

echo.
echo ===================================================
echo   服务已全部启动：
echo   - 前端工作台: http://127.0.0.1:5174
echo   - 后端 AG-UI:  http://127.0.0.1:8787
echo ===================================================
echo.
