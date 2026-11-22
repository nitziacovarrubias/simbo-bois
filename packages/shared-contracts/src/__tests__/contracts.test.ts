import { describe, it, expect } from 'vitest';
import { CreateProjectRequestSchema, RevisionRequestSchema } from '../index.ts';

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