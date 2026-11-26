import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateQuotation } from '../packages/quotation-engine/src/index.ts';
import type { QuotationCalculationInput } from '../packages/quotation-engine/src/index.ts';

export const validQuotationInput = {
  cuttingList: {
    source: {
      projectId: 'project-001',
      designVersionId: 'version-001',
      revision: 1
    },
    rows: [
      {
        id: 'row-001',
        name: 'Panel lateral',
        widthMm: 1000,
        heightMm: 500,
        thicknessMm: 18,
        material: {
          id: 'material-mdf-18',
          name: 'MDF'
        },
        grainDirection: 'HORIZONTAL',
        quantity: 1,
        origins: [
          {
            partId: 'part-001',
            assemblyPath: ['assembly-001']
          }
        ]
      }
    ]
  },
  rates: [
    {
      materialId: 'material-mdf-18',
      thicknessMm: 18,
      pricePerSquareMeterCents: 200000
    }
  ],
  laborCostCents: 50000
} satisfies QuotationCalculationInput;




test('Calculo correcto de cotizacion', () => {
  const result = calculateQuotation(validQuotationInput);

  console.table(result.lines);
  console.log('Totales:', { 
    material: result.materialSubtotalCents, 
    labor: result.laborCostCents, 
    total: result.totalCents 
  });

  assert.equal(result.materialSubtotalCents, 100000); 
  assert.equal(result.laborCostCents, 50000);
  assert.equal(result.totalCents, 150000);
});

test('Tarifa faltante en la lista de despiece',()=>{
  const input = {
    ...validQuotationInput,
    rates: []
  };

  assert.throws(
    () => calculateQuotation(input),  /No hay tarifas proporcionadas/
  )

})

test('Lista vacia de despiece',()=>{
  const input = {
    ...validQuotationInput,
    cuttingList: {
      ...validQuotationInput.cuttingList,
      rows: []
    }
  }

  assert.throws(
    () => calculateQuotation(input), /La lista de despiece esta vacia/
  )
})