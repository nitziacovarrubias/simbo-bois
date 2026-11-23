import { describe, it, expect } from 'vitest';
import { CreateProjectRequestSchema, UpdateProjectRequestSchema, RevisionRequestSchema } from '../index.ts';

describe('Shared Contracts Suite', () => {
  describe('CreateProjectRequestSchema', () => {
    it('acepta solicitudes con nombres de proyecto válidos', () => {
      const validPayload = { name: 'Cocina Integral San Carlos' };
      const result = CreateProjectRequestSchema.safeParse(validPayload);
      
      expect(result.success).toBe(true);
    });

    it('rechaza nombres de proyecto vacíos', () => {
      const invalidPayload = { name: '' };
      const result = CreateProjectRequestSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
    });
  });

  describe('Detalles de proyectos', () => {
    it('acepta el nuevo formulario de creación', () => {
      const result=CreateProjectRequestSchema.safeParse({
        name:'Cocina centro',projectType:'KITCHEN',clientName:'Ana Pérez',
        location:'Hermosillo',description:'Acabado nogal',responsibleId:'usuario-1'
      });
      expect(result.success).toBe(true);
    });
    it('mantiene compatibilidad con clientes que envían únicamente el nombre', () => {
      expect(CreateProjectRequestSchema.safeParse({name:'Proyecto anterior'}).success).toBe(true);
    });
    it('rechaza tipos desconocidos y descripciones demasiado largas', () => {
      expect(CreateProjectRequestSchema.safeParse({name:'X',projectType:'BATHROOM'}).success).toBe(false);
      expect(CreateProjectRequestSchema.safeParse({name:'X',description:'x'.repeat(1001)}).success).toBe(false);
    });
    it('permite editar metadatos sin enviar DesignDocument', () => {
      expect(UpdateProjectRequestSchema.safeParse({clientName:'Nuevo cliente'}).success).toBe(true);
      expect(UpdateProjectRequestSchema.safeParse({}).success).toBe(false);
      expect(UpdateProjectRequestSchema.safeParse({name:''}).success).toBe(false);
    });
  });

  describe('RevisionRequestSchema', () => {
    it('cumple el contrato cuando expectedRevision es no negativa', () => {
      const validPayload = { expectedRevision: 0 };
      const result = RevisionRequestSchema.safeParse(validPayload);

      expect(result.success).toBe(true);
    });

    it('falla cuando expectedRevision es negativa', () => {
      const invalidPayload = { expectedRevision: -5 };
      const result = RevisionRequestSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
    });
  });
});