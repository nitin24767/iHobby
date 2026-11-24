@echo off
setlocal

cd /d "%~dp0"

set "APP_HOST=127.0.0.1"
set "APP_PORT=3000"
set "APP_URL=http://%APP_HOST%:%APP_PORT%"
set "DB_CONTAINER=ihobbyworld-postgres"
set "DB_PORT=5434"
set "DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:%DB_PORT%/ihobbyworld"
set "NO_PAUSE=0"
if /i "%~1"=="/nopause" set "NO_PAUSE=1"

echo.
echo iHobbyWorld launcher
echo App: %APP_URL%
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed or is not on PATH.
  if not "%NO_PAUSE%"=="1" pause
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm.cmd is not available on PATH.
  if not "%NO_PAUSE%"=="1" pause
  exit /b 1
)

where docker >nul 2>nul
if errorlevel 1 (
  echo ERROR: Docker is not installed or is not on PATH.
  if not "%NO_PAUSE%"=="1" pause
  exit /b 1
)

if not exist ".env.local" (
  echo Creating .env.local for local Docker PostgreSQL...
  > ".env.local" echo DATABASE_URL="%DATABASE_URL%"
  >> ".env.local" echo NEXT_PUBLIC_APP_URL="%APP_URL%"
  >> ".env.local" echo NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=""
  >> ".env.local" echo CLERK_SECRET_KEY=""
  >> ".env.local" echo CLERK_WEBHOOK_SECRET=""
  >> ".env.local" echo AI_PROVIDER="mock"
  >> ".env.local" echo DEEPSEEK_API_KEY=""
  >> ".env.local" echo DEEPSEEK_MODEL="deepseek-chat"
  >> ".env.local" echo GROQ_API_KEY=""
  >> ".env.local" echo GROQ_MODEL="llama-3.3-70b-versatile"
  >> ".env.local" echo HUGGINGFACE_API_KEY=""
  >> ".env.local" echo HUGGINGFACE_MODEL="openai/gpt-oss-20b"
  >> ".env.local" echo AI_REQUEST_TIMEOUT_MS="15000"
  >> ".env.local" echo STORAGE_ENDPOINT=""
  >> ".env.local" echo STORAGE_ACCESS_KEY_ID=""
  >> ".env.local" echo STORAGE_SECRET_ACCESS_KEY=""
  >> ".env.local" echo STORAGE_BUCKET=""
  >> ".env.local" echo STORAGE_REGION="auto"
  >> ".env.local" echo STORAGE_PUBLIC_URL=""
  >> ".env.local" echo SMTP_HOST=""
  >> ".env.local" echo SMTP_PORT="587"
  >> ".env.local" echo SMTP_USER=""
  >> ".env.local" echo SMTP_PASS=""
  >> ".env.local" echo SMTP_FROM=""
  >> ".env.local" echo SMTP_SECURE="false"
) else (
  echo Using existing .env.local.
)

docker inspect "%DB_CONTAINER%" >nul 2>nul
if errorlevel 1 (
  echo Creating PostgreSQL container %DB_CONTAINER%...
  docker run --name "%DB_CONTAINER%" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=ihobbyworld -p %DB_PORT%:5432 -d postgres:16
  if errorlevel 1 goto :fail
) else (
  echo Starting PostgreSQL container %DB_CONTAINER%...
  docker start "%DB_CONTAINER%" >nul
)

echo Waiting for PostgreSQL...
for /l %%i in (1,1,30) do (
  docker exec "%DB_CONTAINER%" pg_isready -U postgres -d ihobbyworld >nul 2>nul
  if not errorlevel 1 goto :db_ready
  timeout /t 2 /nobreak >nul
)
echo ERROR: PostgreSQL did not become ready.
if not "%NO_PAUSE%"=="1" pause
exit /b 1

:db_ready
echo PostgreSQL is ready.

if not exist "node_modules\next" (
  echo Installing npm dependencies...
  call npm.cmd install
  if errorlevel 1 goto :fail
)

echo Generating Prisma client...
call npm.cmd run db:generate
if errorlevel 1 goto :fail

echo Applying database migrations...
call npm.cmd run db:migrate:deploy
if errorlevel 1 goto :fail

if not exist ".next" (
  echo Building production app...
  call npm.cmd run build
  if errorlevel 1 goto :fail
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -Uri '%APP_URL%/api/health/database' -UseBasicParsing -TimeoutSec 3; if ($r.StatusCode -eq 200) { exit 0 } } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 (
  echo.
  echo iHobbyWorld is already running at %APP_URL%
  echo.
  if not "%NO_PAUSE%"=="1" pause
  exit /b 0
)

echo.
echo Starting iHobbyWorld at %APP_URL%
echo Press Ctrl+C in this window to stop the app.
echo.
call npm.cmd run start -- --hostname %APP_HOST% --port %APP_PORT%
exit /b %ERRORLEVEL%

:fail
echo.
echo ERROR: A setup command failed. Review the output above.
if not "%NO_PAUSE%"=="1" pause
exit /b 1
