@echo off
setlocal
if "%1"=="" goto help
if "%1"=="dev" goto dev
if "%1"=="test" goto test
if "%1"=="lint" goto lint
if "%1"=="ingest" goto ingest
if "%1"=="golden" goto golden
if "%1"=="openapi" goto openapi
if "%1"=="docker-up" goto docker_up
if "%1"=="vercel-reqs" goto vercel_reqs
echo Unknown target: %1
exit /b 1

:help
echo Available targets: dev, test, lint, ingest, golden, openapi, docker-up, vercel-reqs
exit /b 0

:dev
echo Starting development servers...
echo Backend: uvicorn app.main:app --reload --port 8000
echo Frontend: npm run dev
exit /b 0

:test
echo Running backend tests...
cd backend && call .venv\Scripts\pytest.exe
set TEST_STATUS=%ERRORLEVEL%
cd ..
if %TEST_STATUS% neq 0 exit /b %TEST_STATUS%
echo Running frontend tests...
cd frontend && npm run test
set FE_STATUS=%ERRORLEVEL%
cd ..
exit /b %FE_STATUS%

:lint
echo Linting backend...
cd backend
call .venv\Scripts\ruff.exe check app tests
if %ERRORLEVEL% neq 0 ( cd .. & exit /b %ERRORLEVEL% )
call .venv\Scripts\ruff.exe format --check app tests
if %ERRORLEVEL% neq 0 ( cd .. & exit /b %ERRORLEVEL% )
call .venv\Scripts\mypy.exe app tests
if %ERRORLEVEL% neq 0 ( cd .. & exit /b %ERRORLEVEL% )
cd ..
echo Linting frontend...
cd frontend
call npm run lint
if %ERRORLEVEL% neq 0 ( cd .. & exit /b %ERRORLEVEL% )
call npm run typecheck
if %ERRORLEVEL% neq 0 ( cd .. & exit /b %ERRORLEVEL% )
cd ..
exit /b 0

:ingest
echo Ingesting Elexon data...
cd backend
call .venv\Scripts\python.exe -m app.ingest.cli --from 2025-12-01 --to 2026-01-31 --out data/snapshot
set INGEST_STATUS=%ERRORLEVEL%
cd ..
exit /b %INGEST_STATUS%

:golden
echo Regenerating API golden contract files...
call backend\.venv\Scripts\python.exe scripts\generate_golden.py
set GOLDEN_STATUS=%ERRORLEVEL%
exit /b %GOLDEN_STATUS%

:openapi
echo Exporting OpenAPI JSON schema...
call backend\.venv\Scripts\python.exe scripts\export_openapi.py
set OPENAPI_STATUS=%ERRORLEVEL%
exit /b %OPENAPI_STATUS%

:docker_up
echo not implemented yet
exit /b 0

:vercel_reqs
echo not implemented yet
exit /b 0
