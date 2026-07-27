import { businessPhase2Blocker } from './_shared.js';

export const update_order = { execute: businessPhase2Blocker('update_order') };
export const transfer_inventory = { execute: businessPhase2Blocker('transfer_inventory') };
export const refund_order = { execute: businessPhase2Blocker('refund_order') };
export const close_shift = { execute: businessPhase2Blocker('close_shift') };
export const open_shift = { execute: businessPhase2Blocker('open_shift') };
export const create_supplier = { execute: businessPhase2Blocker('create_supplier') };
export const create_purchase_order = { execute: businessPhase2Blocker('create_purchase_order') };
export const receive_purchase_order = { execute: businessPhase2Blocker('receive_purchase_order') };
export const apply_discount = { execute: businessPhase2Blocker('apply_discount') };
export const apply_tax = { execute: businessPhase2Blocker('apply_tax') };
export const assign_table = { execute: businessPhase2Blocker('assign_table') };
export const move_table = { execute: businessPhase2Blocker('move_table') };
export const merge_order = { execute: businessPhase2Blocker('merge_order') };
export const split_bill = { execute: businessPhase2Blocker('split_bill') };
