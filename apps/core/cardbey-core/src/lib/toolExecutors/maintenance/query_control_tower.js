import { wrapMaintenanceExecutor } from './wrapMaintenanceExecutor.js';
import { queryControlTower } from '../../intake/controlTowerQuery.js';

export const execute = wrapMaintenanceExecutor('query_control_tower', async (_params = {}, context = {}) =>
  queryControlTower({ context }),
);
