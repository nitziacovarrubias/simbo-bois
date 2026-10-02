# SIMBO API

`apps/api` es la API NestJS actual. Maneja salud, proyectos, borrador/versiones de `DesignDocument` y entradas del catálogo de módulos. Prisma conecta esta capa con PostgreSQL.

## Ejecutar

Primero prepara base y Prisma desde la raíz:

```bash
docker compose up -d
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed
```

Después:

```bash
pnpm --filter @simbo/api dev
```

La API valida el diseño recibido con los contratos compartidos. No convierte objetos Three.js en datos persistidos.
