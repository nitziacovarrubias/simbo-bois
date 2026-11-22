import type {
  CuttingListResponse
} from '../../shared-contracts/src/index.ts';

export interface MaterialRate {
  materialId: string;
  thicknessMm: number;
  pricePerSquareMeterCents: number;
}

export interface QuotationCalculationInput {
  cuttingList: CuttingListResponse;
  rates: MaterialRate[];
  laborCostCents: number;
}

export interface QuotationLine {
  cuttingListRowId: string;
  name: string;
  materialId: string;
  thicknessMm: number;
  quantity: number;
  areaM2: number;
  pricePerSquareMeterCents: number;
  amountCents: number;
}

export interface QuotationCalculation {
  source: CuttingListResponse['source'];
  lines: QuotationLine[];
  materialSubtotalCents: number;
  laborCostCents: number;
  totalCents: number;
}


//Calcula los importes de una cotización a partir de un despiece y sus tarifas.
export function calculateQuotation(
  input: QuotationCalculationInput
): QuotationCalculation {
  validateEmptyCuttingList(input)
  validateLaborCost(input)
  validateCuttingListFee(input)

//@pre Existen filas válidas y tarifas para todos los materiales y grosores utilizados.

  const rateIndex = createRateIndex(input.rates)

  const lines: QuotationLine[] = []
  let materialSubtotalCents = 0

  for (const row of input.cuttingList.rows){
    if(row.widthMm <= 0 || !Number.isFinite(row.widthMm) || row.heightMm <= 0 || !Number.isFinite(row.heightMm)){
      throw new Error(`Dimensiones invalidas en la fila ${row.id}`)
    }
    if(row.quantity < 1 || !Number.isInteger(row.quantity)){
      throw new Error(`Cantidad invalida en la fila ${row.id}`)
    }
    if(!row.material || !row.material.id){
      throw new Error(`Falta el identificador de material en la fila ${row.id}`)
    }

    const rateKey = `${row.material.id}-${row.thicknessMm}`
    const pricePerSquareMeterCents = rateIndex.get(rateKey)

    if(pricePerSquareMeterCents === undefined){
      throw new Error(`Falta tarifa para el material ${row.material.id} con grosor ${row.thicknessMm}`)
    }

    const areaM2 = (row.widthMm * row.heightMm) / 1_000_000;
    const totalAreaM2 = areaM2 * row.quantity;

    const lineAmountCents = Math.round(totalAreaM2 * pricePerSquareMeterCents);

    lines.push({
      cuttingListRowId: row.id,
      name: row.name,
      materialId: row.material.id,
      thicknessMm: row.thicknessMm,
      quantity: row.quantity,
      areaM2: totalAreaM2,
      pricePerSquareMeterCents: pricePerSquareMeterCents,
      amountCents: lineAmountCents
    })

    materialSubtotalCents += lineAmountCents
  }

  const totalCents = materialSubtotalCents + input.laborCostCents;

  if (totalCents < 0 || !Number.isSafeInteger(totalCents)){
    throw new Error(`El calculo total resulto ser invalido o inseguro`)
  }

//@pre Los importes recibidos son válidos.

  return{
    source: input.cuttingList.source,
    lines,
    materialSubtotalCents,
    laborCostCents: input.laborCostCents,
    totalCents
  }
//* @post Devuelve un desglose y un total calculado.
//* @inv No modifica el despiece ni las tarifas.
//* @inv Los importes del resultado son enteros no negativos expresados en centavos.
}

export function validateCuttingListFee(
  input: QuotationCalculationInput
): void {
  if (input.rates.length === 0){
    throw new Error('No hay tarifas proporcionadas')
  }

  const notDuplicatedRates = new Set<string>();

  for (const rate of input.rates){
    if (rate.pricePerSquareMeterCents <= 0){
      throw new Error(`La tarifa para el material ${rate.materialId} debe de ser mayor a cero`)
    }

    const key = `${rate.materialId}-${rate.thicknessMm}`;
    if (notDuplicatedRates.has(key)){
      throw new Error(`Tarifa duplicada para material ${rate.materialId} con grosor ${rate.thicknessMm}`)
    }
    notDuplicatedRates.add(key)
  }

}

export function validateEmptyCuttingList(
  input: QuotationCalculationInput
): void {
  if (input.cuttingList.rows.length === 0){
    throw new Error('La lista de despiece esta vacia')
  }
}

export function validateLaborCost(
  input: QuotationCalculationInput
): void {
  if (input.laborCostCents < 0){
    throw new Error('No hay costo de mano de obra')
  }
}

function createRateIndex(rates: MaterialRate[]): Map<string,number>{
  const index = new Map<string, number>();
  for (const rate of rates){
    index.set(`${rate.materialId}-${rate.thicknessMm}`, rate.pricePerSquareMeterCents)
  }
  return index;
}