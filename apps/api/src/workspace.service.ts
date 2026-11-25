import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Actor } from './auth.js';
import { PrismaService } from './prisma.service.js';
import { hashPassword } from './security.js';
import {
  ClientRequestSchema,
  CreateUserRequestSchema,
  UpdateUserAccessRequestSchema,
} from '@simbo/shared-contracts';

@Injectable()
export class WorkspaceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  private clientWhere(actor: Actor): Prisma.ClientWhereInput {
    if (actor.role === 'SUPERVISOR' || actor.role === 'ARCHITECT') return {};
    return {
      projects: {
        some:
          actor.role === 'ARCHITECT'
            ? { OR: [{ ownerId: actor.id }, { responsibleId: actor.id }] }
            : { collaborators: { some: { userId: actor.id } } },
      },
    };
  }
  listClients(actor: Actor) {
    const accessibleProjects: Prisma.ProjectWhereInput =
      actor.role === 'SUPERVISOR'
        ? {}
        : actor.role === 'ARCHITECT'
          ? { OR: [{ ownerId: actor.id }, { responsibleId: actor.id }] }
          : { collaborators: { some: { userId: actor.id } } };
    return this.prisma.client.findMany({
      where: this.clientWhere(actor),
      include: {
        projects: {
          where: accessibleProjects,
          select: { id: true, name: true, stage: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' },
        },
      },
      orderBy: { name: 'asc' },
    });
  }
  async createClient(actor: Actor, body: unknown) {
    if (actor.role === 'COLLABORATOR')
      throw new ForbiddenException('No tienes permisos para registrar clientes');
    const input = ClientRequestSchema.parse(body);
    return this.prisma.client.create({
      data: {
        name: input.name,
        phone: input.phone || null,
        email: input.email || null,
        address: input.address || null,
        placeId: input.placeId || null,
        taxId: input.taxId || null,
      },
    });
  }
  async updateClient(actor: Actor, id: string, body: unknown) {
    if (actor.role !== 'SUPERVISOR')
      throw new ForbiddenException('Solo el Supervisor puede editar clientes');
    const input = ClientRequestSchema.parse(body);
    const previous = await this.prisma.client.findUnique({ where: { id } });
    if (!previous) throw new NotFoundException('Cliente no encontrado');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.client.update({
        where: { id },
        data: {
          name: input.name,
          phone: input.phone || null,
          email: input.email || null,
          address: input.address || null,
          placeId: input.placeId || null,
          taxId: input.taxId || null,
          active: input.active ?? previous.active,
        },
      });
      // Mantener el campo heredado para consumidores anteriores sin tocar los diseños.
      if (previous.name !== updated.name)
        await tx.project.updateMany({
          where: { clientId: id },
          data: { clientName: updated.name },
        });
      return updated;
    });
  }
  async listUsers(actor: Actor) {
    if (actor.role !== 'SUPERVISOR')
      throw new ForbiddenException('Solo el Supervisor puede gestionar accesos');
    return this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
      },
      orderBy: { name: 'asc' },
    });
  }
  async createUser(actor: Actor, body: unknown) {
    if (actor.role !== 'SUPERVISOR')
      throw new ForbiddenException('Solo el Supervisor puede crear cuentas');
    const input = CreateUserRequestSchema.parse(body);
    const taken = await this.prisma.user.findFirst({
      where: { OR: [{ email: input.email }, { username: input.username }] },
      select: { id: true },
    });
    if (taken) throw new ConflictException('El usuario o correo ya existe');
    try {
      return await this.prisma.user.create({
        data: {
          name: input.name,
          username: input.username,
          email: input.email,
          passwordHash: await hashPassword(input.password),
          role: input.role,
          active: true,
        },
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
          role: true,
          active: true,
          createdAt: true,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error as { code?: string }).code === 'P2002'
      )
        throw new ConflictException('El usuario o correo ya existe');
      throw error;
    }
  }
  async updateUserAccess(actor: Actor, id: string, body: unknown) {
    if (actor.role !== 'SUPERVISOR')
      throw new ForbiddenException('Solo el Supervisor puede gestionar accesos');
    const input = UpdateUserAccessRequestSchema.parse(body);
    if (id === actor.id && !input.active)
      throw new UnprocessableEntityException('No puedes desactivar tu propia cuenta');
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('Usuario no encontrado');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { active: input.active },
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
          role: true,
          active: true,
          createdAt: true,
        },
      });
      if (!input.active) await tx.session.deleteMany({ where: { userId: id } });
      return updated;
    });
  }
}
