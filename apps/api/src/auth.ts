import { Body, CanActivate, Controller, createParamDecorator, ExecutionContext, Get, Inject, Injectable, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { UserRole } from '@prisma/client';
import type { Request } from 'express';
import { z } from 'zod';
import { PrismaService } from './prisma.service.js';
import { createSessionToken, hashSessionToken, verifyPassword } from './security.js';

export interface Actor { id:string; name:string; email:string; role:UserRole; }
interface AuthRequest extends Request { actor:Actor; sessionId:string; }
export const CurrentUser=createParamDecorator((_data:unknown,context:ExecutionContext):Actor=>context.switchToHttp().getRequest<AuthRequest>().actor);
const loginSchema=z.object({email:z.string().trim().email().transform(value=>value.toLowerCase()),password:z.string().min(1).max(256)}).strict();

@Injectable()
export class AuthService {
  constructor(@Inject(PrismaService) private readonly prisma:PrismaService) {}
  async login(body:unknown) {
    const parsed=loginSchema.parse(body);
    const user=await this.prisma.user.findUnique({where:{email:parsed.email}});
    if (!user?.active || !(await verifyPassword(parsed.password,user.passwordHash))) throw new UnauthorizedException('Credenciales inválidas');
    const token=createSessionToken(); const expiresAt=new Date(Date.now()+8*60*60*1000);
    await this.prisma.session.create({data:{tokenHash:hashSessionToken(token),userId:user.id,expiresAt}});
    return {token,expiresAt,user:{id:user.id,name:user.name,email:user.email,role:user.role}};
  }
  async authenticate(token:string) {
    const session=await this.prisma.session.findUnique({where:{tokenHash:hashSessionToken(token)},include:{user:true}});
    if (!session || session.expiresAt.getTime()<=Date.now() || !session.user.active) throw new UnauthorizedException('Sesión inválida o vencida');
    const {id,name,email,role}=session.user; return {actor:{id,name,email,role},sessionId:session.id};
  }
  async logout(id:string) { await this.prisma.session.deleteMany({where:{id}}); return {ok:true}; }
}
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth:AuthService) {}
  async canActivate(context:ExecutionContext):Promise<boolean> {
    const request=context.switchToHttp().getRequest<AuthRequest>();
    const token=request.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
    if (!token) throw new UnauthorizedException('Autenticación requerida');
    Object.assign(request,await this.auth.authenticate(token)); return true;
  }
}
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth:AuthService) {}
  @Post('login') login(@Body() body:unknown) { return this.auth.login(body); }
  @UseGuards(AuthGuard) @Get('me') me(@CurrentUser() actor:Actor) { return actor; }
  @UseGuards(AuthGuard) @Post('logout') logout(@Req() request:AuthRequest) { return this.auth.logout(request.sessionId); }
}
