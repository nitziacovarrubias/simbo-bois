import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient, type Prisma } from '@prisma/client';
import type { DesignDocument } from '../../packages/design-domain/src/index.ts';
import {
  QuotationCalculationSchema,
  QuotationListResponseSchema,
  QuotationResponseSchema,
  type QuotationListResponse,
  type QuotationResponse
} from '../../packages/shared-contracts/src/index.ts';
import { createApp } from '../../apps/api/src/main.js';
import { createSessionToken, hashSessionToken } from '../../apps/api/src/security.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

interface TestUser {
  id: string;
  name: string;
  email: string;
  role: 'SUPERVISOR' | 'ARCHITECT';
  token: string;
}

interface HttpResult<T = unknown> {
  status: number;
  body: T;
}

/**
 * Valid QuotationCalculationSchema fixture matching @simbo/shared-contracts.
 */
function buildSampleCalculationJson(
  projectId: string,
  versionId: string,
  revision: number
): Prisma.InputJsonValue {
  const payload = {
    source: {
      projectId,
      designVersionId: versionId,
      revision
    },
    lines: [
      {
        cuttingListRowId: 'row-mel-16-wht',
        name: 'Lateral Izquierdo',
        materialId: 'mat-mel-16-wht',
        thicknessMm: 16,
        quantity: 2,
        areaM2: 2.5,
        pricePerSquareMeterCents: 45000,
        amountCents: 112500
      }
    ],
    materialSubtotalCents: 112500,
    laborCostCents: 35000,
    totalCents: 147500
  };

  return QuotationCalculationSchema.parse(payload) as Prisma.InputJsonValue;
}

