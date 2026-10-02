import { migrateDesign, type DesignDocument } from '@simbo/design-domain';
import demoKitchen from '../../../examples/demo-kitchen.design.json';

export function createDemoDesign(): DesignDocument {
  return migrateDesign(demoKitchen);
}
