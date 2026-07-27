#!/usr/bin/env node
/**
 * Export System Observation registry baseline counts for docs sync.
 * Usage: node scripts/exportSystemObservationBaseline.mjs
 */
import { COMPONENT_REGISTRY } from '../src/lib/systemObservation/componentRegistry.js';
import { computeDocBaselineFromRegistry } from '../src/lib/systemObservation/probes/deepProbes.js';

const baseline = computeDocBaselineFromRegistry(COMPONENT_REGISTRY);

const byLayer = COMPONENT_REGISTRY.reduce((acc, entry) => {
  acc[entry.layer] = acc[entry.layer] || [];
  acc[entry.layer].push({ id: entry.id, name: entry.name, docStatus: entry.docStatus, probe: entry.probe });
  return acc;
}, /** @type {Record<string, unknown[]>} */ ({}));

const output = {
  generatedAt: new Date().toISOString(),
  componentCount: COMPONENT_REGISTRY.length,
  docBaseline: baseline,
  byLayer,
};

console.log(JSON.stringify(output, null, 2));