describe(
  'CU06-01 — Registro de aprobación y rechazo de cotizaciones',
  { skip: !testDatabaseUrl },
  () => {
    let app: INestApplication;
    let baseUrl: string;
    let prisma: PrismaClient;

    let supervisor: TestUser;
    let secondSupervisor: TestUser;
    let architect: TestUser;
    let outsiderArchitect: TestUser;

    const createdUserIds: string[] = [];
    const createdProjectIds: string[] = [];

    async function apiRequest<T = unknown>(
      method: 'GET' | 'POST',
      path: string,
      token?: string,
      body?: unknown
    ): Promise<HttpResult<T>> {
      const response = await fetch(`${baseUrl}/api${path}`, {
        method,
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {})
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      });

      const parsed = (await response.json().catch(() => ({}))) as T;
      return { status: response.status, body: parsed };
    }

    async function createTestUser(
      role: 'SUPERVISOR' | 'ARCHITECT',
      label: string
    ): Promise<TestUser> {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const user = await prisma.user.create({
        data: {
          email: `cu06-${label}-${suffix}@simbo.test`,
          name: `Test ${label}`,
          passwordHash: 'integration-test-hash',
          role,
          active: true
        }
      });
      createdUserIds.push(user.id);

      const token = createSessionToken();
      await prisma.session.create({
        data: {
          tokenHash: hashSessionToken(token),
          userId: user.id,
          expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000)
        }
      });

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        token
      };
    }

    /**
     * Creates a project owned by the architect, ensures a positive revision
     * (required by QuotationSummarySchema / QuotationCalculationSourceSchema),
     * creates and approves a current DesignVersion, and seeds a PENDING Quotation.
     */
    async function createProjectWithPendingQuotation(namePrefix = 'CU06 Project') {
      const createProjectRes = await apiRequest<{ id: string }>(
        'POST',
        '/projects',
        architect.token,
        { name: `${namePrefix} ${Date.now()}` }
      );
      assert.equal(createProjectRes.status, 201);
      const projectId = createProjectRes.body.id;
      createdProjectIds.push(projectId);

      const designRes = await apiRequest<{ design: DesignDocument; revision: number }>(
        'GET',
        `/projects/${projectId}/design`,
        architect.token
      );
      assert.equal(designRes.status, 200);

      let design = designRes.body.design;
      let currentRevision = designRes.body.revision;

      if (currentRevision < 1) {
        const initialDesign: DesignDocument = structuredClone(design);
        initialDesign.metadata.name = `${initialDesign.metadata.name} (v1)`;
        const initialSaveRes = await apiRequest<{ revision: number }>(
          'POST',
          `/projects/${projectId}/design`,
          architect.token,
          { design: initialDesign, expectedRevision: currentRevision }
        );
        assert.equal(initialSaveRes.status, 201);
        currentRevision = initialSaveRes.body.revision;
        design = initialDesign;
      }

      const createVersionRes = await apiRequest<{ id: string; revision: number }>(
        'POST',
        `/projects/${projectId}/versions`,
        architect.token,
        { expectedRevision: currentRevision }
      );
      assert.equal(createVersionRes.status, 201);
      const versionId = createVersionRes.body.id;
      const revision = createVersionRes.body.revision;

      const approveVersionRes = await apiRequest(
        'POST',
        `/projects/${projectId}/versions/${versionId}/approve`,
        supervisor.token,
        { expectedRevision: revision }
      );
      assert.equal(approveVersionRes.status, 201);

      const quotation = await prisma.quotation.create({
        data: {
          projectId,
          versionId,
          revision,
          createdById: supervisor.id,
          materialSubtotalCents: 112500,
          laborCostCents: 35000,
          totalCents: 147500,
          calculationJson: buildSampleCalculationJson(projectId, versionId, revision)
        }
      });

      return {
        projectId,
        versionId,
        revision,
        design,
        quotation
      };
    }

    /**
     * Adds a new PENDING quotation to an existing approved current version.
     */
    async function createPendingQuotationForVersion(
      projectId: string,
      versionId: string,
      revision: number
    ) {
      return prisma.quotation.create({
        data: {
          projectId,
          versionId,
          revision,
          createdById: supervisor.id,
          materialSubtotalCents: 112500,
          laborCostCents: 35000,
          totalCents: 147500,
          calculationJson: buildSampleCalculationJson(projectId, versionId, revision)
        }
      });
    }

    before(async () => {
      process.env.DATABASE_URL = testDatabaseUrl;
      prisma = new PrismaClient({
        datasources: { db: { url: testDatabaseUrl } }
      });
      await prisma.$connect();

      app = await createApp();
      await app.listen(0, '127.0.0.1');
      const address = app.getHttpServer().address();
      const port = typeof address === 'string' ? 3001 : address.port;
      baseUrl = `http://127.0.0.1:${port}`;

      supervisor = await createTestUser('SUPERVISOR', 'supervisor-1');
      secondSupervisor = await createTestUser('SUPERVISOR', 'supervisor-2');
      architect = await createTestUser('ARCHITECT', 'architect-owner');
      outsiderArchitect = await createTestUser('ARCHITECT', 'architect-outsider');
    });

    after(async () => {
      if (prisma) {
        if (createdProjectIds.length > 0) {
          await prisma.quotation.deleteMany({
            where: { projectId: { in: createdProjectIds } }
          });
          await prisma.project.deleteMany({
            where: { id: { in: createdProjectIds } }
          });
        }
        if (createdUserIds.length > 0) {
          await prisma.session.deleteMany({
            where: { userId: { in: createdUserIds } }
          });
          await prisma.user.deleteMany({
            where: { id: { in: createdUserIds } }
          });
        }
        await prisma.$disconnect();
      }
      if (app) {
        await app.close();
      }
    });

    it('starts every new quotation in PENDING with null decision metadata', async () => {
      const { projectId, quotation } = await createProjectWithPendingQuotation('Initial Pending');

      const detailRes = await apiRequest<QuotationResponse>(
        'GET',
        `/projects/${projectId}/quotations/${quotation.id}`,
        supervisor.token
      );

      assert.equal(detailRes.status, 200);
      const parsed = QuotationResponseSchema.parse(detailRes.body);
      assert.equal(parsed.decisionStatus, 'PENDING');
      assert.equal(parsed.decidedAt, null);
      assert.equal(parsed.decidedById, null);
      assert.equal(parsed.decidedByName ?? null, null);
    });

    it('TDD-015: approves a pending current quotation, persists decision, and preserves amounts and design integrity', async () => {
      const { projectId, versionId, quotation } =
        await createProjectWithPendingQuotation('TDD-015 Approve');

      const beforeDesign = await apiRequest<{ design: DesignDocument; revision: number }>(
        'GET',
        `/projects/${projectId}/design`,
        supervisor.token
      );
      const beforeVersion = await prisma.designVersion.findUniqueOrThrow({
        where: { id: versionId }
      });

      const res = await apiRequest<QuotationResponse>(
        'POST',
        `/projects/${projectId}/quotations/${quotation.id}/decision`,
        supervisor.token,
        { decision: 'APPROVED' }
      );

      assert.equal(res.status, 200);
      const decided = QuotationResponseSchema.parse(res.body);
      assert.equal(decided.decisionStatus, 'APPROVED');
      assert.equal(decided.decidedById, supervisor.id);
      assert.equal(decided.decidedByName, supervisor.name);
      assert.notEqual(decided.decidedAt, null);
      assert.equal(Number.isNaN(Date.parse(decided.decidedAt!)), false);

      // Amounts and metadata integrity
      assert.equal(decided.materialSubtotalCents, quotation.materialSubtotalCents);
      assert.equal(decided.laborCostCents, quotation.laborCostCents);
      assert.equal(decided.totalCents, quotation.totalCents);
      assert.equal(decided.versionId, quotation.versionId);
      assert.equal(decided.revision, quotation.revision);
      assert.equal(decided.createdById, quotation.createdById);
      assert.equal(decided.createdAt, quotation.createdAt.toISOString());

      // Persisted in detail and list endpoints
      const detailRes = await apiRequest<QuotationResponse>(
        'GET',
        `/projects/${projectId}/quotations/${quotation.id}`,
        supervisor.token
      );
      assert.equal(detailRes.status, 200);
      const detailParsed = QuotationResponseSchema.parse(detailRes.body);
      assert.equal(detailParsed.decisionStatus, 'APPROVED');
      assert.equal(detailParsed.decidedAt, decided.decidedAt);
      assert.equal(detailParsed.decidedById, supervisor.id);

      const listRes = await apiRequest<QuotationListResponse>(
        'GET',
        `/projects/${projectId}/quotations`,
        supervisor.token
      );
      assert.equal(listRes.status, 200);
      const listParsed = QuotationListResponseSchema.parse(listRes.body);
      const listed = listParsed.find(item => item.id === quotation.id);
      assert.ok(listed);
      assert.equal(listed.decisionStatus, 'APPROVED');
      assert.equal(listed.decidedById, supervisor.id);

      // DesignDocument and DesignVersion remain unmodified
      const afterDesign = await apiRequest<{ design: DesignDocument; revision: number }>(
        'GET',
        `/projects/${projectId}/design`,
        supervisor.token
      );
      const afterVersion = await prisma.designVersion.findUniqueOrThrow({
        where: { id: versionId }
      });
      assert.equal(afterDesign.body.revision, beforeDesign.body.revision);
      assert.deepEqual(afterDesign.body.design, beforeDesign.body.design);
      assert.equal(afterVersion.approvalStatus, beforeVersion.approvalStatus);
      assert.equal(
        afterVersion.approvedAt?.toISOString(),
        beforeVersion.approvedAt?.toISOString()
      );
    });

    it('rejects a pending current quotation and persists the REJECTED state', async () => {
      const { projectId, quotation } = await createProjectWithPendingQuotation('Reject Flow');

      const res = await apiRequest<QuotationResponse>(
        'POST',
        `/projects/${projectId}/quotations/${quotation.id}/decision`,
        supervisor.token,
        { decision: 'REJECTED' }
      );

      assert.equal(res.status, 200);
      const decided = QuotationResponseSchema.parse(res.body);
      assert.equal(decided.decisionStatus, 'REJECTED');
      assert.equal(decided.decidedById, supervisor.id);
      assert.equal(decided.decidedByName, supervisor.name);
      assert.notEqual(decided.decidedAt, null);
      assert.equal(decided.totalCents, quotation.totalCents);

      const persisted = await prisma.quotation.findUniqueOrThrow({
        where: { id: quotation.id }
      });
      assert.equal(persisted.decisionStatus, 'REJECTED');
      assert.equal(persisted.decidedById, supervisor.id);
      assert.notEqual(persisted.decidedAt, null);
    });

    it('TDD-016: forbids ARCHITECT from deciding on a quotation (HTTP 403) while allowing read access', async () => {
      const { projectId, quotation } = await createProjectWithPendingQuotation('TDD-016 Permissions');

      // Architect with access can read quotations
      const readRes = await apiRequest<QuotationResponse>(
        'GET',
        `/projects/${projectId}/quotations/${quotation.id}`,
        architect.token
      );
      assert.equal(readRes.status, 200);
      QuotationResponseSchema.parse(readRes.body);

      // Architect cannot approve or reject
      const decideRes = await apiRequest(
        'POST',
        `/projects/${projectId}/quotations/${quotation.id}/decision`,
        architect.token,
        { decision: 'APPROVED' }
      );
      assert.equal(decideRes.status, 403);

      const persisted = await prisma.quotation.findUniqueOrThrow({
        where: { id: quotation.id }
      });
      assert.equal(persisted.decisionStatus, 'PENDING');
      assert.equal(persisted.decidedAt, null);
      assert.equal(persisted.decidedById, null);
    });

    it('returns HTTP 401 for unauthenticated requests', async () => {
      const { projectId, quotation } = await createProjectWithPendingQuotation('Unauthenticated');

      const res = await apiRequest(
        'POST',
        `/projects/${projectId}/quotations/${quotation.id}/decision`,
        undefined,
        { decision: 'APPROVED' }
      );
      assert.equal(res.status, 401);
    });

    it('blocks users without project access and returns HTTP 404 for inaccessible or missing quotations', async () => {
      const { projectId, quotation } = await createProjectWithPendingQuotation('Access Control');

      const outsiderListRes = await apiRequest(
        'GET',
        `/projects/${projectId}/quotations`,
        outsiderArchitect.token
      );
      assert.equal(outsiderListRes.status, 404);

      const outsiderDetailRes = await apiRequest(
        'GET',
        `/projects/${projectId}/quotations/${quotation.id}`,
        outsiderArchitect.token
      );
      assert.equal(outsiderDetailRes.status, 404);

      const missingQuotationRes = await apiRequest(
        'POST',
        `/projects/${projectId}/quotations/non-existent-quotation-id/decision`,
        supervisor.token,
        { decision: 'APPROVED' }
      );
      assert.equal(missingQuotationRes.status, 404);
    });

    it('returns HTTP 400 for invalid decision payloads and keeps quotation PENDING', async () => {
      const { projectId, quotation } = await createProjectWithPendingQuotation('Invalid Payload');

      const invalidEnumRes = await apiRequest(
        'POST',
        `/projects/${projectId}/quotations/${quotation.id}/decision`,
        supervisor.token,
        { decision: 'PENDING' }
      );
      assert.equal(invalidEnumRes.status, 400);

      const extraFieldRes = await apiRequest(
        'POST',
        `/projects/${projectId}/quotations/${quotation.id}/decision`,
        supervisor.token,
        { decision: 'APPROVED', decidedById: secondSupervisor.id }
      );
      assert.equal(extraFieldRes.status, 400);

      const emptyBodyRes = await apiRequest(
        'POST',
        `/projects/${projectId}/quotations/${quotation.id}/decision`,
        supervisor.token,
        {}
      );
      assert.equal(emptyBodyRes.status, 400);

      const persisted = await prisma.quotation.findUniqueOrThrow({
        where: { id: quotation.id }
      });
      assert.equal(persisted.decisionStatus, 'PENDING');
    });

    it('TDD-017: handles duplicate APPROVED requests idempotently without changing original timestamp or decider', async () => {
      const { projectId, quotation } =
        await createProjectWithPendingQuotation('TDD-017 Duplicate Approve');

      const firstRes = await apiRequest<QuotationResponse>(
        'POST',
        `/projects/${projectId}/quotations/${quotation.id}/decision`,
        supervisor.token,
        { decision: 'APPROVED' }
      );
      assert.equal(firstRes.status, 200);
      const first = QuotationResponseSchema.parse(firstRes.body);

      const secondRes = await apiRequest<QuotationResponse>(
        'POST',
        `/projects/${projectId}/quotations/${quotation.id}/decision`,
        secondSupervisor.token,
        { decision: 'APPROVED' }
      );
      assert.equal(secondRes.status, 200);
      const second = QuotationResponseSchema.parse(secondRes.body);
      assert.equal(second.decisionStatus, 'APPROVED');
      assert.equal(second.decidedAt, first.decidedAt);
      assert.equal(second.decidedById, supervisor.id);
      assert.equal(second.totalCents, quotation.totalCents);
    });

    it('handles duplicate REJECTED requests idempotently without changing original timestamp or decider', async () => {
      const { projectId, quotation } = await createProjectWithPendingQuotation('Duplicate Reject');

      const firstRes = await apiRequest<QuotationResponse>(
        'POST',
        `/projects/${projectId}/quotations/${quotation.id}/decision`,
        supervisor.token,
        { decision: 'REJECTED' }
      );
      assert.equal(firstRes.status, 200);
      const first = QuotationResponseSchema.parse(firstRes.body);

      const secondRes = await apiRequest<QuotationResponse>(
        'POST',
        `/projects/${projectId}/quotations/${quotation.id}/decision`,
        secondSupervisor.token,
        { decision: 'REJECTED' }
      );
      assert.equal(secondRes.status, 200);
      const second = QuotationResponseSchema.parse(secondRes.body);
      assert.equal(second.decisionStatus, 'REJECTED');
      assert.equal(second.decidedAt, first.decidedAt);
      assert.equal(second.decidedById, supervisor.id);
    });

    it('returns HTTP 409 on contradictory decisions (APPROVED -> REJECTED and REJECTED -> APPROVED)', async () => {
      // Case 1: APPROVED -> REJECTED
      const approvedCase = await createProjectWithPendingQuotation('Conflict Approved To Rejected');
      const approveRes = await apiRequest<QuotationResponse>(
        'POST',
        `/projects/${approvedCase.projectId}/quotations/${approvedCase.quotation.id}/decision`,
        supervisor.token,
        { decision: 'APPROVED' }
      );
      assert.equal(approveRes.status, 200);

      const conflictRejectRes = await apiRequest(
        'POST',
        `/projects/${approvedCase.projectId}/quotations/${approvedCase.quotation.id}/decision`,
        supervisor.token,
        { decision: 'REJECTED' }
      );
      assert.equal(conflictRejectRes.status, 409);

      const stillApproved = await prisma.quotation.findUniqueOrThrow({
        where: { id: approvedCase.quotation.id }
      });
      assert.equal(stillApproved.decisionStatus, 'APPROVED');
      assert.equal(stillApproved.decidedAt?.toISOString(), approveRes.body.decidedAt);

      // Case 2: REJECTED -> APPROVED
      const rejectedCase = await createProjectWithPendingQuotation('Conflict Rejected To Approved');
      const rejectRes = await apiRequest<QuotationResponse>(
        'POST',
        `/projects/${rejectedCase.projectId}/quotations/${rejectedCase.quotation.id}/decision`,
        supervisor.token,
        { decision: 'REJECTED' }
      );
      assert.equal(rejectRes.status, 200);

      const conflictApproveRes = await apiRequest(
        'POST',
        `/projects/${rejectedCase.projectId}/quotations/${rejectedCase.quotation.id}/decision`,
        supervisor.token,
        { decision: 'APPROVED' }
      );
      assert.equal(conflictApproveRes.status, 409);

      const stillRejected = await prisma.quotation.findUniqueOrThrow({
        where: { id: rejectedCase.quotation.id }
      });
      assert.equal(stillRejected.decisionStatus, 'REJECTED');
      assert.equal(stillRejected.decidedAt?.toISOString(), rejectRes.body.decidedAt);
    });

    it('returns HTTP 409 for a pending quotation tied to an outdated design version, while preserving already decided historical quotations', async () => {
      const { projectId, versionId, revision, design, quotation: pendingQuotation } =
        await createProjectWithPendingQuotation('Outdated Version');

      // Create and approve a second quotation while the version is still current
      const decidedQuotation = await createPendingQuotationForVersion(projectId, versionId, revision);
      const approveHistoricalRes = await apiRequest<QuotationResponse>(
        'POST',
        `/projects/${projectId}/quotations/${decidedQuotation.id}/decision`,
        supervisor.token,
        { decision: 'APPROVED' }
      );
      assert.equal(approveHistoricalRes.status, 200);

      // Mutate the project draft so the approved version is no longer current
      const updatedDesign: DesignDocument = structuredClone(design);
      updatedDesign.metadata.name = `${updatedDesign.metadata.name} (Modified)`;

      const saveRes = await apiRequest<{ revision: number }>(
        'POST',
        `/projects/${projectId}/design`,
        architect.token,
        { design: updatedDesign, expectedRevision: revision }
      );
      assert.equal(saveRes.status, 201);
      assert.equal(saveRes.body.revision, revision + 1);

      // Pending quotation from outdated version cannot be approved or rejected
      const outdatedApproveRes = await apiRequest(
        'POST',
        `/projects/${projectId}/quotations/${pendingQuotation.id}/decision`,
        supervisor.token,
        { decision: 'APPROVED' }
      );
      assert.equal(outdatedApproveRes.status, 409);

      const outdatedRejectRes = await apiRequest(
        'POST',
        `/projects/${projectId}/quotations/${pendingQuotation.id}/decision`,
        supervisor.token,
        { decision: 'REJECTED' }
      );
      assert.equal(outdatedRejectRes.status, 409);

      const persistedPending = await prisma.quotation.findUniqueOrThrow({
        where: { id: pendingQuotation.id }
      });
      assert.equal(persistedPending.decisionStatus, 'PENDING');

      // Previously decided quotation retains its APPROVED state
      const historicalDetailRes = await apiRequest<QuotationResponse>(
        'GET',
        `/projects/${projectId}/quotations/${decidedQuotation.id}`,
        supervisor.token
      );
      assert.equal(historicalDetailRes.status, 200);
      const historical = QuotationResponseSchema.parse(historicalDetailRes.body);
      assert.equal(historical.decisionStatus, 'APPROVED');
      assert.equal(historical.decidedAt, approveHistoricalRes.body.decidedAt);
    });

    it('prevents contradictory overwrites under simultaneous decision requests', async () => {
      const { projectId, quotation } = await createProjectWithPendingQuotation('Concurrent Decisions');

      const [approveRes, rejectRes] = await Promise.all([
        apiRequest<QuotationResponse>(
          'POST',
          `/projects/${projectId}/quotations/${quotation.id}/decision`,
          supervisor.token,
          { decision: 'APPROVED' }
        ),
        apiRequest<QuotationResponse>(
          'POST',
          `/projects/${projectId}/quotations/${quotation.id}/decision`,
          secondSupervisor.token,
          { decision: 'REJECTED' }
        )
      ]);

      const statuses = [approveRes.status, rejectRes.status].sort((a, b) => a - b);
      assert.deepEqual(statuses, [200, 409]);

      const persisted = await prisma.quotation.findUniqueOrThrow({
        where: { id: quotation.id }
      });
      const winner = QuotationResponseSchema.parse(
        approveRes.status === 200 ? approveRes.body : rejectRes.body
      );
      assert.equal(persisted.decisionStatus, winner.decisionStatus);
      assert.equal(persisted.decidedById, winner.decidedById);
      assert.equal(persisted.decidedAt?.toISOString(), winner.decidedAt);
    });
  }
);