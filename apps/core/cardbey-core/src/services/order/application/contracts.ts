import type { OrderActorContext } from '../domain/orderRoles';
import type { OrderChannel, OrderStatus } from '../domain/orderStatus';
import type { Order, OrderCancelRequest, OrderItemSnapshot, OrderStatusEvent } from '../domain/orderTypes';

export type OrderAllowedAction =
  | 'request_cancel'
  | 'seller_cancel'
  | 'accept_cancel'
  | 'deny_cancel'
  | 'change_status';

export interface OrderListItem {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  channel: OrderChannel;
  createdAt: string;
  updatedAt: string;
  totalAmount: number;
  currency: string;
  buyerUserId: string;
  sellerUserId: string | null;
  sellerStoreId: string | null;
}

export interface OrderDetail extends Order {
  items: OrderItemSnapshot[];
  cancelRequest: OrderCancelRequest | null;
  statusHistory: OrderStatusEvent[];
  allowedActions: OrderAllowedAction[];
  allowedNextStatuses: OrderStatus[];
}

export interface BrowseSellerOrdersInput {
  sellerUserId: string;
  sellerStoreId?: string | null;
  channel?: OrderChannel | null;
  status?: OrderStatus | null;
  page?: number;
  pageSize?: number;
}

export interface BrowseBuyerOrdersInput {
  buyerUserId: string;
  channel?: OrderChannel | null;
  status?: OrderStatus | null;
  page?: number;
  pageSize?: number;
}

export interface ReadOrderByIdInput {
  orderId: string;
  actor: OrderActorContext;
}

export interface OrderSummaryInput {
  sellerUserId?: string | null;
  buyerUserId?: string | null;
  channel?: OrderChannel | null;
  from?: string | null;
  to?: string | null;
}

export interface OrdersDashboardInput {
  sellerUserId?: string | null;
  buyerUserId?: string | null;
  channel?: OrderChannel | null;
}

export interface QueryPage<T> {
  items: T[];
  totalItems: number;
  totalPages: number;
  page: number;
  pageSize: number;
}

export interface OrderSummary {
  totalOrders: number;
  openOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  totalRevenue: number;
  currency: string | null;
}

export interface OrdersDashboard {
  byStatus: Record<string, number>;
  byChannel: Record<string, number>;
  recentOrders: OrderListItem[];
  summary: OrderSummary;
}

export interface OrderCommandResult<TOrder = unknown> {
  ok: boolean;
  code:
    | 'ok'
    | 'not_found'
    | 'forbidden'
    | 'invalid_state'
    | 'invalid_transition'
    | 'validation_error'
    | 'conflict'
    | 'not_implemented';
  message: string;
  order: TOrder | null;
  eventId?: string | null;
  auditEventId?: string | null;
  cancelRequestId?: string | null;
  allowedActions?: OrderAllowedAction[];
  allowedNextStatuses?: OrderStatus[];
}

export interface OrderMutationInput {
  orderId: string;
  actor: OrderActorContext;
  reason?: string | null;
}

export interface ChangeSellerOrderStatusInput extends OrderMutationInput {
  nextStatus: OrderStatus;
}

