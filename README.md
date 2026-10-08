# SIMBO

**SIMBO** es una plataforma web desarrollada para BOIS Cocinas y Closets que facilita el diseño de cocinas y closets utilizando medidas reales. La idea es que todo el proyecto se construya a partir de un mismo modelo de diseño, permitiendo trabajar de forma más ordenada y mantener la información del proyecto consistente durante todo el proceso.

## Cómo iniciar el proyecto

Para ejecutar SIMBO localmente necesitas tener instalado:

- Node.js 22.18 o superior
- pnpm 9.15.4
- Docker Desktop
- Git

### 1. Instalar dependencias

Desde la raíz del proyecto:

```bash
pnpm install --frozen-lockfile
```

### 2. Crear el archivo `.env`

Si todavía no tienes un `.env`, crea una copia de `.env.example`.

En PowerShell:

```powershell
Copy-Item .env.example .env
```

Después agrega las credenciales locales del Supervisor:

```env
BOOTSTRAP_SUPERVISOR_EMAIL="supervisor@simbo.local"
BOOTSTRAP_SUPERVISOR_PASSWORD="SimboSupervisor2026!"
```

La contraseña debe tener al menos 12 caracteres.

> No subir el archivo `.env` al repositorio.

### 3. Iniciar la base de datos

Asegúrate de tener Docker Desktop abierto y ejecuta:

```bash
docker compose up -d
```

Puedes comprobar que PostgreSQL está funcionando con:

```bash
docker compose ps
```

### 4. Preparar Prisma

Ejecuta:

```bash
pnpm exec prisma validate
pnpm prisma:generate
pnpm prisma:migrate
```

### 5. Crear los datos iniciales

```bash
pnpm prisma:seed
```

Esto crea los datos iniciales y el usuario Supervisor configurado en el `.env`.

### 6. Iniciar SIMBO

```bash
pnpm dev
```

Después abre:

```text
http://localhost:5173
```

La API normalmente estará disponible en:

```text
http://localhost:3001
```

### Resumen rápido

Cuando el proyecto ya está configurado y solo quieres volver a iniciarlo:

```bash
docker compose up -d
pnpm dev
```

Si acabas de descargar cambios que incluyen nuevas dependencias o migraciones, ejecuta:

```bash
pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm prisma:migrate
pnpm dev
```

---

